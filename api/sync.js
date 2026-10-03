/* POST /api/sync { since, changes: [{ kind, id, data, deleted, updatedAt }] }
 *   → { cursor, more, changes }
 *
 * One round trip pushes this device's changes and pulls everyone else's.
 * Each run, profile, the settings and the active-run pointer is one document;
 * the newest `updatedAt` wins. Deletions are kept as tombstones so they reach
 * other devices. A pushed change that loses comes back in `changes` so the
 * device adopts the winner. Keep calling with the returned cursor while `more`. */
'use strict';

const { send, readJson, checkPost, handler, HttpError } = require('./_lib/http');
const config = require('./_lib/config');
const { requireUser } = require('./_lib/auth');

const KINDS = new Set(['run', 'profile', 'settings', 'meta']);

/** Validate and normalise pushed changes; duplicates keep the newest. */
function parseChanges(list, now) {
  if (list == null) return [];
  if (!Array.isArray(list)) throw new HttpError(400, '`changes` must be an array.');
  if (list.length > config.maxChangesPerRequest) throw new HttpError(413, 'Too many changes in one request (max ' + config.maxChangesPerRequest + ').');
  const byKey = new Map();
  list.forEach((c, i) => {
    if (!c || typeof c !== 'object') throw new HttpError(400, 'Change ' + i + ' is not an object.');
    if (!KINDS.has(c.kind)) throw new HttpError(400, 'Change ' + i + ' has an unknown kind.');
    if (typeof c.id !== 'string' || !c.id || c.id.length > 200) throw new HttpError(400, 'Change ' + i + ' has an invalid id.');
    let updatedAt = Number(c.updatedAt);
    if (!Number.isFinite(updatedAt) || updatedAt < 0) throw new HttpError(400, 'Change ' + i + ' has an invalid updatedAt.');
    // A device with a clock far in the future must not freeze a document forever.
    updatedAt = Math.min(Math.floor(updatedAt), now + 60000);
    let data = null;
    let json = null;
    if (!c.deleted) {
      if (!c.data || typeof c.data !== 'object' || Array.isArray(c.data)) throw new HttpError(400, 'Change ' + i + ' needs a data object.');
      // Postgres JSONB can't hold NUL characters; they never matter here.
      json = JSON.stringify(c.data).replace(/\\u0000/g, '');
      if (Buffer.byteLength(json) > config.maxDocBytes) throw new HttpError(413, 'A ' + c.kind + ' is too large to sync (max ' + Math.round(config.maxDocBytes / 1024) + ' KB).', { kind: c.kind, id: c.id });
      data = c.data;
    }
    const key = c.kind + ':' + c.id;
    const prev = byKey.get(key);
    if (!prev || updatedAt >= prev.updatedAt) byKey.set(key, { kind: c.kind, id: c.id, data, json, updatedAt });
  });
  return [...byKey.values()];
}

module.exports = handler(async (req, res, store) => {
  checkPost(req);
  const user = await requireUser(req, store);
  const body = await readJson(req, 4 * 1024 * 1024);
  const since = Number(body.since) || 0;
  if (since < 0 || !Number.isSafeInteger(since)) throw new HttpError(400, 'Invalid `since`.');
  const changes = parseChanges(body.changes, Date.now());

  const adding = changes.filter((c) => c.data !== null).length;
  if (adding && (await store.liveDocCount(user.userId)) + adding > config.maxDocsPerUser) {
    throw new HttpError(413, 'This account has reached its storage limit (' + config.maxDocsPerUser + ' items). Delete some old runs first.');
  }

  const out = await store.sync(user.userId, since, changes, { pageRows: config.pageRows, pageBytes: config.pageBytes });
  send(res, 200, out);
});

module.exports.parseChanges = parseChanges;
