// Tests de la connexion sécurisée avec faux Firestore et faux stockage (aucun appel réseau).
import assert from 'node:assert/strict';
const mem = new Map();
globalThis.__AB_TEST_AUTH_STORE = {
  async get(k) { return mem.has(k) ? JSON.parse(mem.get(k)) : null; },
  async setJSON(k, v) { mem.set(k, JSON.stringify(v)); },
  async delete(k) { mem.delete(k); },
};
const fs = { users: [{ id: 'admin001', name: 'Admin', email: 'admin@afriboost.com', pass: 'admin2026', isAdmin: true, balance: 0, referralCode: 'ADMIN01' }], siteConfig: { registrationsOpen: true } };
const ver = { users: 1 };
globalThis.fetch = async (url, init = {}) => {
  url = String(url); const key = url.split('/afriboost/')[1].split('?')[0]; const q = new URL(url).searchParams;
  const R = (s, b) => new Response(JSON.stringify(b), { status: s });
  if (!init.method || init.method === 'GET') return R(200, { updateTime: 'v' + (ver[key] || 1), fields: { value: { stringValue: JSON.stringify(fs[key] ?? null) } } });
  if (q.get('currentDocument.updateTime') !== 'v' + (ver[key] || 1)) return R(400, {});
  fs[key] = JSON.parse(JSON.parse(init.body).fields.value.stringValue); ver[key] = (ver[key] || 1) + 1; return R(200, {});
};
const login = (await import('../netlify/functions/auth-login.mjs')).default;
const reg = (await import('../netlify/functions/auth-register.mjs')).default;
const chg = (await import('../netlify/functions/auth-change-password.mjs')).default;
const call = async (f, b) => { const r = await f(new Request('https://x/', { method: 'POST', body: JSON.stringify(b) })); return { s: r.status, b: await r.json() }; };
let n = 0; const t = async (name, f) => { await f(); console.log('✔', name); n++; };

await t('ancien compte : connexion OK, converti, mot de passe retiré de Firestore', async () => {
  const r = await call(login, { email: 'ADMIN@afriboost.com', password: 'admin2026' });
  assert.equal(r.s, 200); assert.equal(r.b.token.length, 64); assert.equal('pass' in r.b.user, false);
  assert.equal('pass' in fs.users[0], false);
  assert.ok([...mem.keys()].some((k) => k.startsWith('cred/')));
  assert.equal((await call(login, { email: 'admin@afriboost.com', password: 'admin2026' })).s, 200);
});
await t('mauvais mot de passe refusé', async () => assert.equal((await call(login, { email: 'admin@afriboost.com', password: 'nope' })).s, 401));
await t('e-mail inconnu refusé (même réponse)', async () => assert.equal((await call(login, { email: 'zz@x.com', password: 'abcdef' })).s, 401));
await t('inscription : crée le compte, sans mot de passe dans Firestore', async () => {
  const r = await call(reg, { name: 'Awa', email: 'Awa@x.com', password: 'secret1', phone: '70', ref: 'ADMIN01' });
  assert.equal(r.s, 200); assert.equal(JSON.stringify(fs.users).includes('secret1'), false);
  assert.equal(fs.users.find((u) => u.email === 'awa@x.com').referredBy, 'admin001');
  assert.equal(fs.users[0].referralCount, 1);
  assert.equal((await call(login, { email: 'awa@x.com', password: 'secret1' })).s, 200);
});
await t('inscription : e-mail déjà pris, mot de passe trop court, e-mail invalide', async () => {
  assert.equal((await call(reg, { name: 'B', email: 'awa@x.com', password: 'secret2' })).s, 409);
  assert.equal((await call(reg, { name: 'B', email: 'b@x.com', password: '123' })).s, 400);
  assert.equal((await call(reg, { name: 'B', email: 'bad', password: 'abcdef' })).s, 400);
});
await t('inscriptions fermées respectées', async () => {
  fs.siteConfig.registrationsOpen = false;
  assert.equal((await call(reg, { name: 'C', email: 'c@x.com', password: 'abcdef' })).s, 403);
  fs.siteConfig.registrationsOpen = true;
});
await t('verrou après 5 échecs', async () => {
  for (let i = 0; i < 5; i++) await call(login, { email: 'awa@x.com', password: 'bad' + i });
  assert.equal((await call(login, { email: 'awa@x.com', password: 'secret1' })).s, 429);
});
await t('changement de mot de passe', async () => {
  const { b } = await call(login, { email: 'admin@afriboost.com', password: 'admin2026' });
  assert.equal((await call(chg, { token: 'x'.repeat(64), oldPassword: 'admin2026', newPassword: 'nouveau1' })).s, 401);
  assert.equal((await call(chg, { token: b.token, oldPassword: 'faux', newPassword: 'nouveau1' })).s, 401);
  assert.equal((await call(chg, { token: b.token, oldPassword: 'admin2026', newPassword: 'abc' })).s, 400);
  assert.equal((await call(chg, { token: b.token, oldPassword: 'admin2026', newPassword: 'nouveau1' })).s, 200);
  assert.equal((await call(login, { email: 'admin@afriboost.com', password: 'admin2026' })).s, 401);
  assert.equal((await call(login, { email: 'admin@afriboost.com', password: 'nouveau1' })).s, 200);
});
console.log(n + ' tests OK');
