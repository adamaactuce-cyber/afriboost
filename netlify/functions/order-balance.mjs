// POST { plat, svc, type, qty, link, promoCode?, packId? } → paie une commande avec le solde.
// Prix recalculé ici, solde débité ici, parrainage ici. Le navigateur ne décide plus de rien.
import { json, fsUpdate, computePrice } from './_lib.mjs';
import { whoami, bodyOf, cleanLine } from './_gate.mjs';
import { randomBytes } from 'node:crypto';

const PLATS = ['tiktok', 'instagram', 'facebook', 'telegram', 'youtube', 'whatsapp', 'twitter', 'snapchat', 'pack'];

export default async (req) => {
  if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' });
  const me = await whoami(req);
  if (!me) return json(401, { error: 'not_logged_in' });
  const b = await bodyOf(req);
  if (!b) return json(400, { error: 'bad_json' });
  const plat = cleanLine(b.plat, 20);
  if (!PLATS.includes(plat)) return json(400, { error: 'bad_platform' });
  const link = plat === 'pack' ? '—' : cleanLine(b.link, 300);
  if (!link) return json(400, { error: 'missing_link' });
  try {
    const price = await computePrice({ plat, svc: cleanLine(b.svc, 100), type: cleanLine(b.type, 100), qty: Number(b.qty), packId: cleanLine(b.packId, 80), promoCode: cleanLine(b.promoCode, 40), userId: me.id });
    const id = 'ORD' + Date.now() + randomBytes(3).toString('hex').toUpperCase();
    let state = 'ok', balance = 0;
    await fsUpdate('users', (list) => {
      list = Array.isArray(list) ? list : [];
      const u = list.find((x) => x.id === me.id);
      if (!u) { state = 'no_user'; return list; }
      if ((u.balance || 0) < price.amount) { state = 'insufficient'; balance = u.balance || 0; return list; }
      state = 'ok';
      u.balance = (u.balance || 0) - price.amount; balance = u.balance;
      u.orders = [...(u.orders || []), id];
      const r = u.referredBy && list.find((x) => x.id === u.referredBy);
      if (r) { const c = Math.round(price.amount * 0.10); r.balance = (r.balance || 0) + c; r.referralEarnings = (r.referralEarnings || 0) + c; }
      return list;
    });
    if (state === 'no_user') return json(401, { error: 'not_logged_in' });
    if (state === 'insufficient') return json(402, { error: 'insufficient_balance', balance });
    const order = { id, userId: me.id, plat, svcName: price.svcName, link, qty: price.qty, amount: price.amount, payMethod: 'balance', status: 'processing', promoCode: price.promo || null, createdAt: new Date().toISOString() };
    try {
      await fsUpdate('orders', (o) => [...(Array.isArray(o) ? o : []), order]);
    } catch (e) { // la commande n'a pas pu être enregistrée : on rend l'argent
      await fsUpdate('users', (list) => (list || []).map((x) => (x.id === me.id ? { ...x, balance: (x.balance || 0) + price.amount } : x)));
      throw e;
    }
    return json(200, { order, balance });
  } catch (e) {
    console.error('order-balance', e.message);
    const client = /Service inconnu|Quantité|Pack introuvable|Montant/.test(e.message);
    return json(client ? 400 : 502, { error: client ? e.message : 'order_unavailable' });
  }
};
