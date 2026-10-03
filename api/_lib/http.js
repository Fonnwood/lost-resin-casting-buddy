/* Tiny request/response helpers on plain Node http objects, so the same
 * handlers run as Vercel Functions and under scripts/serve.js. */
'use strict';

const { getStore } = require('./store');

class HttpError extends Error {
  constructor(status, message, extra) {
    super(message);
    this.status = status;
    this.extra = extra;
  }
}

function send(res, status, body, headers) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  Object.entries(headers || {}).forEach(([k, v]) => res.setHeader(k, v));
  res.end(JSON.stringify(body));
}

async function readJson(req, limit) {
  // Vercel pre-parses the body (and throws on malformed JSON); plain Node hands us the stream.
  let body;
  try { body = req.body; } catch (e) { throw new HttpError(400, 'Invalid JSON.'); }
  if (body === undefined) {
    const chunks = [];
    let size = 0;
    for await (const c of req) {
      size += c.length;
      if (size > limit) throw new HttpError(413, 'Request too large.');
      chunks.push(c);
    }
    body = Buffer.concat(chunks).toString('utf8');
  }
  if (Buffer.isBuffer(body)) body = body.toString('utf8');
  if (typeof body === 'string') {
    if (body.length > limit) throw new HttpError(413, 'Request too large.');
    try { body = body ? JSON.parse(body) : {}; } catch (e) { throw new HttpError(400, 'Invalid JSON.'); }
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new HttpError(400, 'Expected a JSON object.');
  return body;
}

function parseCookies(req) {
  const out = {};
  String(req.headers.cookie || '').split(';').forEach((part) => {
    const i = part.indexOf('=');
    if (i < 0) return;
    const k = part.slice(0, i).trim();
    if (!k) return;
    try { out[k] = decodeURIComponent(part.slice(i + 1).trim()); } catch (e) { /* ignore malformed */ }
  });
  return out;
}

function isHttps(req) {
  const proto = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim();
  return proto === 'https' || !!(req.socket && req.socket.encrypted);
}

/** This site's own origin, as the browser reached it. */
function originOf(req) {
  const host = String(req.headers['x-forwarded-host'] || req.headers.host || '').split(',')[0].trim();
  return (isHttps(req) ? 'https' : 'http') + '://' + host;
}

/** Session cookie: HttpOnly, SameSite=Lax, Secure whenever served over HTTPS. */
function sessionCookie(req, token, maxAgeSeconds) {
  return [
    COOKIE + '=' + (token ? encodeURIComponent(token) : ''),
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    'Max-Age=' + Math.max(0, Math.floor(maxAgeSeconds)),
  ].concat(isHttps(req) ? ['Secure'] : []).join('; ');
}
const COOKIE = 'cb_session';

/** State-changing requests must be same-origin JSON: a cross-site form can't send that without a CORS preflight we never grant. */
function checkPost(req) {
  if (req.method !== 'POST') throw new HttpError(405, 'Method not allowed.', { Allow: 'POST' });
  if (!/^application\/json\b/i.test(String(req.headers['content-type'] || ''))) throw new HttpError(415, 'Expected application/json.');
  const origin = req.headers.origin;
  if (origin) {
    const host = String(req.headers['x-forwarded-host'] || req.headers.host || '').split(',')[0].trim();
    let ok = false;
    try { ok = new URL(origin).host === host; } catch (e) { ok = false; }
    if (!ok) throw new HttpError(403, 'Cross-origin request refused.');
  }
}

/** Wrap a handler: store lookup, errors as JSON, nothing cached. */
function handler(fn) {
  return async (req, res) => {
    try {
      const store = getStore();
      if (!store) throw new HttpError(503, 'Accounts are not configured on this server.', { accounts: false });
      await fn(req, res, store);
    } catch (err) {
      if (err instanceof HttpError) {
        const headers = {};
        const body = { error: err.message };
        Object.entries(err.extra || {}).forEach(([k, v]) => { if (/^[A-Z]/.test(k)) headers[k] = v; else body[k] = v; });
        send(res, err.status, body, headers);
      } else {
        console.error(err);
        send(res, 500, { error: 'Server error. Please try again.' });
      }
    }
  };
}

module.exports = { HttpError, send, readJson, parseCookies, sessionCookie, checkPost, handler, originOf, COOKIE };
