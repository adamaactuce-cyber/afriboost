// POST { action, … } — actions réservées à l'admin, vérifiées sur le serveur.
//  order-status {id,status} · deposit {id,decision:'activate'|'reject'} · user-reseller {id}
//  user-balance {id,balance} · user-password {id,password} · reset-stats {}
import { json, fsUpdate, fsRead } from './_lib.mjs';
import { whoami, bodyOf, cleanLine } from './_gate.mjs';
import { setPassword, PASS_MIN, PASS_MAX } from './_auth.mjs';

const STATUS = ['pending', 'processing', 'completed', 'failed'];

export default async (req) => {
  if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' });
  const me = await whoami(req);
  if (!me) return json(401, { error: 'not_logged_in' });
  if (!me.isAdmin) return json(403, { error: 'forbidden' });
  const b = await bodyOf(req);
  if (!b) return json(400, { error: 'bad_json' });
  const id = cleanLine(b.id, 80);
  try {
    switch (b.action) {
      case 'order-status': {
        if (!STATUS.includes(b.status)) return json(400, { error: 'bad_status' });
        let found = false, refund = null;
        await fsUpdate('orders', (list) => (list || []).map((o) => {
          if (o.id !== id) return o;
          found = true;
          if (b.status === 'failed' && o.status !== 'failed' && o.payMethod === 'balance') refund = { userId: o.userId, amount: o.amount };
          return { ...o, status: b.status };
        }));
        if (!found) return json(404, { error: 'not_found' });
        if (refund) await fsUpdate('users', (list) => (list || []).map((u) => (u.id === refund.userId ? { ...u, balance: (u.balance || 0) + refund.amount } : u)));
        return json(200, { ok: true, refunded: refund ? refund.amount : 0 });
      }
      case 'deposit': {
        if (!['activate', 'reject'].includes(b.decision)) return json(400, { error: 'bad_decision' });
        let dep = null;
        await fsUpdate('deposits', (list) => (list || []).map((d) => {
          if (d.id !== id || d.status !== 'pending') return d;
          dep = d;
          return b.decision === 'activate' ? { ...d, status: 'activated', activatedAt: new Date().toISOString() } : { ...d, status: 'rejected', rejectedAt: new Date().toISOString() };
        }));
        if (!dep) return json(404, { error: 'not_found_or_done' });
        if (b.decision === 'activate') await fsUpdate('users', (list) => (list || []).map((u) => (u.id === dep.userId ? { ...u, balance: (u.balance || 0) + dep.amount } : u)));
        return json(200, { ok: true });
      }
      case 'user-reseller': {
        let v = null;
        await fsUpdate('users', (list) => (list || []).map((u) => (u.id === id ? { ...u, isReseller: (v = !u.isReseller) } : u)));
        return v === null ? json(404, { error: 'not_found' }) : json(200, { ok: true, isReseller: v });
      }
      case 'user-balance': {
        const n = Number(b.balance);
        if (!Number.isInteger(n) || n < 0 || n > 100000000) return json(400, { error: 'bad_amount' });
        let ok = false;
        await fsUpdate('users', (list) => (list || []).map((u) => (u.id === id ? ((ok = true), { ...u, balance: n }) : u)));
        return ok ? json(200, { ok: true }) : json(404, { error: 'not_found' });
      }
      case 'user-password': {
        const pw = String(b.password ?? '');
        if (pw.length < PASS_MIN) return json(400, { error: 'password_too_short' });
        if (pw.length > PASS_MAX) return json(400, { error: 'password_too_long' });
        const target = ((await fsRead('users')).data || []).find((u) => u.id === id);
        if (!target) return json(404, { error: 'not_found' });
        await setPassword(target.id, String(target.email).toLowerCase(), pw);
        return json(200, { ok: true });
      }
      case 'reset-stats': {
        await fsUpdate('orders', () => []); await fsUpdate('deposits', () => []);
        return json(200, { ok: true });
      }
      default: return json(400, { error: 'bad_action' });
    }
  } catch (e) { console.error('admin-act', e.message); return json(502, { error: 'admin_unavailable' }); }
};
