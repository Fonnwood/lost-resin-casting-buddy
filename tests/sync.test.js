/* js/sync.js: several "devices" (each its own JS realm and localStorage)
 * signing in to one account on a real in-process API server. */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

process.env.CB_DEV = '1';
const { createServer } = require('../scripts/serve.js');
const { setStore } = require('../api/_lib/store');
const { outbox } = require('../api/_lib/email');
const config = require('../api/_lib/config');

const SCRIPTS = ['js/util.js', 'js/profile.js', 'profiles/protocast-trueblue-cz121.js', 'js/storage.js', 'js/sync.js']
  .map((f) => [f, fs.readFileSync(path.join(__dirname, '..', f), 'utf8')]);

function fakeStorage() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { m.set(k, String(v)); }, removeItem: (k) => { m.delete(k); }, _map: m };
}

/** A browser-ish realm running the app's storage + sync scripts. */
function device(base) {
  let cookie = '';
  const ls = fakeStorage();
  const ctx = {
    console, localStorage: ls, location: { protocol: 'http:' },
    setTimeout: () => 0, clearTimeout: () => {}, // tests call syncNow() themselves
    fetch: async (url, opts) => {
      const headers = Object.assign({}, (opts && opts.headers) || {}, cookie ? { cookie } : {});
      const r = await fetch(url, Object.assign({}, opts, { headers }));
      const set = r.headers.get('set-cookie');
      if (set) cookie = set.split(';')[0];
      return r;
    },
  };
  vm.createContext(ctx);
  vm.runInContext('globalThis.CPT = { config: { apiBase: ' + JSON.stringify(base + '/api') + ' } };', ctx);
  SCRIPTS.forEach(([f, src]) => vm.runInContext(src, ctx, { filename: f }));
  const CPT = ctx.CPT;
  const S = CPT.Storage;
  // What app.js does on first launch: seed the built-in profiles and save settings.
  S.saveProfiles(CPT.Profile.builtInProfiles());
  S.saveSettings(S.loadSettings());
  return {
    CPT, S, Sync: CPT.Sync, ls,
    runs: () => S.loadRuns(),
    run: (id) => S.loadRuns().find((r) => r.id === id),
    addRun(id, extra) { S.saveRuns(S.loadRuns().concat([Object.assign({ id, name: id, status: 'complete', events: [], profile: {} }, extra)])); },
    editRun(id, patch) { S.saveRuns(S.loadRuns().map((r) => (r.id === id ? Object.assign({}, r, patch) : r))); },
    async signIn(email) {
      await CPT.Sync.init({});
      await CPT.Sync.requestCode(email);
      const code = outbox.filter((m) => m.to === email).pop().code;
      await CPT.Sync.verify(email, code);
      assert.equal(CPT.Sync.status.email, email);
      assert.equal(CPT.Sync.status.error, null);
    },
  };
}

/** Run ids on a device (as a string: arrays from another realm don't deepEqual). */
const ids = (d) => d.runs().map((r) => r.id).sort().join(',');

