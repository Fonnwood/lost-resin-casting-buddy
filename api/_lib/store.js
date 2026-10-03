/* Picks the data store: Postgres when DATABASE_URL is set, an in-memory store
 * for local development (`npm run dev`), otherwise none (accounts disabled).
 *
 * Both stores implement the same interface:
 *   codeStats(email, now)                    → { lastAt, hour, day }
 *   createCode(email, hash, expiresAt)       (supersedes earlier codes for that email)
 *   latestCode(email, now)                   → { id, hash, attempts } | null (unused, unexpired)
 *   failCode(id)                             → attempts so far
 *   consumeCode(id)                          → true if it was still unused
 *   upsertUser(email)                        → userId
 *   createSession(hash, userId, expiresAt)
 *   sessionUser(hash, now)                   → { userId, email } | null
 *   deleteSession(hash)
 *   deleteUser(userId)                       (cascades to sessions and docs)
 *   liveDocCount(userId)
 *   sync(userId, since, changes, limits)     → { cursor, more, changes }
 *   cleanup(now)                             (drops expired codes and sessions)
 */
'use strict';

const config = require('./config');

let store;

function getStore() {
  if (store !== undefined) return store;
  if (config.databaseUrl) store = require('./pg-store').create(config.databaseUrl);
  else if (config.dev) store = require('./memory-store').create();
  else store = null;
  return store;
}

/** Test hook: swap in a specific store. */
function setStore(s) { store = s; }

module.exports = { getStore, setStore };
