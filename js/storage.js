/* Casting Process Tracker — StorageService.
 * localStorage behind a tiny interface so it can move to IndexedDB later
 * without touching the rest of the app. */
(function (CPT) {
  'use strict';

  const PREFIX = 'cpt.v1.';
  const KEYS = { profiles: 'profiles', runs: 'runs', activeRunId: 'activeRunId', settings: 'settings' };

  const DEFAULT_SETTINGS = {
    theme: 'dark',
    accent: '',          // '' = theme default, otherwise a #rrggbb colour
    textScale: 100,      // percent
    tempUnit: 'C',       // display only; data is always stored in °C
    clock24h: true,
    customCss: '',       // the user's own CSS, applied last
    defaultProfileId: null,
    wakeLock: false,
    alerts: {
      enabled: true, sound: true, vibrate: true,
      prefs: { stageEnd: true, stageEvents: true, metal15: true, metalNow: true, metalReady: true, soakComplete: true, readyToCast: true, vacuumComplete: true, coolingComplete: true },
    },
    safetyAcknowledged: false,
  };

  const memory = {};
  let available = true;
  try {
    const k = PREFIX + '__test';
    localStorage.setItem(k, '1');
    localStorage.removeItem(k);
  } catch (e) { available = false; }

  function read(key, fallback) {
    try {
      const raw = available ? localStorage.getItem(PREFIX + key) : memory[key];
      return raw == null ? fallback : JSON.parse(raw);
    } catch (e) { return fallback; }
  }

  function write(key, value) {
    const raw = JSON.stringify(value);
    try {
      if (available) localStorage.setItem(PREFIX + key, raw);
      else memory[key] = raw;
      return true;
    } catch (e) {
      console.error('Storage write failed', e);
      return false;
    }
  }

  const Storage = {
    available,
    loadProfiles() {
      const list = read(KEYS.profiles, null);
      return Array.isArray(list) ? list : [];
    },
    saveProfiles(list) { return write(KEYS.profiles, list); },
    loadRuns() { const r = read(KEYS.runs, []); return Array.isArray(r) ? r : []; },
    saveRuns(runs) { return write(KEYS.runs, runs); },
    loadActiveRunId() { return read(KEYS.activeRunId, null); },
    saveActiveRunId(id) { return write(KEYS.activeRunId, id); },
    loadSettings() {
      const s = read(KEYS.settings, {});
      // Host defaults (config.js) sit between the built-in defaults and the user's own choices.
      const host = (CPT.config && CPT.config.defaultSettings) || {};
      const merged = Object.assign({}, DEFAULT_SETTINGS, host, s);
      merged.alerts = Object.assign({}, DEFAULT_SETTINGS.alerts, s.alerts || {});
      merged.alerts.prefs = Object.assign({}, DEFAULT_SETTINGS.alerts.prefs, (s.alerts && s.alerts.prefs) || {});
      return merged;
    },
    saveSettings(s) { return write(KEYS.settings, s); },
    /** Ask the browser not to evict our data (best effort). */
    requestPersistence() {
      try {
        if (navigator.storage && navigator.storage.persist) return navigator.storage.persist();
      } catch (e) { /* ignore */ }
      return Promise.resolve(false);
    },
    isStorageEvent(e) { return e && typeof e.key === 'string' && e.key.indexOf(PREFIX) === 0; },
    DEFAULT_SETTINGS,
  };

  CPT.Storage = Storage;
})(globalThis.CPT = globalThis.CPT || {});
