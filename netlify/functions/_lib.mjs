// Code partagé : SasPay, Firestore (même base que le site), stockage serveur des paiements.
import { getStore } from '@netlify/blobs';
import { CATALOG, RESELLER_DISCOUNT } from './_catalog.mjs';

const SASPAY_BASE = 'https://api.saspay.me/api/v1';
// Clé Firebase *publique* déjà présente dans index.html (pas un secret). Surchargeable par variable d'env.
const FB_API = process.env.FIREBASE_API_KEY || 'AIzaSyCqzlqNCnoi39GAk8Ydpt3kJFbX_oYGFY0';
const FB_PROJ = process.env.FIREBASE_PROJECT_ID || 'afriboost-16b5e';
const FS = `https://firestore.googleapis.com/v1/projects/${FB_PROJ}/databases/(default)/documents/afriboost/`;

export const json = (status, body) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });

export const store = () => globalThis.__AB_TEST_STORE || getStore({ name: 'saspay-payments', consistency: 'strong' });

// ── SasPay ──────────────────────────────────────────────
export function saspayKey() {
  const key = process.env.SASPAY_SECRET_KEY || '';
  const mode = (process.env.SASPAY_MODE || 'test').toLowerCase();
  if (!key) throw new Error('SASPAY_SECRET_KEY manquante');
  if (mode === 'test' && !key.startsWith('sk_test_')) throw new Error('SASPAY_MODE=test exige une clé sk_test_…');
  if (mode === 'live' && !key.startsWith('sk_live_')) throw new Error('SASPAY_MODE=live exige une clé sk_live_…');
  return key;
}

// La doc montre deux formes de réponse : {success,data,code} ou objet direct. On accepte les deux.
const unwrap = (j) => (j && typeof j === 'object' && 'data' in j && 'success' in j ? j.data : j);

export async function saspay(method, path, body) {
  const res = await fetch(SASPAY_BASE + path, {
    method,
    headers: { Authorization: 'Bearer ' + saspayKey(), 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(20000),
  });
  const text = await res.text();
  let j = null; try { j = text ? JSON.parse(text) : null; } catch { /* non JSON */ }
  if (!res.ok) {
    const err = new Error('SasPay HTTP ' + res.status + ' ' + (j && (j.message || j.code) || ''));
    err.status = res.status; throw err;
  }
  return unwrap(j);
}

// ── Firestore (documents "afriboost/<clé>" = {value: JSON en chaîne}) ──
export async function fsRead(key) {
  const r = await fetch(FS + key + '?key=' + FB_API);
  if (r.status === 404) return { data: null, updateTime: null };
  if (!r.ok) throw new Error('Firestore lecture ' + key + ' : ' + r.status);
  const d = await r.json();
  const s = d.fields && d.fields.value && d.fields.value.stringValue;
  return { data: s ? JSON.parse(s) : null, updateTime: d.updateTime || null };
}
// Écriture avec précondition updateTime : évite d'écraser une modification concurrente (course read-modify-write).
async function fsWrite(key, value, updateTime) {
  const q = new URLSearchParams({ key: FB_API });
  if (updateTime) q.set('currentDocument.updateTime', updateTime); else q.set('currentDocument.exists', 'false');
  const r = await fetch(FS + key + '?' + q, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields: { value: { stringValue: JSON.stringify(value) } } }),
  });
  if (r.status === 409 || r.status === 400 || r.status === 412) return false; // précondition échouée
  if (!r.ok) throw new Error('Firestore écriture ' + key + ' : ' + r.status);
  return true;
}
export async function fsUpdate(key, mutate, tries = 6) {
  for (let i = 0; i < tries; i++) {
    const { data, updateTime } = await fsRead(key);
    const next = mutate(data);
    if (await fsWrite(key, next, updateTime)) return next;
    await new Promise(r => setTimeout(r, 150 * (i + 1) + Math.random() * 150));
  }
  throw new Error('Firestore : conflit persistant sur ' + key);
}

