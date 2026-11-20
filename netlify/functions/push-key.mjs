// GET : clé publique pour que le navigateur puisse s'abonner aux notifications.
import { json } from './_lib.mjs';
import { vapid } from './_push.mjs';

export default async () => {
  try { return json(200, { publicKey: (await vapid()).publicKey }); }
  catch (e) { console.error('push-key', e.message); return json(502, { error: 'push_unavailable' }); }
};
