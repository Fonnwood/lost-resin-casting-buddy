/* Casting Process Tracker — push notifications that arrive while the phone
 * sleeps or the app is closed.
 *
 * A web page can't run timers on a sleeping phone, so when this is switched
 * on the device subscribes to push (Web Push / VAPID) and sends the server its
 * upcoming alerts; the server sends each one at its time. The list is re-sent
 * whenever it changes (a step completed, extended, re-synced…). No account is
 * needed. Only offered where the host supports it (see docs/HOSTING.md).
 * On iPhone/iPad this needs the app on the Home Screen (iOS 16.4+). */
(function (CPT) {
  'use strict';

  const S = CPT.Storage;
  const SEND_DELAY = 1500;

  const status = { available: false, enabled: false, busy: false, error: null };
  let hooks = {};
  let key = null;
  let timer = null;
  let hooked = false;

  function supported() {
    return typeof navigator !== 'undefined' && 'serviceWorker' in navigator && typeof window !== 'undefined' && 'PushManager' in window && 'Notification' in window;
  }

  /** iPhone/iPad Safari only allows push for apps opened from the Home Screen. */
  function needsInstall() {
    if (typeof navigator === 'undefined') return false;
    const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    const standalone = navigator.standalone === true || (typeof matchMedia === 'function' && matchMedia('(display-mode: standalone)').matches);
    return ios && !standalone;
  }

  function notify() { try { if (hooks.onStatus) hooks.onStatus(status); } catch (err) { console.error(err); } }

  function apiUrl(path) { return ((CPT.config && CPT.config.apiBase) || 'api').replace(/\/+$/, '') + '/' + path; }

  async function post(path, body) {
    const r = await fetch(apiUrl(path), { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    let data = null;
    try { data = await r.json(); } catch (e) { /* not JSON */ }
    if (!r.ok) throw new Error((data && data.error) || 'The server didn’t respond as expected (' + r.status + ').');
    return data;
  }

  function keyBytes(b64) {
    const s = b64.replace(/-/g, '+').replace(/_/g, '/');
    const raw = atob(s + '==='.slice((s.length + 3) % 4));
    return Uint8Array.from(raw, (c) => c.charCodeAt(0));
  }

  function sameKey(sub) {
    try {
      const a = new Uint8Array(sub.options.applicationServerKey);
      const b = keyBytes(key);
      return a.length === b.length && a.every((x, i) => x === b[i]);
    } catch (e) { return true; } // can't tell: keep it
  }

  async function subscription(create) {
    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (sub && key && !sameKey(sub)) { await sub.unsubscribe().catch(() => {}); sub = null; } // the server's keys changed
    if (!sub && create) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(key) });
    return sub;
  }

  function hash(str) {
    let h = 5381;
    for (let i = 0; i < str.length; i++) h = (Math.imul(h, 33) ^ str.charCodeAt(i)) >>> 0;
    return h.toString(36) + ':' + str.length;
  }

  /** Send the current alert list if it changed (or `force`). */
  async function update(force) {
    if (!status.enabled || !key) return;
    clearTimeout(timer);
    const alerts = (hooks.alerts && hooks.alerts()) || [];
    const state = S.loadPushState();
    try {
      const sub = await subscription(Notification.permission === 'granted');
      if (!sub) { status.enabled = false; S.savePushState({}); notify(); return; } // permission withdrawn in the phone's settings
      const h = hash(JSON.stringify(alerts));
      if (!force && state.lastHash === h && state.endpoint === sub.endpoint) return;
      await post('push/schedule', { subscription: sub.toJSON(), alerts });
      S.savePushState(Object.assign({}, state, { enabled: true, key, endpoint: sub.endpoint, lastHash: h, sentAt: Date.now() }));
      if (status.error) { status.error = null; notify(); }
    } catch (err) {
      status.error = navigator.onLine === false ? 'Offline — alerts will be updated when you’re back online.' : 'Couldn’t update notifications: ' + err.message;
      notify();
    }
  }

  /** After a data write: send the new list shortly (debounced). */
  function schedule() {
    if (!status.enabled) return;
    clearTimeout(timer);
    timer = setTimeout(() => update(false), SEND_DELAY);
  }

  async function init(pushKey, h) {
    hooks = h || {};
    if (!hooked) { S.onWrite(schedule); hooked = true; }
    const state = S.loadPushState();
    key = pushKey || state.key || null;
    status.available = !!key && supported();
    status.enabled = status.available && !!state.enabled && Notification.permission === 'granted';
    notify();
    if (status.enabled) await update(false);
  }

  async function enable() {
    if (!status.available) throw new Error('Notifications aren’t available here.');
    status.busy = true; status.error = null; notify();
    try {
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') throw new Error('Notifications are blocked for this site. Allow them in your browser or phone settings, then try again.');
      await subscription(true);
      status.enabled = true;
      S.savePushState({ enabled: true, key });
      await update(true);
    } finally {
      status.busy = false;
      notify();
    }
  }

  async function disable() {
    status.busy = true; notify();
    try {
      const sub = await subscription(false).catch(() => null);
      if (sub) {
        await post('push/schedule', { endpoint: sub.endpoint, unsubscribe: true }).catch(() => {});
        await sub.unsubscribe().catch(() => {});
      }
    } finally {
      status.enabled = false;
      status.busy = false;
      status.error = null;
      S.savePushState({});
      notify();
    }
  }

  CPT.Push = { status, supported, needsInstall, init, enable, disable, update, schedule };
})(globalThis.CPT = globalThis.CPT || {});
