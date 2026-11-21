// Tests des actions sécurisées (solde, admin, données) avec faux Firestore et faux stockage.
import assert from 'node:assert/strict';
const mem = new Map();
globalThis.__AB_TEST_AUTH_STORE = { async get(k) { return mem.has(k) ? JSON.parse(mem.get(k)) : null; }, async setJSON(k, v) { mem.set(k, JSON.stringify(v)); }, async delete(k) { mem.delete(k); } };
globalThis.__AB_TEST_EXTRA_STORE = globalThis.__AB_TEST_AUTH_STORE;
const fs = {
  users: [
    { id: 'adm', name: 'Admin', email: 'admin@x.com', isAdmin: true, balance: 0, referralCode: 'ADM' },
    { id: 'u1', name: 'Awa', email: 'awa@x.com', balance: 5000, referralCode: 'AWA', referredBy: 'adm' },
    { id: 'u2', name: 'Bob', email: 'bob@x.com', balance: 100, referralCode: 'BOB' },
  ],
  orders: [{ id: 'O1', userId: 'u1', amount: 800, payMethod: 'balance', status: 'processing' }, { id: 'O2', userId: 'u2', amount: 300, payMethod: 'saspay', status: 'processing' }],
  deposits: [{ id: 'D1', userId: 'u2', amount: 2000, status: 'pending' }, { id: 'D2', userId: 'u1', amount: 1, status: 'pending' }],
  promoCodes: [{ code: 'PROMO10', percent: 10 }, { code: 'OLD', percent: 50, expiresAt: '2000-01-01' }],
  siteConfig: { minDeposit: 500 }, visitorCount: 4, packs: [],
};
const ver = {};
globalThis.fetch = async (url, init = {}) => {
  url = String(url); const key = url.split('/afriboost/')[1].split('?')[0]; const q = new URL(url).searchParams;
  const R = (s, b) => new Response(JSON.stringify(b), { status: s });
  if (!init.method || init.method === 'GET') { if (!(key in fs)) return R(404, {}); return R(200, { updateTime: 'v' + (ver[key] || 1), fields: { value: { stringValue: JSON.stringify(fs[key]) } } }); }
  if (q.get('currentDocument.updateTime') && q.get('currentDocument.updateTime') !== 'v' + (ver[key] || 1)) return R(400, {});
  fs[key] = JSON.parse(JSON.parse(init.body).fields.value.stringValue); ver[key] = (ver[key] || 1) + 1; return R(200, {});
};
const { newSession } = await import('../netlify/functions/_auth.mjs');
const data = (await import('../netlify/functions/data.mjs')).default;
const ob = (await import('../netlify/functions/order-balance.mjs')).default;
const adm = (await import('../netlify/functions/admin-act.mjs')).default;
const promo = (await import('../netlify/functions/promo-check.mjs')).default;
const visit = (await import('../netlify/functions/visit.mjs')).default;
const me = (await import('../netlify/functions/me-act.mjs')).default;
const tA = await newSession('adm'), t1 = await newSession('u1'), t2 = await newSession('u2');
const call = async (f, tok, body, method = 'POST', url = 'https://x/') => {
  const h = {}; if (tok) h.Authorization = 'Bearer ' + tok;
  const r = await f(new Request(url, { method, headers: h, body: method === 'GET' ? undefined : JSON.stringify(body) }));
  return { s: r.status, b: await r.json() };
};
const get = (tok, key) => call(data, tok, null, 'GET', 'https://x/?key=' + key);
let n = 0; const t = async (name, f) => { await f(); console.log('✔', name); n++; };

