// POST { code } → { code, percent } ou erreur. Les codes eux-mêmes ne sont jamais envoyés au navigateur.
import { json, fsRead } from './_lib.mjs';
import { whoami, bodyOf, cleanLine } from './_gate.mjs';

export default async (req) => {
  if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' });
  if (!(await whoami(req))) return json(401, { error: 'not_logged_in' });
  const b = await bodyOf(req); const code = cleanLine(b && b.code, 40).toUpperCase();
  if (!code) return json(400, { error: 'invalid' });
  try {
    const p = ((await fsRead('promoCodes')).data || []).find((x) => x.code === code);
    if (!p || !(p.percent > 0 && p.percent <= 100)) return json(404, { error: 'invalid' });
    if (p.expiresAt && new Date(p.expiresAt) < new Date()) return json(410, { error: 'expired' });
    return json(200, { code: p.code, percent: p.percent });
  } catch (e) { console.error('promo-check', e.message); return json(502, { error: 'unavailable' }); }
};
