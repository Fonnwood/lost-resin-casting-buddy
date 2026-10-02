/* Casting Process Tracker — small shared helpers (no DOM). */
(function (CPT) {
  'use strict';

  const MIN = 60000;

  function pad(n) { return String(n).padStart(2, '0'); }

  /** 01:29:59 style. Negative values are shown as their absolute value. */
  function hms(ms) {
    const s = Math.max(0, Math.floor(Math.abs(ms) / 1000));
    return pad(Math.floor(s / 3600)) + ':' + pad(Math.floor((s % 3600) / 60)) + ':' + pad(s % 60);
  }

  /** mm:ss for short timers, h:mm:ss once over an hour. */
  function shortTimer(ms) {
    const s = Math.max(0, Math.floor(Math.abs(ms) / 1000));
    if (s >= 3600) return hms(ms);
    return pad(Math.floor(s / 60)) + ':' + pad(s % 60);
  }

  /** "1 h 30 min", "45 min", "60 s" */
  function dur(minutes, unit) {
    if (minutes == null || isNaN(minutes)) return '—';
    if (unit === 's') return Math.round(minutes * 60) + ' s';
    const total = Math.round(minutes);
    const h = Math.floor(total / 60);
    const m = total % 60;
    if (h && m) return h + ' h ' + m + ' min';
    if (h) return h + ' h';
    return m + ' min';
  }

  /** "1h 17m" compact */
  function durCompact(ms) {
    const totalMin = Math.floor(Math.abs(ms) / MIN);
    const h = Math.floor(totalMin / 60);
    const m = totalMin % 60;
    return h ? h + 'h ' + pad(m) + 'm' : m + 'm';
  }

  function startOfDay(t) { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); }

  // ------------------------------------------------------------ formatting
  // Process data is always stored in °C and 24-hour time. These helpers only
  // change how values are *shown*, per the user's settings.

  const format = { tempUnit: 'C', clock24h: true };

  /** Apply display preferences ({ tempUnit: 'C' | 'F', clock24h: boolean }). */
  function setFormat(f) {
    format.tempUnit = f && f.tempUnit === 'F' ? 'F' : 'C';
    format.clock24h = !f || f.clock24h !== false;
  }

  function tempUnit() { return '°' + format.tempUnit; }

  function round(n, dp) { const f = Math.pow(10, dp || 0); return Math.round(n * f) / f; }

  /** °C → the number to show in the user's unit. */
  function toDisplayTemp(c) {
    if (c == null || c === '' || isNaN(c)) return c;
    return round(format.tempUnit === 'F' ? Number(c) * 9 / 5 + 32 : Number(c), 1);
  }

  /** The user's unit → °C for storage. */
  function fromDisplayTemp(x) {
    if (x == null || x === '' || isNaN(x)) return x;
    return round(format.tempUnit === 'F' ? (Number(x) - 32) * 5 / 9 : Number(x), 2);
  }

  /** "428°F" / "220°C" */
  function temp(c) { return c == null || c === '' ? '—' : toDisplayTemp(c) + tempUnit(); }

  /**
   * Convert temperatures written as "220°C" (and rates like "13°C/hour") inside
   * free text to the user's unit. Profile wording is plain text that authors
   * write in °C; this keeps it right for everyone.
   */
  function localiseTemps(s) {
    if (format.tempUnit === 'C' || typeof s !== 'string' || s.indexOf('°C') < 0) return s;
    return s
      .replace(/(-?\d+(?:\.\d+)?)\s?°C\/(hour|h|min)\b/g, (m, n, u) => round(Number(n) * 9 / 5, 1) + '°F/' + u)
      .replace(/(-?\d+(?:\.\d+)?)\s?°C(?![A-Za-z/])/g, (m, n) => toDisplayTemp(Number(n)) + '°F')
      .replace(/°C/g, '°F');
  }

  /** localiseTemps for an HTML string: text only — never attributes, textareas or scripts. */
  function localiseHtml(html) {
    if (format.tempUnit === 'C' || typeof html !== 'string') return html;
    let skip = false;
    return html.split(/(<[^>]*>)/).map((part) => {
      if (part.charAt(0) === '<') {
        const m = /^<(\/?)(textarea|script|style)\b/i.exec(part);
        if (m) skip = !m[1];
        return part;
      }
      return skip ? part : localiseTemps(part);
    }).join('');
  }

  /** "14:30", "tomorrow 02:30", "Tue 09:00" relative to now (or 12-hour "2:30 PM"). */
  function clock(t, now) {
    if (t == null || isNaN(t)) return '—';
    const d = new Date(t);
    const hhmm = format.clock24h
      ? pad(d.getHours()) + ':' + pad(d.getMinutes())
      : ((d.getHours() % 12) || 12) + ':' + pad(d.getMinutes()) + ' ' + (d.getHours() < 12 ? 'AM' : 'PM');
    const days = Math.round((startOfDay(t) - startOfDay(now == null ? Date.now() : now)) / 86400000);
    if (days === 0) return hhmm;
    if (days === 1) return 'tomorrow ' + hhmm;
    if (days === -1) return 'yesterday ' + hhmm;
    return d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' }) + ' ' + hhmm;
  }

  function dateLabel(t) {
    return new Date(t).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
  }

  function isoDate(t) {
    const d = new Date(t);
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }

  /** value for <input type="datetime-local"> */
  function toLocalInput(t) {
    const d = new Date(t);
    return isoDate(t) + 'T' + pad(d.getHours()) + ':' + pad(d.getMinutes());
  }

  function uid(prefix) {
    return (prefix || 'id') + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  function clone(x) { return x == null ? x : JSON.parse(JSON.stringify(x)); }

  function getPath(obj, path) {
    return path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
  }

  function setPath(obj, path, value) {
    const keys = path.split('.');
    let o = obj;
    for (let i = 0; i < keys.length - 1; i++) {
      if (o[keys[i]] == null) o[keys[i]] = /^\d+$/.test(keys[i + 1]) ? [] : {};
      o = o[keys[i]];
    }
    o[keys[keys.length - 1]] = value;
  }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function num(v, fallback) {
    const n = typeof v === 'number' ? v : parseFloat(v);
    return isFinite(n) ? n : fallback;
  }

  CPT.util = { MIN, pad, hms, shortTimer, dur, durCompact, clock, dateLabel, isoDate, toLocalInput, uid, clone, getPath, setPath, esc, num, round, format, setFormat, tempUnit, toDisplayTemp, fromDisplayTemp, temp, localiseTemps, localiseHtml };
})(globalThis.CPT = globalThis.CPT || {});