// ── Prix : toujours recalculé côté serveur ──
export async function computePrice({ plat, svc, type, qty, packId, promoCode, userId }) {
  let user = null;
  if (userId) {
    const { data: users } = await fsRead('users');
    user = (users || []).find(u => u.id === userId) || null;
  }
  if (plat === 'pack') {
    const { data: packs } = await fsRead('packs');
    const p = (packs || []).find(x => x.id === packId);
    if (!p || !(Number(p.price) > 0)) throw new Error('Pack introuvable');
    return { amount: Math.round(Number(p.price)), label: p.name, svcName: p.name + ' — Pack', qty: 1, user };
  }
  const t = CATALOG[plat] && CATALOG[plat][svc] && CATALOG[plat][svc][type];
  if (!t) throw new Error('Service inconnu');
  if (!Number.isInteger(qty) || qty < t.min || qty > t.max) throw new Error(`Quantité entre ${t.min} et ${t.max}`);
  let total = Math.round((qty / 1000) * t.rate);
  if (user && user.isReseller) total = Math.round(total * (1 - RESELLER_DISCOUNT / 100));
  let promo = null;
  if (promoCode) {
    const { data: promos } = await fsRead('promoCodes');
    const p = (promos || []).find(x => x.code === String(promoCode).trim().toUpperCase());
    if (p && !(p.expiresAt && new Date(p.expiresAt) < new Date()) && p.percent > 0 && p.percent <= 100) {
      total = Math.round(total * (1 - p.percent / 100)); promo = p.code;
    }
  }
  if (total <= 0) throw new Error('Montant invalide');
  return { amount: total, label: svc + ' ' + type + ' × ' + qty, svcName: svc + ' — ' + type, qty, promo, user };
}

// ── Recharge du solde : montant validé côté serveur ──
export const DEPOSIT_MAX = 1000000;
export async function computeDeposit(amount) {
  const { data: cfg } = await fsRead('siteConfig');
  const min = Math.max(100, Number(cfg && cfg.minDeposit) || 500);
  if (!Number.isInteger(amount) || amount < min) throw new Error('Montant minimum : ' + min + ' XOF');
  if (amount > DEPOSIT_MAX) throw new Error('Montant maximum : ' + DEPOSIT_MAX + ' XOF');
  return { amount, label: 'Recharge du solde — ' + amount + ' XOF', svcName: 'Recharge du solde', qty: 1 };
}

// ── Statut + finalisation (idempotente) ──
const dec = (s) => Math.round(parseFloat(s) * 100);

// Interroge SasPay et renvoie l'état fiable : 'paid' | 'failed' | 'cancelled' | 'expired' | 'pending'
export async function checkWithSaspay(intent) {
  const sess = await saspay('GET', `/checkout-sessions/${intent.sessionId}/`);
  if (sess.status === 'CANCELLED') return { state: 'cancelled' };
  if (sess.status === 'EXPIRED') return { state: 'expired' };
  const txId = sess.transaction && (sess.transaction.id || sess.transaction);
  if (!txId) return { state: 'pending' };
  const tx = await saspay('GET', `/payments/${txId}/verify/`);
  if (tx.status === 'FAILED') return { state: 'failed', txId };
  if (tx.status === 'SUCCESS' && sess.status === 'PAID') {
    // Contrôle du montant et de la devise : jamais de confiance aveugle.
    if (tx.currency !== 'XOF' || dec(tx.requested_amount) !== intent.amount * 100 || dec(sess.amount) !== intent.amount * 100)
      return { state: 'mismatch', txId };
    return { state: 'paid', txId, reference: tx.reference };
  }
  return { state: 'pending', txId };
}

