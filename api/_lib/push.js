/* Push notifications: deliver a device's due alerts, and arrange to be woken
 * at the next one. A phone can't run timers while it sleeps, so the device
 * sends its upcoming alerts here (api/push/schedule.js) and this sends them
 * at the right moment through the browser's push service.
 *
 * Waking up: Upstash QStash calls api/push/deliver at the next alert time
 * (any Vercel plan). Alternatively, any cron can call GET api/push/deliver
 * with CRON_SECRET. In local development a timer is used. */
'use strict';

const crypto = require('node:crypto');
const config = require('./config');

/** Alerts this close are sent now: QStash wakes us at or just after an alert (rounded up to the second), and clocks differ slightly. */
const DUE_WINDOW = 1000;

let webpush = null;
let devKeys = null;

/** VAPID keys: from the environment, or made up per process in development. */
function vapid() {
  if (config.vapidPublicKey && config.vapidPrivateKey) return { publicKey: config.vapidPublicKey, privateKey: config.vapidPrivateKey };
  if (config.dev) {
    if (!devKeys) devKeys = require('web-push').generateVAPIDKeys();
    return devKeys;
  }
  return null;
}

/** Push works when there are keys and something to wake the server at alert times. */
function enabled() {
  return !!(vapid() && (config.qstashToken || config.cronSecret || config.dev));
}

function publicKey() { return enabled() ? vapid().publicKey : null; }

function client() {
  if (!webpush) webpush = require('web-push');
  const k = vapid();
  webpush.setVapidDetails(config.vapidSubject || 'mailto:admin@example.com', k.publicKey, k.privateKey);
  return webpush;
}

const deviceId = (endpoint) => crypto.createHash('sha256').update('push:' + endpoint).digest('hex');

/** Send everything due for one device, then arrange the next wake-up. */
async function deliverDevice(store, id, origin, now) {
  const device = await store.pushDevice(id);
  if (!device) return { sent: 0 };
  const due = await store.claimDueAlerts(id, now + DUE_WINDOW);
  const staleBefore = now - config.pushStaleMinutes * 60000;
  let sent = 0;
  for (const a of due) {
    if (a.at < staleBefore) continue;
    try {
      // web-push signs (VAPID) and encrypts the message; we send it with fetch.
      const r = await client().generateRequestDetails(
        { endpoint: device.endpoint, keys: { p256dh: device.p256dh, auth: device.auth } },
        JSON.stringify({ title: a.title, body: a.body, tag: a.key }),
        { TTL: 15 * 60, urgency: 'high' });
      const res = await fetch(r.endpoint, { method: r.method, headers: r.headers, body: r.body });
      // 404/410: the browser dropped this subscription (notifications turned off, app removed).
      if (res.status === 404 || res.status === 410) { await store.deletePushDevice(id); return { sent, gone: true }; }
      if (!res.ok) console.error('Push send failed', res.status, await res.text().catch(() => ''));
      else sent++;
    } catch (err) {
      console.error('Push send failed', err.message);
    }
  }
  await scheduleNext(store, id, origin, now);
  return { sent };
}

/**
 * Make sure a wake-up is booked for the device's next alert. A wake-up that
 * turns out early or duplicated is harmless: delivery only sends what's due,
 * and only once.
 */
async function scheduleNext(store, id, origin, now) {
  const next = await store.nextAlertAt(id);
  const device = await store.pushDevice(id);
  if (!device) return null;
  if (next == null) { if (device.nextAt != null) await store.setPushNextAt(id, null); return null; }
  const booked = device.nextAt;
  // A wake-up booked ahead of us that comes before `next` will handle it. One within the
  // delivery window is the wake-up being handled right now (timers and clocks can be a little early).
  if (booked != null && booked > now + DUE_WINDOW && booked <= next) return next;
  // Record first: an imminent wake-up can fire before this function returns.
  await store.setPushNextAt(id, next);
  try {
    await wakeAt(store, id, origin, next);
  } catch (err) {
    await store.setPushNextAt(id, null); // not booked after all: let the next update try again
    throw err;
  }
  return next;
}

const timers = new Map();

async function wakeAt(store, id, origin, at) {
  if (config.qstashToken) {
    const url = (config.appUrl || origin) + '/api/push/deliver';
    const r = await fetch(config.qstashUrl + '/v2/publish/' + url, {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + config.qstashToken, 'Content-Type': 'application/json', 'Upstash-Not-Before': String(Math.ceil(at / 1000)) },
      body: JSON.stringify({ device: id }),
    });
    if (!r.ok) throw new Error('QStash publish failed: ' + r.status + ' ' + (await r.text().catch(() => '')));
    return;
  }
  if (config.dev) {
    clearTimeout(timers.get(id));
    const t = setTimeout(() => {
      timers.delete(id);
      deliverDevice(store, id, origin, Date.now()).catch((err) => console.error('dev push delivery failed', err));
    }, Math.max(0, at - Date.now()));
    if (t.unref) t.unref();
    timers.set(id, t);
  }
  // Otherwise a cron calling GET /api/push/deliver picks it up.
}

/** Check a QStash callback's Upstash-Signature (a JWT signed with our signing keys). */
function verifyQstash(jwt, rawBody, url, now) {
  const parts = String(jwt || '').split('.');
  if (parts.length !== 3 || !config.qstashSigningKeys.length) return false;
  const [header, payload, sig] = parts;
  const ok = config.qstashSigningKeys.some((key) => {
    const expect = crypto.createHmac('sha256', key).update(header + '.' + payload).digest('base64url');
    return expect.length === sig.replace(/=+$/, '').length && crypto.timingSafeEqual(Buffer.from(expect), Buffer.from(sig.replace(/=+$/, '')));
  });
  if (!ok) return false;
  let p;
  try { p = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')); } catch (e) { return false; }
  const secs = Math.floor(now / 1000);
  if (p.iss !== 'Upstash' || String(p.sub || '').replace(/\/+$/, '') !== url.replace(/\/+$/, '')) return false;
  if (!(secs <= p.exp && secs >= p.nbf - 5)) return false;
  const hash = crypto.createHash('sha256').update(rawBody).digest('base64url');
  return String(p.body || '').replace(/=+$/, '') === hash;
}

module.exports = { enabled, publicKey, deviceId, deliverDevice, scheduleNext, verifyQstash, DUE_WINDOW, _timers: timers };
