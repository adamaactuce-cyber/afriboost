import assert from 'node:assert/strict';
const mk = () => { const m = new Map(); return { m,
  async get(k, o) { return m.has(k) ? (o && o.type === 'json' ? JSON.parse(m.get(k)) : m.get(k)) : null; },
  async set(k, v, o) { if (o && o.onlyIfNew && m.has(k)) return { modified: false }; m.set(k, v); return { modified: true }; },
  async setJSON(k, v) { m.set(k, JSON.stringify(v)); }, async delete(k) { m.delete(k); },
  async list({ prefix }) { return { blobs: [...m.keys()].filter((k) => k.startsWith(prefix)).map((key) => ({ key })) }; } }; };
const auth = mk(), extra = mk();
globalThis.__AB_TEST_AUTH_STORE = auth; globalThis.__AB_TEST_EXTRA_STORE = extra;
process.env.PUSH_ADMIN_KEY = 'cle-de-test-123';
const fs = { users: [{ id: 'u1', name: 'Awa', email: 'a@x.com', phone: '+226 70 11 22 33', createdAt: '2026-11-22T10:00:00.000Z', balance: 0, orders: [] }, { id: 'u2', name: 'Bob', email: 'b@x.com', phone: '70112233', createdAt: '2026-11-22T10:00:00.000Z', balance: 0, orders: [] }, { id: 'u3', name: 'Cy', email: 'c@x.com', phone: '', createdAt: '2026-11-23T10:00:00.000Z', balance: 0, orders: [] }, { id: 'u4', name: 'Vieux', email: 'v@x.com', phone: '', createdAt: '2026-10-01T10:00:00.000Z', balance: 0, orders: [] }], orders: [], siteConfig: {} };
const ver = {};
globalThis.fetch = async (url, init = {}) => {
  url = String(url); const key = url.split('/afriboost/')[1].split('?')[0]; const q = new URL(url).searchParams;
  const R = (s, b) => new Response(JSON.stringify(b), { status: s });
  if (!init.method || init.method === 'GET') return R(200, { updateTime: 'v' + (ver[key] || 1), fields: { value: { stringValue: JSON.stringify(fs[key] ?? null) } } });
  if (q.get('currentDocument.updateTime') !== 'v' + (ver[key] || 1)) return R(400, {});
  fs[key] = JSON.parse(JSON.parse(init.body).fields.value.stringValue); ver[key] = (ver[key] || 1) + 1; return R(200, {});
};
const { newSession } = await import('../netlify/functions/_auth.mjs');
const gift = (await import('../netlify/functions/gift-claim.mjs')).default;
const join = (await import('../netlify/functions/contacts-join.mjs')).default;
const adm = (await import('../netlify/functions/contacts-admin.mjs')).default;
const call = async (f, b, h = {}) => { const r = await f(new Request('https://x/', { method: 'POST', body: JSON.stringify(b), headers: h })); const t = await r.text(); let j; try { j = JSON.parse(t); } catch { j = t; } return { s: r.status, b: j }; };
let n = 0; const t = async (name, f) => { await f(); console.log('✔', name); n++; };
const t1 = await newSession('u1'), t2 = await newSession('u2'), t3 = await newSession('u3');

