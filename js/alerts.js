/* Casting Process Tracker — AlertService: notifications, sound, vibration,
 * screen wake lock and file downloads. */
(function (CPT) {
  'use strict';

  let audioCtx = null;
  let wakeLock = null;
  let wantWake = false;

  function unlockAudio() {
    try {
      if (!audioCtx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (AC) audioCtx = new AC();
      }
      if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
    } catch (e) { /* ignore */ }
  }

  /** Three loud-ish beeps; audible across a workshop. */
  function beep(pattern) {
    unlockAudio();
    if (!audioCtx) return;
    const now = audioCtx.currentTime;
    (pattern || [0, 0.35, 0.7]).forEach((offset) => {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'square';
      osc.frequency.value = 1320;
      gain.gain.setValueAtTime(0.0001, now + offset);
      gain.gain.exponentialRampToValueAtTime(0.25, now + offset + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + offset + 0.25);
      osc.connect(gain).connect(audioCtx.destination);
      osc.start(now + offset);
      osc.stop(now + offset + 0.27);
    });
  }

  function vibrate() {
    try { if (navigator.vibrate) navigator.vibrate([300, 150, 300, 150, 600]); } catch (e) { /* ignore */ }
  }

  function notificationsSupported() { return typeof window !== 'undefined' && 'Notification' in window; }
  function permission() { return notificationsSupported() ? Notification.permission : 'unsupported'; }

  async function requestPermission() {
    if (!notificationsSupported()) return 'unsupported';
    try { return await Notification.requestPermission(); } catch (e) { return Notification.permission; }
  }

  async function notify(title, body, tag) {
    if (permission() !== 'granted') return false;
    const opts = { body: body || '', tag: tag || title, renotify: true, requireInteraction: true, icon: 'icons/icon-192.png', badge: 'icons/icon-192.png' };
    try {
      // Service-worker notifications work in installed PWAs (iOS/Android).
      if (navigator.serviceWorker && navigator.serviceWorker.controller) {
        const reg = await navigator.serviceWorker.ready;
        await reg.showNotification(title, opts);
        return true;
      }
      new Notification(title, opts);
      return true;
    } catch (e) {
      return false;
    }
  }

  /** Fire one alert through every enabled channel. */
  function fire(alert, settings) {
    const a = settings.alerts;
    if (!a.enabled || a.prefs[alert.pref] === false) return false;
    if (a.sound) beep();
    if (a.vibrate) vibrate();
    notify(CPT.util.localiseTemps(alert.title), CPT.util.localiseTemps(alert.body), alert.key);
    return true;
  }

  async function setWakeLock(on) {
    wantWake = on;
    try {
      if (on && 'wakeLock' in navigator) {
        if (!wakeLock) {
          wakeLock = await navigator.wakeLock.request('screen');
          wakeLock.addEventListener('release', () => { wakeLock = null; });
        }
        return true;
      }
      if (!on && wakeLock) { await wakeLock.release(); wakeLock = null; }
    } catch (e) { wakeLock = null; }
    return !!wakeLock;
  }

  function wakeLockSupported() { return typeof navigator !== 'undefined' && 'wakeLock' in navigator; }
  function wakeLockActive() { return !!wakeLock; }

  // The browser drops the wake lock whenever the page is hidden.
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && wantWake) setWakeLock(true);
    });
  }

  function download(filename, text, mime) {
    const blob = new Blob([text], { type: mime || 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 1000);
  }

  CPT.Alerts = { unlockAudio, beep, vibrate, notificationsSupported, permission, requestPermission, notify, fire, setWakeLock, wakeLockSupported, wakeLockActive, download };
})(globalThis.CPT = globalThis.CPT || {});
