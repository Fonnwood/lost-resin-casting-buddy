/* Email-code sign-in: codes and session tokens are random, and only their
 * SHA-256 hashes are stored. */
'use strict';

const crypto = require('node:crypto');
const { HttpError, parseCookies, COOKIE } = require('./http');

const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');

/** Lower-cased, trimmed, plausibly an address. Throws a 400 otherwise. */
function normaliseEmail(raw) {
  const email = String(raw || '').trim().toLowerCase();
  if (email.length > 254 || !/^[^\s@"<>(),;:\\[\]]+@[^\s@"<>(),;:\\[\]]+\.[^\s@"<>(),;:\\[\]]{2,}$/.test(email)) {
    throw new HttpError(400, 'Please enter a valid email address.');
  }
  return email;
}

function newCode() { return String(crypto.randomInt(0, 1000000)).padStart(6, '0'); }
function codeHash(email, code) { return sha256('code:' + email + ':' + code); }
function newToken() { return crypto.randomBytes(32).toString('base64url'); }
function tokenHash(token) { return sha256('session:' + token); }

function sameHash(a, b) {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

/** The signed-in user ({ userId, email }) or null. */
async function currentUser(req, store) {
  const token = parseCookies(req)[COOKIE];
  if (!token || token.length > 200) return null;
  return store.sessionUser(tokenHash(token), Date.now());
}

async function requireUser(req, store) {
  const user = await currentUser(req, store);
  if (!user) throw new HttpError(401, 'Not signed in.');
  return user;
}

module.exports = { normaliseEmail, newCode, codeHash, newToken, tokenHash, sameHash, currentUser, requireUser };