await t('cadeau : refusé sans session', async () => assert.equal((await call(gift, { token: 'x'.repeat(64), pick: 'likes', plat: 'tiktok', link: 'https://t.com/a' })).s, 401));
await t('cadeau : statut avant', async () => assert.equal((await call(gift, { token: t1, action: 'status' })).b.claimed, false));
await t('cadeau : mauvais choix / réseau / lien refusés', async () => {
  assert.equal((await call(gift, { token: t1, pick: 'gold', plat: 'tiktok', link: 'https://t.com/a' })).s, 400);
  assert.equal((await call(gift, { token: t1, pick: 'likes', plat: 'telegram', link: 'https://t.com/a' })).s, 400);
  assert.equal((await call(gift, { token: t1, pick: 'likes', plat: 'tiktok', link: 'javascript:alert(1)' })).s, 400);
});
await t('cadeau : réclamation OK, commande à 0 créée', async () => {
  const r = await call(gift, { token: t1, pick: 'views', plat: 'tiktok', link: 'https://www.tiktok.com/@awa/video/1' });
  assert.equal(r.s, 200); const o = fs.orders[0];
  assert.equal(o.amount, 0); assert.equal(o.qty, 100); assert.equal(o.payMethod, 'gift'); assert.equal(o.userId, 'u1');
  assert.equal(fs.users[0].giftClaimed, true); assert.equal(fs.users[0].orders.length, 1);
});
await t('cadeau : un seul par compte', async () => assert.equal((await call(gift, { token: t1, pick: 'likes', plat: 'tiktok', link: 'https://t.com/b' })).s, 409));
await t('cadeau : même numéro sur un autre compte refusé', async () => { assert.equal((await call(gift, { token: t2, pick: 'likes', plat: 'tiktok', link: 'https://t.com/b' })).b.error, 'phone_already_used'); assert.equal(fs.orders.length, 1); });
await t('cadeau : compte sans numéro autorisé (1 fois)', async () => { assert.equal((await call(gift, { token: t3, pick: 'followers', plat: 'instagram', link: 'https://instagram.com/cy' })).s, 200); assert.equal((await call(gift, { token: t3, pick: 'likes', plat: 'tiktok', link: 'https://t.com/b' })).s, 409); });
await t('cadeau : ancien compte non éligible', async () => { const t4 = await newSession('u4'); assert.equal((await call(gift, { token: t4, pick: 'likes', plat: 'tiktok', link: 'https://t.com/b' })).b.error, 'not_eligible'); });
await t('cadeau : interrupteur admin', async () => { fs.siteConfig.giftEnabled = false; assert.equal((await call(gift, { token: t2, pick: 'likes', plat: 'tiktok', link: 'https://t.com/b' })).s, 403); });
await t('contacts : consentement obligatoire, numéro valide', async () => {
  assert.equal((await call(join, { name: 'Z', phone: '22670112233' })).s, 400);
  assert.equal((await call(join, { name: 'Z', phone: '12', consent: true })).s, 400);
  assert.equal((await call(join, { name: '', phone: '22670112233', consent: true })).s, 400);
});
await t('contacts : inscription + doublon', async () => {
  assert.equal((await call(join, { name: 'Awa <b>', phone: '+226 70 11 22 33', consent: true })).b.already, false);
  assert.equal((await call(join, { name: 'Awa', phone: '22670112233', consent: true })).b.already, true);
});
await t('contacts : limite par IP', async () => {
  let last; for (let i = 0; i < 9; i++) last = await call(join, { name: 'N' + i, phone: '2267000000' + i, consent: true }, { 'x-nf-client-connection-ip': '1.2.3.4' });
  assert.equal(last.s, 429);
});
await t('contacts admin : clé requise', async () => {
  assert.equal((await call(adm, { key: 'faux', action: 'count' })).s, 401);
  const c = await call(adm, { key: 'cle-de-test-123', action: 'count' }); assert.equal(c.s, 200); assert.ok(c.b.count >= 1);
});
await t('contacts admin : export VCF et CSV', async () => {
  const v = await call(adm, { key: 'cle-de-test-123', action: 'vcf' }); assert.match(v.b, /BEGIN:VCARD/); assert.match(v.b, /TEL;TYPE=CELL:\+22670112233/); assert.equal(/<b>/.test(v.b), false);
  const c = await call(adm, { key: 'cle-de-test-123', action: 'csv' }); assert.match(c.b, /nom,telephone,date/);
});
await t('contacts admin : retrait', async () => {
  assert.equal((await call(adm, { key: 'cle-de-test-123', action: 'remove', phone: '22670112233' })).s, 200);
  const v = await call(adm, { key: 'cle-de-test-123', action: 'vcf' }); assert.equal(/22670112233/.test(v.b), false);
});
console.log(n + ' tests OK');
