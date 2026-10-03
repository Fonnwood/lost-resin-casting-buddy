/* Casting Process Tracker — SETTINGS view: alerts, display, profiles, backup, and the profile editor.
 * Renderers return { html, live } — see js/ui/components.js. */
(function (CPT) {
  'use strict';

  const U = CPT.util;
  const P = CPT.Profile;
  const E = CPT.Engine;
  const h = U.esc;
  const { ctx, btn, openSourceNote, refLine, field, numInput, toggle, select, provSelect, safetyCard, defaultProfileOf } = CPT.UI.lib;

  function renderSettings(app, now) {
    const c = ctx();
    if (app.editProfileId) return { html: profileEditor(app), live: c.live };
    const s = app.settings;
    const A = CPT.Alerts;
    let html = '<section class="card"><h2>Alerts</h2>';
    html += pushBlock();
    html += toggle('settings|alerts.enabled', s.alerts.enabled, 'All alerts') + toggle('settings|alerts.sound', s.alerts.sound, 'Sound') + toggle('settings|alerts.vibrate', s.alerts.vibrate, 'Vibrate (where supported)');
    html += '<div class="eyebrow">INDIVIDUAL ALERTS</div>';
    Object.keys(E.ALERT_PREFS).forEach((k) => { html += toggle('settings|alerts.prefs.' + k, s.alerts.prefs[k] !== false, E.ALERT_PREFS[k]); });
    html += btn('testAlert', 'Test alert', 'ghost') + '</section>';

    const opt = (value, label, cur) => '<option value="' + h(value) + '"' + (String(cur) === String(value) ? ' selected' : '') + '>' + h(label) + '</option>';
    html += '<section class="card"><h2>Display</h2>' +
      field('Theme', '<select data-bind="settings|theme">' + opt('dark', 'Dark (workshop)', s.theme) + opt('light', 'Light', s.theme) + opt('auto', 'Follow system', s.theme) + '</select>') +
      '<div class="grid2">' +
      field('Temperature unit', '<select data-bind="settings|tempUnit">' + opt('C', '°C (Celsius)', s.tempUnit) + opt('F', '°F (Fahrenheit)', s.tempUnit) + '</select>', 'Display only — profiles always store °C.') +
      field('Text size', '<select data-type="number" data-bind="settings|textScale">' + [[90, 'Small'], [100, 'Normal'], [115, 'Large'], [130, 'Extra large']].map((o) => opt(o[0], o[1], s.textScale)).join('') + '</select>') +
      '</div>' +
      field('Accent colour', '<div class="row2"><input type="color" data-bind="settings|accent" value="' + h(/^#[0-9a-f]{6}$/i.test(s.accent || '') ? s.accent : '#ff9a3c') + '" aria-label="Accent colour">' + btn('accentReset', 'Use theme colour', 'ghost small') + '</div>') +
      toggle('settings|clock24h', s.clock24h !== false, '24-hour clock') +
      toggle('settings|wakeLock', s.wakeLock, 'Keep screen awake while the app is open' + (A.wakeLockSupported() ? '' : ' (not supported in this browser)')) +
      '<details class="stage-editor"><summary>Custom CSS</summary>' +
      field('Your own styles', '<textarea rows="6" spellcheck="false" data-bind="settings|customCss" placeholder=":root { --radius: 4px; --card: #101820; }">' + h(s.customCss || '') + '</textarea>', 'Applied last, on this device only. Colours and sizes are CSS variables — see docs/CUSTOMISING.md.') +
      '</details></section>';

    html += '<section class="card"><h2>Process profiles</h2><p class="hint">New runs copy a profile. Editing a profile never changes past or active runs.</p>';
    app.profiles.forEach((p) => {
      const isDef = (s.defaultProfileId || app.profiles[0].id) === p.id;
      html += '<div class="profile-row"><div><strong>' + h(p.name) + '</strong>' + (isDef ? ' <span class="tag">default</span>' : '') + '<div class="muted">' + h(p.stages.length) + ' stages · ' + h(p.materials.metal) + '</div></div><div class="profile-actions">' +
        btn('profileEdit', 'Edit', 'ghost small', p.id) + btn('profileDup', 'Duplicate', 'ghost small', p.id) + btn('profileExport', 'Export', 'ghost small', p.id) +
        (isDef ? '' : btn('profileDefault', 'Make default', 'ghost small', p.id)) + (app.profiles.length > 1 ? btn('profileDelete', 'Delete', 'danger small', p.id) : '') + '</div></div>';
    });
    html += '<div class="row2">' + btn('profileNew', 'New blank profile', 'ghost') + '<label class="btn ghost file">Import profile<input type="file" accept="application/json,.json" data-action-change="importProfile" hidden></label></div></section>';

    html += accountCard(c);
    const synced = CPT.Sync && CPT.Sync.status.email;
    html += '<section class="card"><h2>Data & backup</h2><p class="hint">' + (synced
      ? 'Stored on this device and synced to your account. A backup file is still a good idea before big changes.'
      : 'Everything is stored on this device only. Safari can clear website data you haven’t opened for 7 days — add the app to your Home Screen and export a backup regularly.') + '</p>' +
      '<p>Storage: ' + (CPT.Storage.available ? 'browser storage' : '<strong>not available — data will be lost on reload</strong>') + (app.persisted ? ' · persistent ✓' : '') + '</p>' +
      '<div class="row2">' + btn('exportAll', 'Export full backup', 'ghost') + '<label class="btn ghost file">Restore backup<input type="file" accept="application/json,.json" data-action-change="importFile" hidden></label></div></section>';

    html += safetyCard(defaultProfileOf(app), false);
    html += '<section class="card"><h2>About</h2><p>Lost Resin Casting Buddy v' + h(CPT.VERSION) + '. A process companion and timing dashboard — not a kiln controller.</p>' +
      openSourceNote('') + '<p class="hint">Bug reports, ideas and profiles for other materials are welcome there.</p></section>';
    return { html, live: c.live };
  }

  /** Notifications: push from the server where the host offers it, otherwise the page's own (open app only). */
  function pushBlock() {
    const A = CPT.Alerts;
    const N = CPT.Push;
    const st = N && N.status;
    const calendar = 'For overnight burnouts, <strong>Add alarms to calendar</strong> on the Timeline screen is a good backup.';
    if (st && st.available) {
      if (st.enabled) {
        return '<p class="okline">✓ <strong>Notifications on.</strong> Alerts arrive even when the app is closed or the phone is locked.</p>' +
          (st.error ? '<p class="warnbox">' + h(st.error) + '</p>' : '') +
          '<p class="hint">Switch individual alerts on or off below. ' + calendar + '</p>' +
          btn('pushOff', 'Turn off notifications', 'ghost small', null, st.busy ? ' disabled' : '');
      }
      return '<p>Get alerts on this device even when the app is closed or the phone is locked — so an overnight burnout can wake you.</p>' +
        (st.error ? '<p class="warnbox">' + h(st.error) + '</p>' : '') +
        btn('pushOn', st.busy ? 'Turning on…' : 'Turn on notifications', 'primary', null, st.busy ? ' disabled' : '') +
        '<p class="hint">No account needed. ' + calendar + '</p>';
    }
    if (N && N.needsInstall() && CPT.Sync && CPT.Sync.status.pushKey) {
      return '<p class="warnbox">On iPhone and iPad, notifications need the app on your Home Screen: tap <strong>Share → Add to Home Screen</strong>, then open Casting Buddy from there and turn them on here.</p>';
    }
    const perm = A.permission();
    let html = '<p>Notifications: <strong>' + h(perm) + '</strong></p>';
    if (perm !== 'granted' && perm !== 'unsupported') html += btn('requestNotify', 'Enable notifications', 'primary');
    if (perm === 'unsupported') html += '<p class="hint">This browser can’t show notifications here. On iPhone, add the app to your Home Screen first (Share → Add to Home Screen).</p>';
    return html + '<p class="warnbox">A sleeping phone cannot run web-page timers. ' + calendar + '</p>';
  }

  /** Optional account & sync. Hidden entirely on hosts without accounts (static hosting, opened from disk). */
  function accountCard(c) {
    const st = CPT.Sync && CPT.Sync.status;
    if (!st || !st.available) return '';
    let html = '<section class="card" id="account"><h2>Account & sync</h2>';
    if (!st.email) {
      html += '<p>Optional. Sign in with your email to keep your runs, profiles and settings in your account and pick them up on any device. Without an account everything stays on this device, as before.</p>' +
        '<p class="hint">No password: we email you a code. We store only your email address and your casting data — no name, no tracking.</p>' +
        (st.error ? '<p class="warnbox">' + h(st.error) + '</p>' : '') +
        btn('signIn', 'Sign in with email', 'primary');
      return html + '</section>';
    }
    let line;
    if (st.syncing) line = 'Syncing…';
    else if (st.error) line = st.error;
    else if (st.lastSyncAt) line = 'Synced ' + U.clock(st.lastSyncAt, Date.now()) + '.';
    else line = 'Not synced yet.';
    html += '<p>Signed in as <strong>' + h(st.email) + '</strong></p>' +
      '<p class="muted">' + c.L('syncStatus', line) + '</p>' +
      '<p class="hint">Changes sync automatically. Text size and keep-screen-awake stay per device.</p>' +
      '<div class="row2">' + btn('syncNow', 'Sync now', 'ghost') + btn('signOut', 'Sign out', 'ghost') + '</div>' +
      '<details class="stage-editor"><summary>Delete account</summary><p class="hint">Removes your email address and all synced data from the server. Data on this device is kept.</p>' +
      btn('deleteAccount', 'Delete account', 'danger small') + '</details>';
    return html + '</section>';
  }

  function profileEditor(app) {
    const p = app.profiles.find((x) => x.id === app.editProfileId);
    if (!p) return '<section class="card"><p>Profile not found.</p>' + btn('profileClose', '← Back', 'ghost') + '</section>';
    const scope = 'profile:' + p.id;
    let html = '<div class="row2">' + btn('profileClose', '← Done', 'ghost') + '</div>';
    html += '<section class="card"><h2>Profile</h2>' + field('Name', '<input type="text" data-bind="' + scope + '|name" value="' + h(p.name) + '">');
    Object.keys(p.materials).forEach((k) => { html += field(h(k.replace(/([A-Z])/g, ' $1').replace(/^./, (x) => x.toUpperCase())), '<input type="text" data-bind="' + scope + '|materials.' + h(k) + '" value="' + h(p.materials[k]) + '">'); });
    html += '</section>';

    html += '<section class="card"><h2>Settings</h2>';
    Object.keys(p.params).forEach((k) => {
      const par = p.params[k];
      html += '<div class="param-edit">' + field(h(par.label) + ' <small>' + h(par.unit) + '</small>', numInput(scope + '|params.' + k + '.value', par.value, '', par.unit === '°C')) +
        field('Evidence', provSelect(scope + '|params.' + k + '.sourceType', par.sourceType)) + '</div>' + (par.note ? '<p class="hint">' + h(par.note) + '</p>' : '');
    });
    html += '</section>';

    const phaseIds = Array.from(new Set(Object.keys(P.PHASES).concat(p.stages.map((s) => s.phase))));
    html += '<datalist id="phase-ids">' + phaseIds.map((id) => '<option value="' + h(id) + '">').join('') + '</datalist>';
    html += '<section class="card"><h2>Phase headings</h2><p class="hint">The wording used to group stages on the timeline. Add a new phase by typing a new phase id on any stage.</p>';
    Array.from(new Set(p.stages.map((s) => s.phase))).forEach((id) => {
      html += field(h(id), '<input type="text" data-bind="' + scope + '|phases.' + h(id) + '" value="' + h(P.phaseLabel(p, id)) + '">');
    });
    html += '</section>';

    html += '<section class="card"><h2>Stages</h2><p class="hint">Stage order, types, timings, temperatures and wording are all editable. “Kiln programme” stages advance on schedule; “You confirm” stages wait for a tap.</p>';
    p.stages.forEach((s, i) => { html += stageEditor(scope, p, s, i); });
    html += btn('stageInsert', '+ Add stage at end', 'ghost', p.stages.length - 1) + '</section>';
    return html;
  }

  function stageEditor(scope, p, s, i) {
    const b = scope + '|stages.' + i + '.';
    const pv = s.provenance || {};
    let html = '<details class="stage-editor"><summary><span class="se-idx">' + (i + 1) + '</span> ' + h(s.name) + ' <span class="muted">· ' + h(U.dur(s.minutes, s.unit)) + (s.targetC != null ? ' · ' + h(s.targetC) + '°C' : '') + '</span></summary>';
    html += '<div class="grid2">' + field('Name', '<input type="text" data-bind="' + b + 'name" value="' + h(s.name) + '">') + field('Timeline label', '<input type="text" data-bind="' + b + 'short" value="' + h(s.short || '') + '">') + '</div>';
    html += '<div class="grid2">' + field('Phase', '<input type="text" list="phase-ids" pattern="[a-z0-9_]+" data-bind="' + b + 'phase" value="' + h(s.phase) + '">', 'Stages with the same phase id are grouped under one heading.') + field('Type', select(b + 'type', P.STAGE_TYPES, s.type)) + '</div>';
    html += '<div class="grid2">' + field('Control', select(b + 'control', { user: 'You confirm', kiln: 'Kiln programme (auto)' }, s.control)) + field('Duration unit', select(b + 'unit', { min: 'minutes', s: 'seconds' }, s.unit || 'min')) + '</div>';
    html += '<div class="grid3">' + field('Minutes', numInput(b + 'minutes', s.minutes)) + field('Minimum', numInput(b + 'minMinutes', s.minMinutes)) + field('Target °C', numInput(b + 'targetC', s.targetC, '', true)) + '</div>';
    html += '<div class="grid3">' + field('Time evidence', provSelect(b + 'provenance.duration', pv.duration)) + field('Minimum evidence', provSelect(b + 'provenance.minimum', pv.minimum)) + field('Temp evidence', provSelect(b + 'provenance.target', pv.target)) + '</div>';
    html += refLine(s);
    html += field('What to do now', '<textarea rows="2" data-bind="' + b + 'doNow">' + h(s.doNow || '') + '</textarea>', 'Placeholders: {targetC} {startC} {waterMl} {powderG} {waterRatioPct} {metal} {metalTargetC} {remaining}');
    html += field('Instructions', '<textarea rows="2" data-bind="' + b + 'instructions">' + h(s.instructions || '') + '</textarea>');
    html += field('Warning', '<input type="text" data-bind="' + b + 'warning" value="' + h(s.warning || '') + '">');
    html += field('Checklist (one per line)', '<textarea rows="4" data-type="lines" data-bind="' + b + 'checklist">' + h((s.checklist || []).join('\n')) + '</textarea>');
    html += '<div class="grid2">' + field('Complete button label', '<input type="text" data-bind="' + b + 'completeLabel" value="' + h(s.completeLabel || '') + '">') + field('Source', '<input type="text" data-bind="' + b + 'source" value="' + h(s.source || '') + '">') + '</div>';
    html += field('Notes', '<input type="text" data-bind="' + b + 'notes" value="' + h(s.notes || '') + '">');
    html += '<div class="eyebrow">IN-STAGE REMINDERS</div>';
    (s.events || []).forEach((ev, j) => {
      html += '<div class="grid3 ev-edit">' + field('When', select(b + 'events.' + j + '.trigger', { 'before-end': 'min before end', 'after-start': 'min after start' }, ev.trigger)) + field('Minutes', numInput(b + 'events.' + j + '.offsetMinutes', ev.offsetMinutes)) + field('Reminder', '<input type="text" data-bind="' + b + 'events.' + j + '.text" value="' + h(ev.text) + '">') + btn('eventDelete', 'Remove', 'danger small', i + ':' + j) + '</div>';
    });
    html += btn('eventAdd', '+ Add reminder', 'ghost small', i);
    html += '<div class="row3">' + btn('stageMove', '↑ Up', 'ghost small', i + ':-1') + btn('stageMove', '↓ Down', 'ghost small', i + ':1') + btn('stageInsert', '+ Insert after', 'ghost small', i) + btn('stageDelete', 'Delete stage', 'danger small', i) + '</div>';
    html += '</details>';
    return html;
  }

  CPT.UI.renderSettings = renderSettings;
})(globalThis.CPT = globalThis.CPT || {});
