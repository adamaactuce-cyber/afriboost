// POST { action:'wishlist', item:{key,plat,svc,type,label} } → ajoute / retire un favori (propre compte uniquement).
import { json, fsUpdate } from './_lib.mjs';
import { whoami, bodyOf, cleanLine } from './_gate.mjs';

export default async (req) => {
  if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' });
  const me = await whoami(req);
  if (!me) return json(401, { error: 'not_logged_in' });
  const b = await bodyOf(req);
  if (!b || b.action !== 'wishlist' || !b.item) return json(400, { error: 'bad_request' });
  const it = b.item;
  const item = { key: cleanLine(it.key, 200), plat: cleanLine(it.plat, 30), svc: cleanLine(it.svc, 100), type: cleanLine(it.type, 100), label: cleanLine(it.label, 100) };
  if (!item.key) return json(400, { error: 'bad_request' });
  try {
    let added = false;
    await fsUpdate('users', (list) => (list || []).map((u) => {
      if (u.id !== me.id) return u;
      const w = u.wishlist || [];
      added = !w.some((x) => x.key === item.key);
      return { ...u, wishlist: added ? [...w, item].slice(-100) : w.filter((x) => x.key !== item.key) };
    }));
    return json(200, { ok: true, added });
  } catch (e) { console.error('me-act', e.message); return json(502, { error: 'unavailable' }); }
};
