/* POST /api/push/schedule { subscription, alerts: [{ key, at, title, body }] }
 *   → { ok, next }   Replace this device's upcoming alerts (an empty list clears them).
 * POST /api/push/schedule { endpoint, unsubscribe: true }
 *   → { ok }         Forget this device.
 *
 * No account needed: a device is identified by its push subscription, which
 * only that browser knows. Stored: the subscription and the alert times and
 * wording — nothing about the person. */
'use strict';

const { send, readJson, checkPost, handler, HttpError, originOf } = require('../_lib/http');
const config = require('../_lib/config');
const push = require('../_lib/push');

const b64url = /^[A-Za-z0-9_-]{16,200}={0,2}$/;

function parseSubscription(s) {
  if (!s || typeof s !== 'object') throw new HttpError(400, 'Missing push subscription.');
  const endpoint = String(s.endpoint || '');
  // Real push services are HTTPS; a local fake one is allowed in development.
  const local = config.dev && /^http:\/\/(127\.0\.0\.1|localhost)[:/]/.test(endpoint);
  if ((!/^https:\/\/\S+$/.test(endpoint) && !local) || endpoint.length > 1000) throw new HttpError(400, 'Invalid push endpoint.');
  const keys = s.keys || {};
  if (!b64url.test(keys.p256dh || '') || !b64url.test(keys.auth || '')) throw new HttpError(400, 'Invalid push subscription keys.');
  return { id: push.deviceId(endpoint), endpoint, p256dh: keys.p256dh, auth: keys.auth };
}

function parseAlerts(list, now) {
  if (!Array.isArray(list)) throw new HttpError(400, '`alerts` must be an array.');
  if (list.length > config.maxPushAlerts) throw new HttpError(413, 'Too many alerts (max ' + config.maxPushAlerts + ').');
  const seen = new Set();
  const out = [];
  list.forEach((a, i) => {
    if (!a || typeof a !== 'object') throw new HttpError(400, 'Alert ' + i + ' is not an object.');
    const at = Number(a.at);
    if (!Number.isFinite(at)) throw new HttpError(400, 'Alert ' + i + ' has an invalid time.');
    if (at > now + config.pushHorizonHours * 3600000) throw new HttpError(400, 'Alert ' + i + ' is too far ahead.');
    if (at < now - config.pushStaleMinutes * 60000) return; // already past: nothing to send
    const key = String(a.key || '').slice(0, 200);
    const title = String(a.title || '').trim().slice(0, 140);
    if (!key || !title) throw new HttpError(400, 'Alert ' + i + ' needs a key and a title.');
    const id = key + '@' + Math.floor(at);
    if (seen.has(id)) return;
    seen.add(id);
    out.push({ key, at: Math.floor(at), title, body: String(a.body || '').trim().slice(0, 300) });
  });
  return out;
}

module.exports = handler(async (req, res, store) => {
  checkPost(req);
  if (!push.enabled()) throw new HttpError(503, 'Notifications are not configured on this server.');
  const body = await readJson(req, 64 * 1024);
  const now = Date.now();

  if (body.unsubscribe) {
    const endpoint = String(body.endpoint || '');
    if (endpoint) await store.deletePushDevice(push.deviceId(endpoint));
    return send(res, 200, { ok: true });
  }

  const device = parseSubscription(body.subscription);
  const alerts = parseAlerts(body.alerts, now);
  await store.upsertPushDevice(device, now);
  await store.replacePushAlerts(device.id, alerts);
  const next = await push.scheduleNext(store, device.id, originOf(req), now);
  send(res, 200, { ok: true, next });
});
