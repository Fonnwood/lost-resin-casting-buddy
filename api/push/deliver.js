/* Sends push notifications that are due.
 *
 * POST { device } — from Upstash QStash at an alert time (signed request).
 * GET             — from any cron, with `Authorization: Bearer $CRON_SECRET`:
 *                   delivers everything due on every device (a safety net, or
 *                   the only trigger on hosts without QStash). */
'use strict';

const { send, handler, HttpError, originOf } = require('../_lib/http');
const config = require('../_lib/config');
const push = require('../_lib/push');
const crypto = require('node:crypto');

async function rawBody(req) {
  // Vercel hands us the parsed JSON; we published it as JSON.stringify({ device }), so re-serialising gives the same bytes.
  let body;
  try { body = req.body; } catch (e) { throw new HttpError(400, 'Invalid body.'); }
  if (body === undefined) {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    return Buffer.concat(chunks).toString('utf8');
  }
  if (Buffer.isBuffer(body)) return body.toString('utf8');
  return typeof body === 'string' ? body : JSON.stringify(body);
}

function sameSecret(given, secret) {
  const a = Buffer.from(String(given));
  const b = Buffer.from('Bearer ' + secret);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

module.exports = handler(async (req, res, store) => {
  const now = Date.now();
  const origin = originOf(req);

  if (req.method === 'GET') {
    if (!config.cronSecret || !sameSecret(req.headers.authorization || '', config.cronSecret)) throw new HttpError(401, 'Not authorised.');
    let sent = 0;
    for (const id of await store.devicesWithDueAlerts(now + push.DUE_WINDOW)) sent += (await push.deliverDevice(store, id, origin, now)).sent;
    if (Math.random() < 0.05) await store.cleanup(now).catch((err) => console.error('cleanup failed', err));
    return send(res, 200, { ok: true, sent });
  }

  if (req.method !== 'POST') throw new HttpError(405, 'Method not allowed.', { Allow: 'GET, POST' });
  const raw = await rawBody(req);
  const url = (config.appUrl || origin) + '/api/push/deliver';
  if (!push.verifyQstash(req.headers['upstash-signature'], raw, url, now)) throw new HttpError(401, 'Invalid signature.');
  let id;
  try { id = JSON.parse(raw).device; } catch (e) { id = null; }
  if (typeof id !== 'string' || !/^[0-9a-f]{64}$/.test(id)) throw new HttpError(400, 'Invalid device.');
  const out = await push.deliverDevice(store, id, origin, now);
  send(res, 200, Object.assign({ ok: true }, out));
});
