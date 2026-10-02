/* StorageService: persistence, defaults and host config. */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');

function fakeStorage() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: (k) => { m.delete(k); },
    _map: m,
  };
}

/** Load storage.js fresh against a given localStorage (or none). */
function load(ls, config) {
  for (const f of ['../js/util.js', '../js/profile.js', '../js/storage.js']) delete require.cache[require.resolve(f)];
  globalThis.CPT = config ? { config } : undefined;
  if (ls) globalThis.localStorage = ls; else delete globalThis.localStorage;
  require('../js/util.js');
  require('../js/profile.js');
  require('../js/storage.js');
  return globalThis.CPT.Storage;
}

test('runs, profiles and settings round-trip', () => {
  const ls = fakeStorage();
  const S = load(ls);
  assert.equal(S.available, true);
  S.saveRuns([{ id: 'r1' }]);
  S.saveActiveRunId('r1');
  S.saveSettings(Object.assign(S.loadSettings(), { tempUnit: 'F' }));
  const again = load(ls);
  assert.deepEqual(again.loadRuns(), [{ id: 'r1' }]);
  assert.equal(again.loadActiveRunId(), 'r1');
  assert.equal(again.loadSettings().tempUnit, 'F');
});

test('settings merge: built-in defaults < host config < the user’s own choices', () => {
  const ls = fakeStorage();
  const S = load(ls, { defaultSettings: { theme: 'light', tempUnit: 'F' } });
  assert.equal(S.loadSettings().theme, 'light');
  assert.equal(S.loadSettings().tempUnit, 'F');
  assert.equal(S.loadSettings().clock24h, true);
  S.saveSettings({ theme: 'dark' });
  const s = S.loadSettings();
  assert.equal(s.theme, 'dark');
  assert.equal(s.tempUnit, 'F');
});

test('nested alert preferences keep new defaults when old data lacks them', () => {
  const ls = fakeStorage();
  ls.setItem('cpt.v1.settings', JSON.stringify({ alerts: { sound: false, prefs: { stageEnd: false } } }));
  const s = load(ls).loadSettings();
  assert.equal(s.alerts.sound, false);
  assert.equal(s.alerts.enabled, true);
  assert.equal(s.alerts.prefs.stageEnd, false);
  assert.equal(s.alerts.prefs.metalNow, true);
});

test('corrupt stored data falls back instead of throwing', () => {
  const ls = fakeStorage();
  ls.setItem('cpt.v1.runs', '{not json');
  ls.setItem('cpt.v1.profiles', '"a string"');
  const S = load(ls);
  assert.deepEqual(S.loadRuns(), []);
  assert.deepEqual(S.loadProfiles(), []);
});

test('works in memory when browser storage is unavailable', () => {
  const S = load(null);
  assert.equal(S.available, false);
  assert.equal(S.saveRuns([{ id: 'x' }]), true);
  assert.deepEqual(S.loadRuns(), [{ id: 'x' }]);
});
