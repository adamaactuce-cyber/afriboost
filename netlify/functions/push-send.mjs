// POST { key, title, body, url? } : envoie une notification à tous les abonnés. Protégé par PUSH_ADMIN_KEY.
import { json } from './_lib.mjs';
import { pstore, vapid, wp, adminKeyOk } from './_push.mjs';

export default async (req) => {
  if (req.method !== 'POST') return json(405, { error: 'method' });
  let b; try { b = await req.json(); } catch { return json(400, { error: 'bad_json' }); }
  const auth = adminKeyOk(b && b.key);
  if (auth === 'missing') return json(503, { error: 'push_admin_key_missing' });
  if (auth !== 'ok') return json(403, { error: 'bad_key' });

  const title = String(b.title || '').trim().slice(0, 80), body = String(b.body || '').trim().slice(0, 240);
  if (!title) return json(400, { error: 'title_required' });
  let url = '/';
  if (b.url) {
    try {
      const base = process.env.SITE_URL || 'https://example.invalid';
      const u = new URL(String(b.url), base);
      if (String(b.url).startsWith('/') || u.origin === new URL(base).origin) url = u.pathname + u.search + u.hash;
      else return json(400, { error: 'url_must_be_this_site' });
    } catch { return json(400, { error: 'bad_url' }); }
  }

  try {
    const v = await vapid();
    const lib = wp();
    lib.setVapidDetails(process.env.SITE_URL || 'mailto:contact@afriboost.app', v.publicKey, v.privateKey);
    const s = pstore();
    const { blobs } = await s.list({ prefix: 'sub/' });
    const payload = JSON.stringify({ title, body, url });
    let sent = 0, failed = 0, removed = 0;
    for (let i = 0; i < blobs.length; i += 20) {
      await Promise.all(blobs.slice(i, i + 20).map(async ({ key }) => {
        const sub = await s.get(key, { type: 'json' });
        if (!sub) return;
        try { await lib.sendNotification(sub, payload, { TTL: 86400, timeout: 10000 }); sent++; }
        catch (e) {
          if (e.statusCode === 404 || e.statusCode === 410) { await s.delete(key); removed++; }
          else { failed++; console.error('push-send', e.statusCode || '', String(e.body || e.message).slice(0, 120)); }
        }
      }));
    }
    return json(200, { total: blobs.length, sent, failed, removed });
  } catch (e) { console.error('push-send', e.message); return json(502, { error: 'push_unavailable' }); }
};
