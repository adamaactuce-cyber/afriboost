// POST /.netlify/functions/auth-login  { email, password }  →  { token, user }
import { json } from './_lib.mjs';
import { verifyLogin, newSession, publicUser, PASS_MAX } from './_auth.mjs';

export default async (req) => {
  if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' });
  let b; try { b = await req.json(); } catch { return json(400, { error: 'bad_json' }); }
  const email = String(b.email ?? '').trim().toLowerCase().slice(0, 200);
  const password = String(b.password ?? '');
  if (!email || !password || password.length > PASS_MAX) return json(400, { error: 'missing_fields' });
  try {
    const r = await verifyLogin(email, password);
    if (r.error === 'too_many_attempts') return json(429, { error: r.error });
    if (r.error) return json(401, { error: r.error });
    return json(200, { token: await newSession(r.user.id), user: publicUser(r.user) });
  } catch (e) {
    console.error('auth-login', e.message);
    return json(502, { error: 'auth_unavailable' });
  }
};
