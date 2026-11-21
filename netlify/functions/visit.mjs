// POST → +1 visiteur (une fois par session de navigation, côté navigateur).
import { json, fsUpdate } from './_lib.mjs';
import { rateLimit } from './_extra.mjs';
export default async (req) => {
  if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' });
  try {
    if (!(await rateLimit(req, 'visit', 30))) return json(429, { error: 'slow_down' });
    const n = await fsUpdate('visitorCount', (c) => (Number(c) || 0) + 1);
    return json(200, { count: n });
  } catch (e) { console.error('visit', e.message); return json(502, { error: 'unavailable' }); }
};
