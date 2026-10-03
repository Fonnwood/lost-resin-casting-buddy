/* Casting Process Tracker — optional account sync.
 *
 * The app stays local-first: everything is read from and written to browser
 * storage exactly as before. When a host provides the /api endpoints and the
 * user signs in, this keeps that storage in step with their account:
 *
 *  - Each run, each profile, the settings and the active-run pointer is one
 *    document. After any write we work out which documents changed since the
 *    last sync (by hash) and push them; the server's newest `updatedAt` wins.
 *  - The same request pulls what other devices changed (a cursor), and those
 *    are written into browser storage unless this device has newer edits.
 *  - The first sync on a device ("initial") pushes its documents as
 *    "unknown age", so data already in the account wins any clash and
 *    anything only on this device is added.
 *
 * Device-only values (a run's lastSeenAt, keep-awake, text size) never sync.
 * No DOM access here: app.js wires the events and renders the status. */
(function (CPT) {
  'use strict';

  const S = CPT.Storage;
  const RUN_LOCAL = ['lastSeenAt'];
  const SETTINGS_LOCAL = ['wakeLock', 'textScale'];
  const PUSH_DELAY = 3000;
  const PULL_EVERY = 5 * 60000;
  const PULL_ON_RETURN = 30000;
  const BATCH_DOCS = 50;
  const BATCH_BYTES = 1024 * 1024;

  const status = {
    checked: false,     // the availability check has finished
    available: false,   // this host supports accounts
    email: null,        // signed-in address
    sessionDays: 30,
    pushKey: null,      // this host can send push notifications (VAPID public key)
    syncing: false,
    lastSyncAt: null,
    error: null,
  };

  let hooks = {};
  let state = S.loadSyncState();
  let timer = null;
  let running = null;
  let again = null;
  let lastPull = 0;
  let hooked = false;

  // ------------------------------------------------------------ helpers

  function apiUrl(path) {
    const base = ((CPT.config && CPT.config.apiBase) || 'api').replace(/\/+$/, '');
    return base + '/' + path;
  }

  async function call(path, body) {
    const opts = body === undefined
      ? { credentials: 'same-origin', cache: 'no-store' }
      : { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
    const r = await fetch(apiUrl(path), opts);
    let data = null;
    try { data = await r.json(); } catch (e) { /* not JSON */ }
    if (!r.ok || !data) {
      const err = new Error((data && data.error) || 'The server didn’t respond as expected (' + r.status + ').');
      err.status = r.status;
      err.data = data || {};
      throw err;
    }
    return data;
  }

  function notify() {
    try { if (hooks.onStatus) hooks.onStatus(status); } catch (err) { console.error(err); }
  }

  function omit(obj, keys) {
    const out = Object.assign({}, obj);
    keys.forEach((k) => { delete out[k]; });
    return out;
  }

  /** JSON with sorted keys, so the same data always hashes the same (the server reorders keys). */
  function canon(v) {
    if (Array.isArray(v)) return '[' + v.map((x) => (x === undefined || typeof x === 'function' ? 'null' : canon(x))).join(',') + ']';
    if (v && typeof v === 'object') {
      return '{' + Object.keys(v).sort().filter((k) => v[k] !== undefined && typeof v[k] !== 'function').map((k) => JSON.stringify(k) + ':' + canon(v[k])).join(',') + '}';
    }
    const s = JSON.stringify(v);
    return s === undefined ? 'null' : s;
  }

  /** cyrb53: a fast 53-bit string hash — plenty to notice that a document changed. */
  function cyrb53(str) {
    let h1 = 0xdeadbeef;
    let h2 = 0x41c6ce57;
    for (let i = 0; i < str.length; i++) {
      const ch = str.charCodeAt(i);
      h1 = Math.imul(h1 ^ ch, 2654435761);
      h2 = Math.imul(h2 ^ ch, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
  }

  // Most documents don't change between checks: remember hashes by their plain JSON.
  const memo = new Map();
  function hashOf(doc) {
    const raw = JSON.stringify(doc);
    let h = memo.get(raw);
    if (h === undefined) {
      if (memo.size > 2000) memo.clear();
      h = cyrb53(canon(doc));
      memo.set(raw, h);
    }
    return h;
  }

  function saveState() { if (state) S.saveSyncState(state); }

  function ensureState(email) {
    if (!state || state.email !== email || typeof state.docs !== 'object') {
      state = { email, cursor: 0, initial: true, docs: {} };
      saveState();
    }
  }

  // ---------------------------------------------------- local documents

  /** Everything this device would sync, keyed "kind:id". */
  function localDocs() {
    const out = new Map();
    S.loadRuns().forEach((r) => { if (r && typeof r.id === 'string') out.set('run:' + r.id, omit(r, RUN_LOCAL)); });
    S.loadProfiles().forEach((p) => { if (p && typeof p.id === 'string') out.set('profile:' + p.id, p); });
    const st = S.loadStoredSettings();
    if (st) out.set('settings:main', omit(st, SETTINGS_LOCAL));
    out.set('meta:main', { activeRunId: S.loadActiveRunId() || null });
    return out;
  }

  /** Documents that differ from what the account last had (changes and deletions). */
  function pendingChanges(local) {
    const now = Date.now();
    const out = [];
    local.forEach((doc, key) => {
      const h = hashOf(doc);
      const known = state.docs[key];
      if (known && known.h === h) return;
      // Always newer than the version we last saw, even if this device's clock is behind.
      const u = state.initial && !known ? 0 : Math.max(now, known ? known.u + 1 : 0);
      out.push({ key, doc, h, u });
    });
    Object.keys(state.docs).forEach((key) => {
      const known = state.docs[key];
      if (known.h !== null && !local.has(key)) out.push({ key, doc: null, h: null, u: Math.max(now, known.u + 1) });
    });
    return out;
  }

  function takeBatch(list) {
    const out = [];
    let bytes = 0;
    for (const c of list) {
      const size = c.doc ? JSON.stringify(c.doc).length : 50;
      if (out.length && (out.length >= BATCH_DOCS || bytes + size > BATCH_BYTES)) break;
      out.push(c);
      bytes += size;
    }
    return out;
  }

  const splitKey = (key) => { const i = key.indexOf(':'); return { kind: key.slice(0, i), id: key.slice(i + 1) }; };

  /** Write other devices' changes into browser storage. Skips any document edited here since it was last synced — ours is pushed next and the newer one wins. */
  function applyRemote(rows) {
    if (!rows || !rows.length) return false;
    const runs = S.loadRuns();
    const profiles = S.loadProfiles();
    let settings = S.loadStoredSettings();
    let activeRunId = S.loadActiveRunId() || null;
    const dirty = {};
    const current = (kind, id) => {
      if (kind === 'run') { const r = runs.find((x) => x && x.id === id); return r ? omit(r, RUN_LOCAL) : null; }
      if (kind === 'profile') return profiles.find((x) => x && x.id === id) || null;
      if (kind === 'settings') return settings ? omit(settings, SETTINGS_LOCAL) : null;
      if (kind === 'meta') return { activeRunId };
      return null;
    };
    // Runs before the active-run pointer, so the pointer can see them.
    const ordered = rows.filter((r) => r.kind !== 'meta').concat(rows.filter((r) => r.kind === 'meta'));

    ordered.forEach((row) => {
      const key = row.kind + ':' + row.id;
      const cur = current(row.kind, row.id);
      const lh = cur ? hashOf(cur) : null;
      const base = state.docs[key];
      if ((base ? base.h : null) !== lh) return;
      const h = row.deleted ? null : hashOf(row.data);
      state.docs[key] = { h, u: row.updatedAt };
      if (lh === h) return;

      if (row.kind === 'run') {
        const i = runs.findIndex((x) => x && x.id === row.id);
        if (row.deleted) { if (i >= 0) runs.splice(i, 1); } else {
          const keep = i >= 0 ? RUN_LOCAL.reduce((o, k) => { if (runs[i][k] !== undefined) o[k] = runs[i][k]; return o; }, {}) : {};
          const next = Object.assign({}, row.data, keep);
          if (i >= 0) runs[i] = next; else runs.push(next);
        }
        dirty.runs = true;
      } else if (row.kind === 'profile') {
        const i = profiles.findIndex((x) => x && x.id === row.id);
        if (row.deleted) { if (i >= 0) profiles.splice(i, 1); } else if (i >= 0) profiles[i] = row.data; else profiles.push(row.data);
        dirty.profiles = true;
      } else if (row.kind === 'settings') {
        if (!row.deleted) {
          const keep = SETTINGS_LOCAL.reduce((o, k) => { if (settings && settings[k] !== undefined) o[k] = settings[k]; return o; }, {});
          settings = Object.assign({}, row.data, keep);
          dirty.settings = true;
        }
      } else if (row.kind === 'meta') {
        const incoming = row.deleted ? null : (row.data.activeRunId || null);
        const mine = activeRunId && runs.find((r) => r && r.id === activeRunId);
        // Never drop a run that is still in progress here; our pointer goes back up instead.
        if (!incoming && mine && mine.status === 'active') return;
        activeRunId = incoming;
        dirty.activeRunId = true;
      }
    });

    if (dirty.runs) S.saveRuns(runs);
    if (dirty.profiles) S.saveProfiles(profiles);
    if (dirty.settings) S.saveSettings(settings);
    if (dirty.activeRunId) S.saveActiveRunId(activeRunId);
    return Object.keys(dirty).length > 0;
  }

  // --------------------------------------------------------------- sync

  async function runSync(pushOnly) {
    // Another tab may have synced since: start from the newest bookkeeping.
    const fresh = S.loadSyncState();
    if (fresh && state && fresh.email === state.email && fresh.docs) state = fresh;
    let changed = false;
    for (let round = 0; round < 100; round++) {
      const todo = pendingChanges(localDocs());
      if (pushOnly && round === 0 && !todo.length) return changed;
      const batch = takeBatch(todo);
      const res = await call('sync', {
        since: state.cursor || 0,
        changes: batch.map((c) => Object.assign(splitKey(c.key), c.doc ? { data: c.doc } : { deleted: true }, { updatedAt: c.u })),
      });
      batch.forEach((c) => { state.docs[c.key] = { h: c.h, u: c.u }; });
      if (applyRemote(res.changes)) changed = true;
      state.cursor = res.cursor;
      lastPull = Date.now();
      const done = !res.more && todo.length <= batch.length;
      if (done) state.initial = false;
      saveState();
      if (done) break;
    }
    return changed;
  }

  /** Push and pull now. Concurrent calls share one run; a call during a run queues one more. */
  function syncNow(pushOnly) {
    if (!status.email || !state) return Promise.resolve();
    if (running) {
      // Queue one more run; a full pull outranks a push-only one.
      again = again === false || !pushOnly ? false : true;
      return running;
    }
    clearTimeout(timer);
    status.syncing = true;
    notify();
    running = runSync(!!pushOnly)
      .then((changed) => {
        status.lastSyncAt = Date.now();
        status.error = null;
        if (changed && hooks.onRemoteChange) {
          try { hooks.onRemoteChange(); } catch (err) { console.error(err); }
        }
      })
      .catch((err) => {
        if (err.status === 401) {
          status.email = null;
          status.error = 'Your sign-in has expired. Sign in again to keep syncing — nothing on this device is lost.';
        } else if (!err.status) {
          status.error = 'Offline — changes are saved on this device and will sync when you’re back online.';
        } else {
          status.error = 'Sync problem: ' + err.message;
        }
      })
      .then(() => {
        running = null;
        status.syncing = false;
        notify();
        if (again !== null) { const p = again; again = null; syncNow(p); }
      });
    return running;
  }

  /** After a local write: push soon (debounced). */
  function schedule() {
    if (!status.email) return;
    clearTimeout(timer);
    timer = setTimeout(() => syncNow(true), PUSH_DELAY);
  }

  /** From the app's 1 s tick (page visible): pull now and then. */
  function maybePull(soon) {
    if (!status.email || running || status.syncing) return;
    if (Date.now() - lastPull > (soon ? PULL_ON_RETURN : PULL_EVERY)) syncNow(false);
  }

  // ------------------------------------------------------------ account

  async function init(h) {
    hooks = h || {};
    if (!hooked) { S.onWrite(schedule); hooked = true; }
    const cfg = CPT.config || {};
    const web = typeof location !== 'undefined' && /^https?:$/.test(location.protocol);
    if (cfg.accounts === false || typeof fetch !== 'function' || !web) { status.checked = true; notify(); return; }
    try {
      const r = await call('session');
      status.available = r.accounts === true;
      status.email = status.available ? r.email || null : null;
      status.pushKey = r.pushKey || null;
      if (r.sessionDays) status.sessionDays = r.sessionDays;
    } catch (err) {
      // No network: a device that was signed in carries on and syncs later.
      if (!err.status && state && state.email) {
        status.available = true;
        status.email = state.email;
        status.error = 'Offline — changes are saved on this device and will sync when you’re back online.';
      }
    }
    status.checked = true;
    notify();
    if (status.email) { ensureState(status.email); await syncNow(false); }
  }

  async function requestCode(email) { return call('auth/request-code', { email }); }

  async function verify(email, code) {
    const r = await call('auth/verify', { email, code });
    status.email = r.email;
    status.error = null;
    ensureState(r.email);
    notify();
    await syncNow(false);
    return r;
  }

  /** Sign out of this device. With `clear`, also remove all casting data from it. */
  async function signOut(clear) {
    await call('auth/logout', {});
    clearTimeout(timer);
    status.email = null;
    status.error = null;
    if (clear) { S.clearAll(); state = null; }
    notify();
  }

  async function deleteAccount() {
    await call('account/delete', {});
    clearTimeout(timer);
    status.email = null;
    status.error = null;
    state = null;
    S.saveSyncState(null);
    notify();
  }

  CPT.Sync = { status, init, requestCode, verify, signOut, deleteAccount, syncNow, schedule, maybePull, _test: { canon, hashOf, localDocs, pendingChanges, applyRemote, state: () => state } };
})(globalThis.CPT = globalThis.CPT || {});