// Applique le paiement confirmé dans Firestore UNE seule fois (verrou onlyIfNew + contrôle d'existence par id).
export async function finalizePaid(intent, info) {
  const s = store();
  const lock = await s.set('lock/' + intent.orderId, new Date().toISOString(), { onlyIfNew: true });
  if (!lock.modified) return false; // déjà traité (ou en cours) par un autre appel
  try {
    if (intent.kind === 'deposit') {
      const now = new Date().toISOString();
      let userName = '', userPhone = '';
      await fsUpdate('users', (users) => {
        const list = users || [];
        const i = list.findIndex(u => u.id === intent.userId);
        if (i < 0) throw new Error('Utilisateur introuvable pour la recharge ' + intent.orderId);
        const u = list[i]; u.depositIds = u.depositIds || [];
        userName = u.name || ''; userPhone = u.phone || '';
        if (!u.depositIds.includes(intent.orderId)) { // crédit unique, même si on réessaie après un échec partiel
          u.depositIds.push(intent.orderId);
          u.balance = (u.balance || 0) + intent.amount;
        }
        return list;
      });
      await fsUpdate('deposits', (deps) => {
        const list = deps || [];
        return list.some(d => d.id === intent.orderId) ? list : [...list, {
          id: intent.orderId, userId: intent.userId, userName, userPhone, amount: intent.amount,
          method: 'saspay', txCode: info.reference || info.txId, status: 'activated',
          createdAt: intent.createdAt, activatedAt: now,
        }];
      });
    } else {
      const order = {
        id: intent.orderId, userId: intent.userId, plat: intent.plat, svcName: intent.svcName,
        link: intent.link, qty: intent.qty, amount: intent.amount,
        payMethod: 'saspay', saspayTxId: info.txId, saspayRef: info.reference || null,
        promoCode: intent.promo || null, status: 'processing', paidAt: new Date().toISOString(),
        createdAt: intent.createdAt,
      };
      await fsUpdate('orders', (orders) => {
        const list = orders || [];
        return list.some(o => o.id === order.id) ? list : [...list, order];
      });
      await fsUpdate('users', (users) => {
        const list = users || [];
        const i = list.findIndex(u => u.id === intent.userId);
        if (i >= 0) {
          const u = list[i]; u.orders = u.orders || [];
          if (!u.orders.includes(intent.orderId)) {
            u.orders.push(intent.orderId);
            if (u.referredBy) { // commission parrainage, identique au flux existant
              const r = list.findIndex(x => x.id === u.referredBy);
              if (r >= 0) { const c = Math.round(intent.amount * 0.10);
                list[r].balance = (list[r].balance || 0) + c; list[r].referralEarnings = (list[r].referralEarnings || 0) + c; }
            }
          }
        }
        return list;
      });
    }
    intent.status = 'paid'; intent.txId = info.txId; intent.paidAt = new Date().toISOString();
    await s.setJSON('intent/' + intent.orderId, intent);
    return true;
  } catch (e) {
    await s.delete('lock/' + intent.orderId); // permet une nouvelle tentative
    throw e;
  }
}

// Vérifie + finalise un paiement ; renvoie l'état à afficher au client.
export async function reconcile(orderId) {
  const s = store();
  const intent = await s.get('intent/' + orderId, { type: 'json' });
  if (!intent) return { state: 'unknown' };
  const k = { kind: intent.kind || 'order', amount: intent.amount };
  if (intent.status === 'paid') return { state: 'paid', orderId, ...k };
  const r = await checkWithSaspay(intent);
  if (r.state === 'paid') { await finalizePaid(intent, r); return { state: 'paid', orderId, ...k }; }
  if (r.state === 'mismatch') {
    intent.status = 'mismatch'; await s.setJSON('intent/' + orderId, intent);
    console.error('SASPAY MISMATCH', orderId, r.txId);
  } else if (r.state !== 'pending' && intent.status !== r.state) {
    intent.status = r.state; await s.setJSON('intent/' + orderId, intent);
  }
  return { state: r.state, orderId, ...k };
}
