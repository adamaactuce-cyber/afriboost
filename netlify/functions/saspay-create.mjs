// POST /.netlify/functions/saspay-create
// Commande : { plat, svc, type, qty, link, promoCode?, packId?, userId }
// Recharge du solde : { kind:'deposit', amount, userId }
// Le prix est TOUJOURS recalculé ici ; le montant envoyé par le navigateur est ignoré.
import { json, store, saspay, saspayKey, computePrice, computeDeposit, fsRead } from './_lib.mjs';
import { randomBytes } from 'node:crypto';

const PLATS = ['tiktok', 'instagram', 'facebook', 'telegram', 'youtube', 'whatsapp', 'twitter', 'snapchat', 'pack'];
const clean = (s, n) => String(s ?? '').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, n);

export default async (req) => {
  if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' });
  let b; try { b = await req.json(); } catch { return json(400, { error: 'bad_json' }); }
  try {
    saspayKey(); // échoue tôt si la config est incohérente
    const isDeposit = b.kind === 'deposit';
    const plat = isDeposit ? 'deposit' : clean(b.plat, 20);
    if (!isDeposit && !PLATS.includes(plat)) return json(400, { error: 'bad_platform' });
    const userId = clean(b.userId, 80);
    const { data: users } = await fsRead('users');
    const user = (users || []).find(u => u.id === userId);
    if (!user) return json(401, { error: 'unknown_user' });

    const link = (plat === 'pack' || isDeposit) ? '—' : clean(b.link, 300);
    if (!isDeposit && plat !== 'pack' && !link) return json(400, { error: 'missing_link' });

    const price = isDeposit ? await computeDeposit(Number(b.amount)) : await computePrice({
      plat, svc: clean(b.svc, 100), type: clean(b.type, 100), qty: Number(b.qty),
      packId: clean(b.packId, 80), promoCode: clean(b.promoCode, 40), userId,
    });

    const orderId = (isDeposit ? 'DEP' : 'ORD') + Date.now() + randomBytes(3).toString('hex').toUpperCase();
    const site = (process.env.SITE_URL || process.env.URL || new URL(req.url).origin).replace(/\/$/, '');

    const session = await saspay('POST', '/checkout-sessions/', {
      amount: price.amount.toFixed(2),
      currency: 'XOF',
      country: 'BF',
      description: ('AfriBoost #' + orderId.slice(-6) + ' — ' + price.label).slice(0, 200),
      customer_email: user.email,
      customer_name: user.name || 'Client AfriBoost',
      customer_phone: user.phone ? String(user.phone).replace(/\s/g, '') : undefined,
      return_url: site + '/?sp_order=' + encodeURIComponent(orderId),
      metadata: { order_id: orderId, user_id: userId },
    });
    if (!session || !session.id || !session.checkout_url) throw new Error('Réponse checkout invalide');

    await store().setJSON('intent/' + orderId, {
      orderId, userId, kind: isDeposit ? 'deposit' : 'order', plat, svcName: price.svcName, link, qty: price.qty, amount: price.amount,
      promo: price.promo || null, sessionId: session.id, status: 'pending', createdAt: new Date().toISOString(),
    });
    return json(200, { orderId, checkoutUrl: session.checkout_url, amount: price.amount });
  } catch (e) {
    console.error('saspay-create', e.message);
    const client = /Service inconnu|Quantité|Pack introuvable|Montant/.test(e.message);
    return json(client ? 400 : 502, { error: client ? e.message : 'payment_unavailable' });
  }
};