await t('lecture : config publique OK, données clients refusées sans connexion', async () => {
  assert.equal((await get(null, 'siteConfig')).s, 200);
  for (const k of ['users', 'orders', 'deposits', 'promoCodes']) assert.equal((await get(null, k)).s, 401);
  assert.equal((await get(null, 'nimportequoi')).s, 401);
});
await t('lecture : un client ne voit que ses données, jamais les codes promo', async () => {
  const u = await get(t1, 'users'); assert.deepEqual(u.b.data.map((x) => x.id), ['u1']);
  assert.deepEqual((await get(t1, 'orders')).b.data.map((x) => x.id), ['O1']);
  assert.deepEqual((await get(t1, 'deposits')).b.data.map((x) => x.id), ['D2']);
  assert.equal((await get(t1, 'promoCodes')).s, 403);
});
await t('lecture : l\'admin voit tout, sans mot de passe', async () => {
  assert.equal((await get(tA, 'users')).b.data.length, 3); assert.equal((await get(tA, 'orders')).b.data.length, 2);
  assert.equal((await get(tA, 'promoCodes')).s, 200);
});
await t('écriture directe : refusée aux clients, users/orders interdits même à l\'admin', async () => {
  assert.equal((await call(data, null, { key: 'siteConfig', value: {} })).s, 401);
  assert.equal((await call(data, t1, { key: 'siteConfig', value: { hack: 1 } })).s, 403);
  assert.equal((await call(data, tA, { key: 'users', value: [] })).s, 400);
  assert.equal((await call(data, tA, { key: 'orders', value: [] })).s, 400);
  assert.equal((await call(data, tA, { key: 'faqItems', value: [{ id: 'F1' }] })).s, 200);
  assert.equal(fs.faqItems[0].id, 'F1'); assert.equal(fs.users.length, 3);
});
await t('promo : code valide, invalide, expiré, non connecté', async () => {
  assert.equal((await call(promo, t1, { code: 'promo10' })).b.percent, 10);
  assert.equal((await call(promo, t1, { code: 'zzz' })).s, 404);
  assert.equal((await call(promo, t1, { code: 'OLD' })).s, 410);
  assert.equal((await call(promo, null, { code: 'PROMO10' })).s, 401);
});
await t('commande par solde : prix recalculé, solde débité, parrain payé, commande créée', async () => {
  const r = await call(ob, t1, { plat: 'tiktok', svc: 'Followers', type: 'Followers Standard', qty: 1000, link: 'https://tiktok.com/@a', amount: 1 });
  if (r.s !== 200) { console.log(r); }
  assert.equal(r.s, 200);
  const o = r.b.order; assert.ok(o.amount > 1); assert.equal(fs.users[1].balance, 5000 - o.amount);
  assert.equal(fs.users[0].balance, Math.round(o.amount * 0.1));
  assert.ok(fs.orders.some((x) => x.id === o.id && x.status === 'processing' && x.userId === 'u1'));
  assert.ok(fs.users[1].orders.includes(o.id));
});
await t('commande par solde : solde insuffisant, non connecté, service inconnu, quantité hors limites', async () => {
  const b = { plat: 'tiktok', svc: 'Followers', type: 'Followers Standard', qty: 1000, link: 'https://t.co/a' };
  assert.equal((await call(ob, t2, b)).s, 402); assert.equal(fs.users[2].balance, 100);
  assert.equal((await call(ob, null, b)).s, 401);
  assert.equal((await call(ob, t1, { ...b, svc: 'Nope' })).s, 400);
  assert.equal((await call(ob, t1, { ...b, qty: 1 })).s, 400);
  assert.equal((await call(ob, t1, { ...b, link: '' })).s, 400);
});
await t('admin : un client ne peut rien faire', async () => {
  for (const a of [{ action: 'order-status', id: 'O1', status: 'completed' }, { action: 'deposit', id: 'D2', decision: 'activate' }, { action: 'user-balance', id: 'u1', balance: 99999 }, { action: 'user-reseller', id: 'u1' }, { action: 'reset-stats' }])
    assert.equal((await call(adm, t1, a)).s, 403);
  assert.equal((await call(adm, null, { action: 'reset-stats' })).s, 401);
  assert.equal(fs.users[1].balance < 5000, true); assert.equal(fs.orders.length, 3);
});
await t('admin : statut + remboursement unique, recharge activée une seule fois', async () => {
  const before = fs.users[1].balance;
  assert.equal((await call(adm, tA, { action: 'order-status', id: 'O1', status: 'failed' })).b.refunded, 800);
  assert.equal(fs.users[1].balance, before + 800);
  assert.equal((await call(adm, tA, { action: 'order-status', id: 'O1', status: 'failed' })).b.refunded, 0);
  assert.equal(fs.users[1].balance, before + 800);
  assert.equal((await call(adm, tA, { action: 'order-status', id: 'O2', status: 'completed' })).b.refunded, 0);
  assert.equal((await call(adm, tA, { action: 'order-status', id: 'O1', status: 'hack' })).s, 400);
  assert.equal((await call(adm, tA, { action: 'deposit', id: 'D1', decision: 'activate' })).s, 200);
  assert.equal(fs.users[2].balance, 2100);
  assert.equal((await call(adm, tA, { action: 'deposit', id: 'D1', decision: 'activate' })).s, 404);
  assert.equal(fs.users[2].balance, 2100);
});
await t('admin : revendeur, solde, mot de passe, remise à zéro', async () => {
  assert.equal((await call(adm, tA, { action: 'user-reseller', id: 'u2' })).b.isReseller, true);
  assert.equal((await call(adm, tA, { action: 'user-balance', id: 'u2', balance: -5 })).s, 400);
  assert.equal((await call(adm, tA, { action: 'user-balance', id: 'u2', balance: 777 })).s, 200); assert.equal(fs.users[2].balance, 777);
  assert.equal((await call(adm, tA, { action: 'user-password', id: 'u2', password: 'abc' })).s, 400);
  assert.equal((await call(adm, tA, { action: 'user-password', id: 'u2', password: 'nouveau99' })).s, 200);
  const login = (await import('../netlify/functions/auth-login.mjs')).default;
  assert.equal((await call(login, null, { email: 'bob@x.com', password: 'nouveau99' })).s, 200);
  assert.equal((await call(adm, tA, { action: 'reset-stats' })).s, 200); assert.equal(fs.orders.length, 0);
});
await t('visiteurs et favoris', async () => {
  assert.equal((await call(visit, null, {})).b.count, 5);
  assert.equal((await call(me, t1, { action: 'wishlist', item: { key: 'a|b|c', plat: 'a', svc: 'b', type: 'c', label: 'c' } })).b.added, true);
  assert.equal((await call(me, t1, { action: 'wishlist', item: { key: 'a|b|c' } })).b.added, false);
  assert.equal((await call(me, null, { action: 'wishlist', item: { key: 'x' } })).s, 401);
});
await t('compte de service : jeton Google demandé et utilisé à la place de la clé publique', async () => {
  const { generateKeyPairSync } = await import('node:crypto');
  const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048, privateKeyEncoding: { type: 'pkcs8', format: 'pem' }, publicKeyEncoding: { type: 'spki', format: 'pem' } });
  process.env.FIREBASE_SA_JSON = JSON.stringify({ client_email: 'svc@p.iam.gserviceaccount.com', private_key: privateKey });
  const seen = []; const orig = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => {
    if (String(url).startsWith('https://oauth2.googleapis.com/token')) { seen.push('token:' + String(init.body).includes('assertion=')); return new Response(JSON.stringify({ access_token: 'TOK', expires_in: 3600 })); }
    seen.push((init.headers && init.headers.Authorization) + '|' + String(url).includes('key=')); return orig(url, init);
  };
  const { fsRead } = await import('../netlify/functions/_lib.mjs');
  await fsRead('siteConfig'); await fsRead('siteConfig');
  assert.deepEqual(seen, ['token:true', 'Bearer TOK|false', 'Bearer TOK|false']);
  globalThis.fetch = orig; delete process.env.FIREBASE_SA_JSON;
});
console.log(n, 'tests OK');