test('account sync between devices', async (t) => {
  setStore(require('../api/_lib/memory-store').create());
  config.codeResendSeconds = 0;
  const server = createServer({ api: true });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = 'http://127.0.0.1:' + server.address().port;
  t.after(() => { server.close(); setStore(undefined); });
  const email = 'caster@example.com';

  const phone = device(base);
  const laptop = device(base);
  const builtInId = phone.S.loadProfiles()[0].id;

  await t.test('without an account nothing is sent', async () => {
    const offline = device(base);
    await offline.Sync.init({});
    assert.equal(offline.Sync.status.available, true);
    assert.equal(offline.Sync.status.email, null);
    offline.addRun('local-only');
    await offline.Sync.syncNow();
    assert.equal(offline.S.loadSyncState(), null);
  });

  await t.test('first device: everything already on it goes up to the new account', async () => {
    phone.addRun('p1', { name: 'Phone run' });
    phone.S.saveSettings(Object.assign(phone.S.loadSettings(), { tempUnit: 'F', textScale: 130, wakeLock: true }));
    const profiles = phone.S.loadProfiles();
    profiles[0] = Object.assign({}, profiles[0], { name: 'My edited profile', edited: true });
    phone.S.saveProfiles(profiles);
    await phone.signIn(email);
    assert.equal(phone.Sync._test.pendingChanges(phone.Sync._test.localDocs()).length, 0, 'all pushed');
    assert.equal(phone.Sync._test.state().initial, false);
  });

  await t.test('second device: the account wins clashes, its own runs are added', async () => {
    laptop.addRun('l1', { name: 'Laptop run' });
    laptop.S.saveSettings(Object.assign(laptop.S.loadSettings(), { tempUnit: 'C', textScale: 90 }));
    let remote = 0;
    await laptop.Sync.init({ onRemoteChange: () => remote++ });
    await laptop.Sync.requestCode(email);
    await laptop.Sync.verify(email, outbox.filter((m) => m.to === email).pop().code);
    assert.ok(remote > 0);
    assert.equal(ids(laptop), 'l1,p1');
    assert.equal(laptop.S.loadSettings().tempUnit, 'F', 'account settings win over a newly linked device');
    assert.equal(laptop.S.loadSettings().textScale, 90, 'text size stays per device');
    assert.notEqual(laptop.S.loadSettings().wakeLock, true, 'keep-awake stays per device');
    assert.equal(laptop.S.loadProfiles().find((p) => p.id === builtInId).name, 'My edited profile');

    await phone.Sync.syncNow();
    assert.equal(ids(phone), 'l1,p1', 'laptop-only run reaches the phone');
    assert.equal(phone.S.loadSettings().textScale, 130);
  });

  await t.test('edits travel both ways; device-only fields stay put', async () => {
    phone.editRun('p1', { lastSeenAt: 111 });
    laptop.editRun('p1', { lastSeenAt: 999 });
    assert.equal(phone.Sync._test.pendingChanges(phone.Sync._test.localDocs()).length, 0, 'lastSeenAt alone is not a change');

    phone.editRun('p1', { name: 'Renamed on phone' });
    await phone.Sync.syncNow(true);
    await laptop.Sync.syncNow();
    assert.equal(laptop.run('p1').name, 'Renamed on phone');
    assert.equal(laptop.run('p1').lastSeenAt, 999);
  });

  await t.test('unsynced local edits are not overwritten by a pull; the newer edit wins everywhere', async () => {
    laptop.editRun('l1', { name: 'Laptop edit (older)' });
    await new Promise((r) => setTimeout(r, 5));
    phone.editRun('l1', { name: 'Phone edit (newer)' });
    // The laptop pushes first, then the phone's newer edit replaces it.
    await laptop.Sync.syncNow(true);
    await phone.Sync.syncNow(true);
    assert.equal(phone.run('l1').name, 'Phone edit (newer)');
    await laptop.Sync.syncNow();
    assert.equal(laptop.run('l1').name, 'Phone edit (newer)');
  });

  await t.test('deletions propagate', async () => {
    laptop.S.saveRuns(laptop.runs().filter((r) => r.id !== 'l1'));
    await laptop.Sync.syncNow(true);
    await phone.Sync.syncNow();
    assert.equal(ids(phone), 'p1');
  });

  await t.test('a run in progress here is never dropped by another device clearing the pointer', async () => {
    phone.addRun('live', { status: 'active' });
    phone.S.saveActiveRunId('live');
    laptop.S.saveActiveRunId(null);
    // Laptop's "no active run" is the newer change…
    await new Promise((r) => setTimeout(r, 5));
    laptop.S.saveActiveRunId('x');
    laptop.S.saveActiveRunId(null);
    await laptop.Sync.syncNow(true);
    await phone.Sync.syncNow();
    assert.equal(phone.S.loadActiveRunId(), 'live');
    // …but the phone's pointer goes back up and wins.
    await phone.Sync.syncNow();
    await laptop.Sync.syncNow();
    assert.equal(laptop.S.loadActiveRunId(), 'live');
    assert.equal(laptop.run('live').status, 'active');
  });

  await t.test('an expired session signs the device out without losing data', async () => {
    const store = require('../api/_lib/store').getStore();
    const real = store.sessionUser;
    store.sessionUser = async () => null;
    try {
      laptop.editRun('p1', { name: 'Edited while expired' });
      await laptop.Sync.syncNow(true);
    } finally { store.sessionUser = real; }
    assert.equal(laptop.Sync.status.email, null);
    assert.match(laptop.Sync.status.error, /expired/);
    assert.equal(laptop.run('p1').name, 'Edited while expired');
    // Signing back in pushes the edit made meanwhile (not an "initial" merge).
    await laptop.signIn(email);
    await phone.Sync.syncNow();
    assert.equal(phone.run('p1').name, 'Edited while expired');
  });

  await t.test('sign out and clear removes casting data from the device only', async () => {
    await laptop.Sync.signOut(true);
    assert.equal(laptop.ls._map.size, 0);
    assert.equal(laptop.Sync.status.email, null);
    await phone.Sync.syncNow();
    assert.ok(phone.run('p1'), 'the account still has everything');
  });

  await t.test('canonical hashing ignores key order', () => {
    const { hashOf, canon } = phone.Sync._test;
    assert.equal(canon({ b: 1, a: [1, { d: 2, c: undefined }] }), '{"a":[1,{"d":2}],"b":1}');
    assert.equal(hashOf({ a: 1, b: { c: 2, d: 3 } }), hashOf({ b: { d: 3, c: 2 }, a: 1 }));
    assert.notEqual(hashOf({ a: 1 }), hashOf({ a: 2 }));
  });
});
