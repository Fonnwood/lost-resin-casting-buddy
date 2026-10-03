/* POST /api/account/delete → removes the account, every session and all synced data. */
'use strict';

const { send, checkPost, handler, sessionCookie } = require('../_lib/http');
const { requireUser } = require('../_lib/auth');

module.exports = handler(async (req, res, store) => {
  checkPost(req);
  const user = await requireUser(req, store);
  await store.deleteUser(user.userId);
  send(res, 200, { ok: true }, { 'Set-Cookie': sessionCookie(req, '', 0) });
});
