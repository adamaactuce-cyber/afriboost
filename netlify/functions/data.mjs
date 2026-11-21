// Lecture / écriture des données du site, avec les droits vérifiés ici.
// GET  ?key=…            → { data }
// POST { key, value }    → { ok }   (admin seulement, clés de configuration seulement)
import { json, fsRead, fsUpdate } from './_lib.mjs';
import { whoami, publicUser, PUBLIC_KEYS, ADMIN_WRITE_KEYS, bodyOf } from './_gate.mjs';

export default async (req) => {
  try {
    if (req.method === 'GET') {
      const key = new URL(req.url).searchParams.get('key') || '';
      if (PUBLIC_KEYS.includes(key)) return json(200, { data: (await fsRead(key)).data });
      const me = await whoami(req);
      if (!me) return json(401, { error: 'not_logged_in' });
      if (key === 'promoCodes') return me.isAdmin ? json(200, { data: (await fsRead(key)).data }) : json(403, { error: 'forbidden' });
      if (key === 'users') {
        const list = (await fsRead('users')).data || [];
        return json(200, { data: me.isAdmin ? list.map(publicUser) : list.filter((u) => u.id === me.id).map(publicUser) });
      }
      if (key === 'orders' || key === 'deposits') {
        const list = (await fsRead(key)).data || [];
        return json(200, { data: me.isAdmin ? list : list.filter((x) => x.userId === me.id) });
      }
      return json(404, { error: 'unknown_key' });
    }
    if (req.method === 'POST') {
      const me = await whoami(req);
      if (!me) return json(401, { error: 'not_logged_in' });
      if (!me.isAdmin) return json(403, { error: 'forbidden' });
      const b = await bodyOf(req);
      if (!b || !ADMIN_WRITE_KEYS.includes(b.key)) return json(400, { error: 'bad_key' });
      if (JSON.stringify(b.value ?? null).length > 600000) return json(413, { error: 'too_big' });
      await fsUpdate(b.key, () => b.value ?? null);
      return json(200, { ok: true });
    }
    return json(405, { error: 'method_not_allowed' });
  } catch (e) {
    console.error('data', e.message);
    return json(502, { error: 'data_unavailable' });
  }
};
