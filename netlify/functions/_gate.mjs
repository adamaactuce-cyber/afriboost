// Porte d'entrée sécurisée : qui est connecté ? a-t-il le droit ? (vérifié sur le serveur, jamais sur le navigateur)
import { sessionUser, publicUser } from './_auth.mjs';
export { publicUser };

export const bearer = (req) => { const h = req.headers.get('authorization') || ''; return h.startsWith('Bearer ') ? h.slice(7) : ''; };
export const whoami = (req) => sessionUser(bearer(req));

// Données de configuration lisibles par tout le monde (aucune donnée de client dedans).
export const PUBLIC_KEYS = ['siteConfig', 'socialLinks', 'promoBanner', 'packs', 'testimonials', 'legalText', 'maintenanceMode', 'announcements', 'faqItems', 'siteLogo', 'visitorCount'];
// Données que seul l'admin peut modifier depuis le navigateur.
export const ADMIN_WRITE_KEYS = ['siteConfig', 'socialLinks', 'promoBanner', 'packs', 'testimonials', 'legalText', 'maintenanceMode', 'announcements', 'faqItems', 'siteLogo', 'promoCodes'];

export const cleanLine = (s, n) => String(s ?? '').replace(/[\u0000-\u001f\u007f<>]/g, '').trim().slice(0, n);
export async function bodyOf(req) { try { return await req.json(); } catch { return null; } }
