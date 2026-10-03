/* POST /api/auth/logout → ends this device's session. */
'use strict';

const { send, checkPost, handler, sessionCookie, parseCookies, COOKIE } = require('../_lib/http');
const { tokenHash } = require('../_lib/auth');

module.exports = handler(async (req, res, store) => {
  checkPost(req);
  const token = parseCookies(req)[COOKIE];
  if (token) await store.deleteSession(tokenHash(token));
  send(res, 200, { ok: true }, { 'Set-Cookie': sessionCookie(req, '', 0) });
});
