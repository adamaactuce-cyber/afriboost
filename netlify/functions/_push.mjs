// Notifications push : stockage des abonnements + clés VAPID (créées automatiquement, jamais exposées).
import { getStore } from '@netlify/blobs';
import webpush from 'web-push';
import { createHash, timingSafeEqual } from 'node:crypto';

export const pstore = () => globalThis.__AB_TEST_PUSH_STORE || getStore({ name: 'push', consistency: 'strong' });
export const wp = () => globalThis.__AB_TEST_WEBPUSH || webpush;

// Clés VAPID : générées une seule fois (onlyIfNew), la clé privée reste dans le stockage serveur.
export async function vapid() {
  const s = pstore();
  let v = await s.get('vapid', { type: 'json' });
  if (!v) {
    await s.set('vapid', JSON.stringify(wp().generateVAPIDKeys()), { onlyIfNew: true });
    v = await s.get('vapid', { type: 'json' });
  }
  return v;
}

// Seuls les vrais services push des navigateurs sont acceptés (évite qu'on remplisse la base avec n'importe quoi).
const PUSH_HOSTS = [/(^|\.)fcm\.googleapis\.com$/, /(^|\.)push\.services\.mozilla\.com$/, /(^|\.)notify\.windows\.com$/, /(^|\.)push\.apple\.com$/];
export function validSubscription(sub) {
  try {
    if (!sub || typeof sub.endpoint !== 'string' || sub.endpoint.length > 900) return false;
    const u = new URL(sub.endpoint);
    if (u.protocol !== 'https:' || !PUSH_HOSTS.some((r) => r.test(u.hostname))) return false;
    const k = sub.keys;
    return !!k && typeof k.p256dh === 'string' && typeof k.auth === 'string' && k.p256dh.length < 200 && k.auth.length < 100;
  } catch { return false; }
}
export const subKey = (endpoint) => 'sub/' + createHash('sha256').update(endpoint).digest('hex').slice(0, 40);

export function adminKeyOk(given) {
  const real = process.env.PUSH_ADMIN_KEY || '';
  if (!real) return 'missing';
  const a = Buffer.from(String(given || '')), b = Buffer.from(real);
  return a.length === b.length && timingSafeEqual(a, b) ? 'ok' : 'bad';
}
