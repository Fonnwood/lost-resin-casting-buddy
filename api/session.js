/* GET /api/session → { accounts, email, sessionDays, pushKey }
 * Also how the app discovers that this host supports accounts at all. */
'use strict';

const { send, handler, HttpError } = require('./_lib/http');
const { currentUser } = require('./_lib/auth');
const { getStore } = require('./_lib/store');
const config = require('./_lib/config');
const push = require('./_lib/push');

const withStore = handler(async (req, res, store) => {
  if (req.method !== 'GET') throw new HttpError(405, 'Method not allowed.', { Allow: 'GET' });
  const user = await currentUser(req, store);
  send(res, 200, { accounts: true, email: user ? user.email : null, sessionDays: config.sessionDays, pushKey: push.publicKey() });
});

module.exports = (req, res) => {
  if (!getStore()) return send(res, 200, { accounts: false, email: null });
  return withStore(req, res);
};
