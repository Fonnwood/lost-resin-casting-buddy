/* POST /api/auth/request-code { email } → emails a 6-digit sign-in code.
 * There is no separate sign-up: the first verified code creates the account. */
'use strict';

const { send, readJson, checkPost, handler, HttpError } = require('../_lib/http');
const config = require('../_lib/config');
const { normaliseEmail, newCode, codeHash } = require('../_lib/auth');
const { sendCode } = require('../_lib/email');

module.exports = handler(async (req, res, store) => {
  checkPost(req);
  const body = await readJson(req, 4096);
  const email = normaliseEmail(body.email);
  const now = Date.now();

  const stats = await store.codeStats(email, now);
  const wait = stats.lastAt ? Math.ceil((stats.lastAt + config.codeResendSeconds * 1000 - now) / 1000) : 0;
  if (wait > 0) throw new HttpError(429, 'Please wait ' + wait + ' s before asking for another code.', { retryAfter: wait, 'Retry-After': String(wait) });
  if (stats.hour >= config.codesPerHour || stats.day >= config.codesPerDay) {
    throw new HttpError(429, 'Too many codes requested for this address. Please try again later.', { 'Retry-After': '3600' });
  }

  const code = newCode();
  await store.createCode(email, codeHash(email, code), now + config.codeMinutes * 60000);
  await sendCode(email, code);
  // Housekeeping now and then: expired codes and sessions (no cron job needed).
  if (Math.random() < 0.1) await store.cleanup(now).catch((err) => console.error('cleanup failed', err));
  send(res, 200, { ok: true, expiresInMinutes: config.codeMinutes });
});
