// POST /.netlify/functions/auth-change-password  { token, oldPassword, newPassword }
import { json } from './_lib.mjs';
import { sessionUser, verifyLogin, setPassword, PASS_MIN, PASS_MAX } from './_auth.mjs';

export default async (req) => {
  if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' });
  let b; try { b = await req.json(); } catch { return json(400, { error: 'bad_json' }); }
  const oldP = String(b.oldPassword ?? ''), newP = String(b.newPassword ?? '');
  if (newP.length < PASS_MIN) return json(400, { error: 'password_too_short' });
  if (newP.length > PASS_MAX || oldP.length > PASS_MAX) return json(400, { error: 'password_too_long' });
  try {
    const u = await sessionUser(b.token);
    if (!u) return json(401, { error: 'not_logged_in' });
    const email = String(u.email).toLowerCase();
    const r = await verifyLogin(email, oldP);
    if (r.error === 'too_many_attempts') return json(429, { error: r.error });
    if (r.error || r.user.id !== u.id) return json(401, { error: 'bad_credentials' });
    await setPassword(u.id, email, newP);
    return json(200, { ok: true });
  } catch (e) {
    console.error('auth-change-password', e.message);
    return json(502, { error: 'auth_unavailable' });
  }
};
