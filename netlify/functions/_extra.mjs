// Stockage serveur pour le cadeau de bienvenue et les contacts WhatsApp (Netlify Blobs, jamais dans Firestore).
import { getStore } from '@netlify/blobs';
import { createHash } from 'node:crypto';
export const xstore = () => globalThis.__AB_TEST_EXTRA_STORE || getStore({ name: 'extra', consistency: 'strong' });
export const sha = (s) => createHash('sha256').update(String(s)).digest('hex').slice(0, 40);
export const cleanTxt = (s, n) => String(s ?? '').replace(/[\u0000-\u001f\u007f<>]/g, '').trim().slice(0, n);
// Numéro WhatsApp : chiffres seulement, avec indicatif, 8 à 15 chiffres.
export function normPhone(p) {
  let d = String(p ?? '').replace(/[^\d+]/g, '');
  if (d.startsWith('00')) d = '+' + d.slice(2);
  const digits = d.replace(/\D/g, '');
  return digits.length >= 8 && digits.length <= 15 ? digits : '';
}
// Petite limite par adresse IP et par heure (contre le remplissage automatique).
export async function rateLimit(req, name, max) {
  const ip = req.headers.get('x-nf-client-connection-ip') || req.headers.get('x-forwarded-for') || 'unknown';
  const k = 'rl/' + name + '/' + sha(ip) + '/' + new Date().toISOString().slice(0, 13);
  const r = (await xstore().get(k, { type: 'json' })) || { n: 0 };
  if (r.n >= max) return false;
  await xstore().setJSON(k, { n: r.n + 1 });
  return true;
}
