// POST /.netlify/functions/auth-register  { name, email, phone?, password, ref? }  →  { token, user }
import { json, fsRead, fsUpdate } from './_lib.mjs';
import { setPassword, newSession, publicUser, PASS_MIN, PASS_MAX } from './_auth.mjs';
import { randomBytes } from 'node:crypto';

const clean = (s, n) => String(s ?? '').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, n);

export default async (req) => {
  if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' });
  let b; try { b = await req.json(); } catch { return json(400, { error: 'bad_json' }); }
  const name = clean(b.name, 80), email = clean(b.email, 200).toLowerCase(), phone = clean(b.phone, 30);
  const password = String(b.password ?? ''), ref = clean(b.ref, 20);
  if (!name || !email || !password) return json(400, { error: 'missing_fields' });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json(400, { error: 'bad_email' });
  if (password.length < PASS_MIN) return json(400, { error: 'password_too_short' });
  if (password.length > PASS_MAX) return json(400, { error: 'password_too_long' });
  try {
    const { data: cfg } = await fsRead('siteConfig');
    if (cfg && cfg.registrationsOpen === false) return json(403, { error: 'registrations_closed' });
    const id = 'u' + Date.now() + randomBytes(2).toString('hex');
    let exists = false;
    const user = {
      id, name, email, phone, balance: 0, referralCode: randomBytes(4).toString('hex').slice(0, 5).toUpperCase(),
      referredBy: null, isAdmin: false, orders: [], referralEarnings: 0, referralCount: 0, createdAt: new Date().toISOString(),
    };
    await fsUpdate('users', (list) => {
      list = Array.isArray(list) ? list : [];
      exists = list.some((u) => String(u.email || '').toLowerCase() === email);
      if (exists) return list;
      const p = ref && list.find((u) => u.referralCode === ref);
      if (p) { user.referredBy = p.id; p.referralCount = (p.referralCount || 0) + 1; }
      return [...list, user];
    });
    if (exists) return json(409, { error: 'email_taken' });
    await setPassword(id, email, password);
    return json(200, { token: await newSession(id), user: publicUser(user) });
  } catch (e) {
    console.error('auth-register', e.message);
    return json(502, { error: 'auth_unavailable' });
  }
};
