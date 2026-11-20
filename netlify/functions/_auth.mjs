// Connexion sécurisée : mots de passe hachés (scrypt) + sessions. Stockés côté serveur (Netlify Blobs), jamais dans Firestore.
import { getStore } from '@netlify/blobs';
import { scrypt, randomBytes, createHash, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { fsRead, fsUpdate } from './_lib.mjs';

const scryptP = promisify(scrypt);
export const astore = () => globalThis.__AB_TEST_AUTH_STORE || getStore({ name: 'auth', consistency: 'strong' });

const SESSION_DAYS = 30, MAX_FAILS = 5, LOCK_MIN = 15;
export const PASS_MIN = 6, PASS_MAX = 100;

export async function hashPassword(pw) {
  const salt = randomBytes(16);
  const h = await scryptP(pw, salt, 32);
  return { salt: salt.toString('hex'), hash: h.toString('hex') };
}
export async function checkHash(pw, rec) {
  const h = await scryptP(pw, Buffer.from(rec.salt, 'hex'), 32);
  const b = Buffer.from(rec.hash, 'hex');
  return h.length === b.length && timingSafeEqual(h, b);
}
function sameText(a, b) {
  const x = createHash('sha256').update(String(a)).digest(), y = createHash('sha256').update(String(b)).digest();
  return timingSafeEqual(x, y);
}
const emailKey = (e) => 'cred/' + createHash('sha256').update(e).digest('hex');
const sidOf = (token) => 'sess/' + createHash('sha256').update(token).digest('hex');

// Ce que le navigateur a le droit de voir : jamais de mot de passe.
export const publicUser = (u) => { const { pass, ...rest } = u; return rest; };

export async function newSession(userId) {
  const token = randomBytes(32).toString('hex');
  await astore().setJSON(sidOf(token), { userId, exp: Date.now() + SESSION_DAYS * 864e5 });
  return token;
}
export async function sessionUser(token) {
  if (!token || typeof token !== 'string' || token.length !== 64) return null;
  const s = await astore().get(sidOf(token), { type: 'json' });
  if (!s || s.exp < Date.now()) return null;
  const { data: users } = await fsRead('users');
  return (users || []).find((u) => u.id === s.userId) || null;
}

// Blocage temporaire après trop d'essais ratés (par e-mail).
async function lockState(e) {
  const r = await astore().get('fail/' + emailKey(e), { type: 'json' });
  return r && r.until > Date.now() ? r : null;
}
async function noteFail(e) {
  const k = 'fail/' + emailKey(e);
  const r = (await astore().get(k, { type: 'json' })) || { n: 0 };
  const n = (r.until && r.until < Date.now() ? 0 : r.n) + 1;
  await astore().setJSON(k, n >= MAX_FAILS ? { n: 0, until: Date.now() + LOCK_MIN * 60000 } : { n });
}

// Vérifie e-mail + mot de passe. Les anciens comptes (mot de passe en clair dans Firestore) sont convertis au passage.
export async function verifyLogin(email, password) {
  if (await lockState(email)) return { error: 'too_many_attempts' };
  const { data: users } = await fsRead('users');
  const u = (users || []).find((x) => String(x.email || '').toLowerCase() === email);
  let ok = false;
  if (u) {
    const rec = await astore().get(emailKey(email), { type: 'json' });
    if (rec) ok = await checkHash(password, rec);
    else if (typeof u.pass === 'string' && u.pass) {
      ok = sameText(u.pass, password);
      if (ok) await setPassword(u.id, email, password); // migration : hash côté serveur
    }
    if (ok && u.pass !== undefined) await scrubPlain(u.id);
  }
  if (!ok) { await noteFail(email); return { error: 'bad_credentials' }; }
  return { user: u };
}

export async function setPassword(userId, email, password) {
  await astore().setJSON(emailKey(email), { userId, ...(await hashPassword(password)) });
}
export async function scrubPlain(userId) {
  await fsUpdate('users', (list) => (list || []).map((x) => (x.id === userId ? publicUser(x) : x)));
}
