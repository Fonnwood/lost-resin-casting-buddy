/* POST /api/auth/verify { email, code } → sets the session cookie. */
'use strict';

const { send, readJson, checkPost, handler, HttpError, sessionCookie } = require('../_lib/http');
const config = require('../_lib/config');
const { normaliseEmail, codeHash, sameHash, newToken, tokenHash } = require('../_lib/auth');

module.exports = handler(async (req, res, store) => {
  checkPost(req);
  const body = await readJson(req, 4096);
  const email = normaliseEmail(body.email);
  const code = String(body.code || '').replace(/\D/g, '');
  const now = Date.now();

  const latest = await store.latestCode(email, now);
  if (!latest || latest.attempts >= config.codeAttempts) throw new HttpError(400, 'That code has expired. Please ask for a new one.', { expired: true });
  if (code.length !== 6 || !sameHash(latest.hash, codeHash(email, code))) {
    const n = await store.failCode(latest.id);
    if (n >= config.codeAttempts) {
      await store.consumeCode(latest.id);
      throw new HttpError(400, 'Too many wrong attempts. Please ask for a new code.', { expired: true });
    }
    throw new HttpError(400, 'That code isn’t right. Check the newest email and try again.');
  }
  if (!(await store.consumeCode(latest.id))) throw new HttpError(400, 'That code has already been used. Please ask for a new one.', { expired: true });

  const userId = await store.upsertUser(email);
  const token = newToken();
  const maxAge = config.sessionDays * 86400;
  await store.createSession(tokenHash(token), userId, now + maxAge * 1000);
  send(res, 200, { email }, { 'Set-Cookie': sessionCookie(req, token, maxAge) });
});
