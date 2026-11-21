// POST /.netlify/functions/gift-claim
//   { token, action:'status' }                              → { claimed }
//   { token, pick:'likes'|'views'|'followers', plat, link } → crée UNE commande cadeau (prix 0) par compte
import { json, fsRead, fsUpdate } from './_lib.mjs';
import { sessionUser } from './_auth.mjs';
import { xstore, sha, cleanTxt, normPhone } from './_extra.mjs';
import { randomBytes } from 'node:crypto';

const GIFTS = {
  likes:     { qty: 50,  name: '50 likes',   plats: ['tiktok', 'instagram', 'facebook'] },
  views:     { qty: 100, name: '100 vues',   plats: ['tiktok', 'instagram', 'facebook', 'youtube'] },
  followers: { qty: 10,  name: '10 abonnés', plats: ['tiktok', 'instagram', 'facebook', 'youtube', 'telegram'] },
};

// Seuls les comptes créés à partir de cette date peuvent recevoir le cadeau (clients « nouveaux »).
export const GIFT_FROM = '2026-11-21T00:00:00.000Z';

export default async (req) => {
  if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' });
  let b; try { b = await req.json(); } catch { return json(400, { error: 'bad_json' }); }
  try {
    const u = await sessionUser(b.token);
    if (!u) return json(401, { error: 'not_logged_in' });
    const { data: cfg } = await fsRead('siteConfig');
    const keyUser = 'gift/u/' + sha(u.id);
    if (b.action === 'status') {
      const done = await xstore().get(keyUser, { type: 'json' });
      return json(200, { claimed: !!done, enabled: !(cfg && cfg.giftEnabled === false), eligible: !!u.createdAt && u.createdAt >= GIFT_FROM });
    }
    if (cfg && cfg.giftEnabled === false) return json(403, { error: 'gift_disabled' });
    if (!u.createdAt || u.createdAt < GIFT_FROM) return json(403, { error: 'not_eligible' });
    const g = GIFTS[b.pick];
    if (!g) return json(400, { error: 'bad_gift' });
    const plat = cleanTxt(b.plat, 20);
    if (!g.plats.includes(plat)) return json(400, { error: 'bad_platform' });
    const link = cleanTxt(b.link, 300);
    if (!/^https?:\/\/\S+$/i.test(link)) return json(400, { error: 'bad_link' });

    // Un seul cadeau par compte ET par numéro de téléphone.
    const phone = normPhone(u.phone);
    const orderId = 'GIFT' + Date.now() + randomBytes(2).toString('hex').toUpperCase();
    const first = await xstore().set(keyUser, JSON.stringify({ orderId, at: new Date().toISOString() }), { onlyIfNew: true });
    if (!first.modified) return json(409, { error: 'already_claimed' });
    if (phone) {
      const p = await xstore().set('gift/p/' + sha(phone.slice(-8)), JSON.stringify({ userId: u.id }), { onlyIfNew: true });
      if (!p.modified) { await xstore().delete(keyUser); return json(409, { error: 'phone_already_used' }); }
    }
    try {
      const now = new Date().toISOString();
      await fsUpdate('orders', (list) => [...(list || []), {
        id: orderId, userId: u.id, plat, svcName: 'Cadeau de bienvenue — ' + g.name, link, qty: g.qty, amount: 0,
        payMethod: 'gift', status: 'processing', createdAt: now, paidAt: now,
      }]);
      await fsUpdate('users', (list) => (list || []).map((x) => x.id === u.id
        ? { ...x, giftClaimed: true, orders: [...(x.orders || []), orderId] } : x));
    } catch (e) {
      await xstore().delete(keyUser); // l'écriture a échoué : le client peut réessayer
      if (phone) await xstore().delete('gift/p/' + sha(phone.slice(-8)));
      throw e;
    }
    return json(200, { ok: true, orderId, gift: g.name });
  } catch (e) {
    console.error('gift-claim', e.message);
    return json(502, { error: 'gift_unavailable' });
  }
};
