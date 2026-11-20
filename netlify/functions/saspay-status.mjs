// GET /.netlify/functions/saspay-status?order=ORD...
// Interroge SasPay (source de vérité) et finalise la commande si — et seulement si — le paiement est confirmé.
import { json, reconcile } from './_lib.mjs';

export default async (req) => {
  const orderId = new URL(req.url).searchParams.get('order') || '';
  if (!/^(ORD|DEP)[0-9]{10,}[0-9A-F]{6}$/.test(orderId)) return json(400, { error: 'bad_order' });
  try {
    const r = await reconcile(orderId);
    return json(200, { state: r.state, kind: r.kind, amount: r.amount }); // paid | pending | failed | cancelled | expired | mismatch | unknown
  } catch (e) {
    console.error('saspay-status', e.message);
    return json(502, { state: 'error' });
  }
};
