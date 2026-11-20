// POST { subscription, userId? } : enregistre un téléphone qui accepte les notifications.
import { json } from './_lib.mjs';
import { pstore, subKey, validSubscription } from './_push.mjs';

export default async (req) => {
  if (req.method !== 'POST') return json(405, { error: 'method' });
  let b; try { b = await req.json(); } catch { return json(400, { error: 'bad_json' }); }
  const sub = b && b.subscription;
  if (!validSubscription(sub)) return json(400, { error: 'bad_subscription' });
  try {
    await pstore().setJSON(subKey(sub.endpoint), {
      endpoint: sub.endpoint, keys: { p256dh: sub.keys.p256dh, auth: sub.keys.auth },
      userId: typeof b.userId === 'string' ? b.userId.slice(0, 60) : null, createdAt: new Date().toISOString(),
    });
    return json(200, { ok: true });
  } catch (e) { console.error('push-subscribe', e.message); return json(502, { error: 'push_unavailable' }); }
};
