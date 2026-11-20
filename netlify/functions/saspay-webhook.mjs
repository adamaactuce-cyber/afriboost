// POST /.netlify/functions/saspay-webhook   (à déclarer dans le tableau de bord SasPay)
// En-têtes : X-Webhook-Signature (HMAC-SHA256 hex de "<timestamp>.<corps brut>"), X-Webhook-Timestamp, X-Webhook-Event.
import { createHmac, timingSafeEqual } from 'node:crypto';
import { json, store, reconcile } from './_lib.mjs';

const TOLERANCE_S = 300;
const EVENTS = ['transaction.success', 'transaction.failed', 'transaction.cancelled'];

function validSignature(raw, sig, ts, secret) {
  if (!secret || !sig || !/^\d+$/.test(ts || '')) return false;
  if (Math.abs(Math.floor(Date.now() / 1000) - Number(ts)) > TOLERANCE_S) return false;
  const expected = createHmac('sha256', secret).update(`${ts}.${raw}`).digest('hex');
  const a = Buffer.from(sig), b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export default async (req) => {
  if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' });
  const raw = await req.text(); // corps BRUT : jamais re-sérialisé
  const ok = validSignature(raw, req.headers.get('x-webhook-signature'), req.headers.get('x-webhook-timestamp'), process.env.SASPAY_WEBHOOK_SECRET);
  if (!ok) return json(401, { error: 'invalid_signature' });

  let evt; try { evt = JSON.parse(raw); } catch { return json(400, { error: 'bad_json' }); }
  if (!EVENTS.includes(evt.event)) return json(200, { ignored: evt.event }); // ex. webhook.test

  try {
    // Le payload ne contient pas notre identifiant de commande : on re-vérifie auprès de SasPay
    // les paiements en attente récents. Le résultat ne dépend jamais du contenu du webhook.
    const s = store();
    const { blobs } = await s.list({ prefix: 'intent/' });
    const since = Date.now() - 48 * 3600 * 1000;
    const pending = [];
    for (const { key } of blobs) {
      const it = await s.get(key, { type: 'json' });
      if (it && it.status !== 'paid' && new Date(it.createdAt).getTime() > since) pending.push(it);
    }
    pending.sort((x, y) => y.createdAt.localeCompare(x.createdAt));
    for (let i = 0; i < Math.min(pending.length, 30); i += 5)
      await Promise.all(pending.slice(i, i + 5).map(it => reconcile(it.orderId)));
    return json(200, { ok: true });
  } catch (e) {
    console.error('saspay-webhook', e.message);
    return json(500, { error: 'retry' }); // SasPay réessaiera (5 tentatives)
  }
};
