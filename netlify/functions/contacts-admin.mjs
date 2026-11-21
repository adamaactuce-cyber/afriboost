// POST /.netlify/functions/contacts-admin  { key, action:'count'|'vcf'|'csv'|'remove', phone? }   (clé admin = PUSH_ADMIN_KEY)
import { json } from './_lib.mjs';
import { adminKeyOk } from './_push.mjs';
import { xstore, sha, normPhone } from './_extra.mjs';

const esc = (s) => String(s).replace(/[\;,]/g, (m) => '\\' + m);
async function all() {
  const out = [];
  const { blobs } = await xstore().list({ prefix: 'contact/' });
  for (const b of blobs) { const v = await xstore().get(b.key, { type: 'json' }); if (v) out.push(v); }
  return out.sort((a, b) => a.at.localeCompare(b.at));
}

export default async (req) => {
  if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' });
  let b; try { b = await req.json(); } catch { return json(400, { error: 'bad_json' }); }
  const ok = adminKeyOk(b.key);
  if (ok === 'missing') return json(503, { error: 'push_admin_key_missing' });
  if (ok !== 'ok') return json(401, { error: 'bad_key' });
  try {
    if (b.action === 'remove') {
      const p = normPhone(b.phone); if (!p) return json(400, { error: 'bad_phone' });
      await xstore().delete('contact/' + sha(p.slice(-8))); return json(200, { ok: true });
    }
    const list = await all();
    if (b.action === 'count') return json(200, { count: list.length });
    if (b.action === 'vcf') {
      const body = list.map((c) => `BEGIN:VCARD\r\nVERSION:3.0\r\nFN:${esc(c.name)} (AfriBoost)\r\nTEL;TYPE=CELL:+${c.phone}\r\nEND:VCARD`).join('\r\n') + '\r\n';
      return new Response(body, { status: 200, headers: { 'content-type': 'text/vcard; charset=utf-8', 'cache-control': 'no-store' } });
    }
    if (b.action === 'csv') {
      const q = (s) => '"' + String(s).replace(/"/g, '""').replace(/^([=+\-@])/, "'$1") + '"';
      const body = 'nom,telephone,date\r\n' + list.map((c) => [q(c.name), q('+' + c.phone), q(c.at)].join(',')).join('\r\n') + '\r\n';
      return new Response(body, { status: 200, headers: { 'content-type': 'text/csv; charset=utf-8', 'cache-control': 'no-store' } });
    }
    return json(400, { error: 'bad_action' });
  } catch (e) {
    console.error('contacts-admin', e.message);
    return json(502, { error: 'contacts_unavailable' });
  }
};
