// POST /.netlify/functions/contacts-join  { name, phone, consent:true }
// Enregistre un contact WhatsApp avec consentement. Les numéros ne sont lisibles que par l'admin (contacts-admin).
import { json } from './_lib.mjs';
import { xstore, sha, cleanTxt, normPhone, rateLimit } from './_extra.mjs';

export default async (req) => {
  if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' });
  let b; try { b = await req.json(); } catch { return json(400, { error: 'bad_json' }); }
  if (b.consent !== true) return json(400, { error: 'consent_required' });
  const name = cleanTxt(b.name, 60), phone = normPhone(b.phone);
  if (!name) return json(400, { error: 'name_required' });
  if (!phone) return json(400, { error: 'bad_phone' });
  try {
    if (!(await rateLimit(req, 'contacts', 8))) return json(429, { error: 'too_many_requests' });
    const k = 'contact/' + sha(phone.slice(-8));
    const r = await xstore().set(k, JSON.stringify({ name, phone, at: new Date().toISOString() }), { onlyIfNew: true });
    return json(200, { ok: true, already: !r.modified });
  } catch (e) {
    console.error('contacts-join', e.message);
    return json(502, { error: 'contacts_unavailable' });
  }
};
