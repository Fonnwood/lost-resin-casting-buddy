/* Casting Process Tracker — app controller: state, persistence, actions,
 * the 1-second tick, alerts and reopen detection. Process logic lives in
 * engine.js; this file only wires it to the DOM. */
(function (CPT) {
  'use strict';

  const U = CPT.util;
  const P = CPT.Profile;
  const E = CPT.Engine;
  const S = CPT.Storage;
  const A = CPT.Alerts;
  const UI = CPT.UI;

  CPT.VERSION = '1.0.0';

  const TICK_VIEWS = { now: true, timeline: true };
  const RENDER = { now: UI.renderNow, timeline: UI.renderTimeline, run: UI.renderRun, history: UI.renderHistory, settings: UI.renderSettings };

  const app = {
    profiles: S.loadProfiles(),
    runs: S.loadRuns(),
    activeRunId: S.loadActiveRunId(),
    settings: S.loadSettings(),
    view: 'now',
    historyRunId: null,
    editProfileId: null,
    modal: null,
    banner: null,
    toastMsg: null,
    persisted: false,
    lastHtml: {},
    activeRun() {
      if (!this.activeRunId) return null;
      return this.runs.find((r) => r.id === this.activeRunId) || null;
    },
  };
  CPT.app = app;

  /** Add built-in profiles this install hasn't seen yet (once — deleting one keeps it deleted). */
  function seedBuiltIns() {
    const seen = app.settings.seenBuiltIns || app.profiles.filter((p) => p.builtIn).map((p) => p.id);
    let changed = !app.settings.seenBuiltIns;
    P.builtInProfiles().forEach((b) => {
      // Refresh a built-in you haven't edited when the app ships a newer version.
      const i = app.profiles.findIndex((p) => p.id === b.id);
      if (i >= 0 && app.profiles[i].builtIn && !app.profiles[i].edited && (app.profiles[i].builtInVersion || 1) < b.builtInVersion) {
        const old = app.profiles[i];
        // Profiles edited before edits were tracked: keep a copy rather than lose them.
        if (JSON.stringify(old.stages) !== JSON.stringify(b.stages) || JSON.stringify(old.materials) !== JSON.stringify(b.materials)) {
          app.profiles.push(Object.assign(U.clone(old), { id: U.uid('profile'), name: old.name + ' (before update)', builtIn: false, makeDefault: false }));
        }
        app.profiles[i] = b;
        changed = true;
      }
      if (seen.includes(b.id)) return;
      seen.push(b.id);
      changed = true;
      if (!app.profiles.some((p) => p.id === b.id)) app.profiles.push(b);
      if (b.makeDefault && !app.settings.defaultProfileId) app.settings.defaultProfileId = b.id;
    });
    // Never leave the app without a profile to start a run from.
    if (!app.profiles.length) { app.profiles.push(P.blankProfile('My profile')); changed = true; }
    if (changed) {
      app.settings.seenBuiltIns = seen;
      S.saveProfiles(app.profiles);
      S.saveSettings(app.settings);
    }
  }
  seedBuiltIns();

  const $ = (sel) => document.querySelector(sel);
  let lastSave = 0;

  // ------------------------------------------------------------- persist

  function save() {
    S.saveRuns(app.runs);
    S.saveActiveRunId(app.activeRunId);
    lastSave = Date.now();
  }
  function saveProfiles() { S.saveProfiles(app.profiles); }
  function saveSettings() { S.saveSettings(app.settings); }

  // -------------------------------------------------------------- render

  function applyLive(root, live) {
    root.querySelectorAll('[data-live]').forEach((el) => {
      const v = live[el.getAttribute('data-live')];
      if (v != null && el.textContent !== String(v)) el.textContent = v;
    });
  }

  /** Re-render the current view. `force` rebuilds structure even for form views. */
  function render(force) {
    const now = Date.now();
    const root = $('#view');
    const out = RENDER[app.view](app, now);
    out.html = U.localiseHtml(out.html);
    Object.keys(out.live).forEach((k) => { out.live[k] = U.localiseTemps(out.live[k]); });
    if (force || TICK_VIEWS[app.view] || app.lastHtml.view !== app.view) {
      if (out.html !== app.lastHtml.html || app.lastHtml.view !== app.view) {
        const focused = document.activeElement && document.activeElement.getAttribute && document.activeElement.getAttribute('data-bind');
        const scroll = app.lastHtml.view === app.view ? window.scrollY : 0;
        root.innerHTML = out.html;
        app.lastHtml = { view: app.view, html: out.html };
        if (focused) {
          const el = root.querySelector('[data-bind="' + CSS.escape(focused) + '"]');
          if (el) el.focus({ preventScroll: true });
        }
        if (scroll) window.scrollTo(0, scroll);
      }
    }
    applyLive(root, out.live);
    renderChrome();
  }

  function renderChrome() {
    document.querySelectorAll('.tabbar [data-arg]').forEach((b) => {
      b.classList.toggle('on', b.getAttribute('data-arg') === app.view);
      b.setAttribute('aria-current', b.getAttribute('data-arg') === app.view ? 'page' : 'false');
    });
    const wake = $('#wakeBtn');
    if (wake) {
      wake.classList.toggle('on', !!app.settings.wakeLock);
      wake.setAttribute('aria-pressed', String(!!app.settings.wakeLock));
    }
    const banner = $('#banner');
    if (app.banner && app.banner.t && Date.now() - app.banner.t > 15 * U.MIN) app.banner = null;
    const html = app.banner ? '<div class="alert-banner" role="alert"><div><strong>' + U.esc(U.localiseTemps(app.banner.title)) + '</strong>' + (app.banner.body ? '<div>' + U.esc(U.localiseTemps(app.banner.body)) + '</div>' : '') + '</div><button type="button" class="btn ghost small" data-action="dismissBanner">OK</button></div>' : '';
    if (banner.innerHTML !== html) banner.innerHTML = html;
  }

  function renderModal() {
    try {
      $('#modal').innerHTML = U.localiseHtml(UI.renderModal(app, Date.now()));
    } catch (err) {
      // A modal that cannot draw must not stay "open" and block everything behind it.
      console.error(err);
      app.modal = null;
      $('#modal').innerHTML = '';
      return;
    }
    const first = $('#modal input, #modal select');
    if (first && app.modal && app.modal.type !== 'attention') first.focus({ preventScroll: true });
  }

  function openModal(m) { app.modal = m; renderModal(); }
  function closeModal() { app.modal = null; renderModal(); }

  function toast(msg) {
    const el = $('#toast');
    el.textContent = U.localiseTemps(msg);
    el.classList.add('show');
    clearTimeout(toast.t);
    toast.t = setTimeout(() => el.classList.remove('show'), 3500);
  }

  function go(view) {
    app.view = view;
    if (view !== 'history') app.historyRunId = null;
    if (view !== 'settings') app.editProfileId = null;
    window.scrollTo(0, 0);
    render(true);
  }

  /** Readable text colour (near-black or white) for a #rrggbb background. */
  function inkFor(hex) {
    const n = parseInt(hex.slice(1), 16);
    const lum = (0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)) / 255;
    return lum > 0.55 ? '#1a1206' : '#ffffff';
  }

  /** Apply every display preference: theme, accent, text size, units, custom CSS. */
  function applyTheme() {
    const s = app.settings;
    const root = document.documentElement;
    const t = s.theme;
    if (t === 'auto') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', t);
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', t === 'light' ? '#f4f2ee' : '#0b0c0e');

    if (/^#[0-9a-f]{6}$/i.test(s.accent || '')) {
      root.style.setProperty('--accent', s.accent);
      root.style.setProperty('--accent-ink', inkFor(s.accent));
    } else {
      root.style.removeProperty('--accent');
      root.style.removeProperty('--accent-ink');
    }
    const scale = Math.min(150, Math.max(80, U.num(s.textScale, 100)));
    root.style.fontSize = scale === 100 ? '' : scale + '%';

    let style = document.getElementById('user-css');
    if (!style) { style = document.createElement('style'); style.id = 'user-css'; document.head.appendChild(style); }
    if (style.textContent !== (s.customCss || '')) style.textContent = s.customCss || '';

    U.setFormat(s);
  }

  /** Name, logo and page title from config.js. */
  function applyBranding() {
    const cfg = CPT.config || {};
    const name = cfg.appName || 'Casting Buddy';
    document.title = name;
    const brand = document.querySelector('.brand');
    if (brand) {
      brand.setAttribute('aria-label', name + ' — go to Now');
      brand.innerHTML = '<span class="logo" aria-hidden="true">' + U.esc(cfg.logo != null ? cfg.logo : '▲') + '</span><span>' + U.esc(name) + '</span>';
    }
    const title = document.querySelector('meta[name="apple-mobile-web-app-title"]');
    if (title) title.setAttribute('content', name);
    if (cfg.customCssUrl) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = cfg.customCssUrl;
      document.head.appendChild(link);
    }
  }

  // ---------------------------------------------------------------- tick

  function tick() {
    try { tickRun(); } catch (err) { console.error(err); }
    try { render(false); } catch (err) { console.error(err); renderFailure(err); }
  }

  /** Last-resort screen if a view cannot draw: the user still gets a way out. */
  function renderFailure(err) {
    const root = $('#view');
    app.lastHtml = { view: null, html: null };
    root.innerHTML = '<section class="card"><h2>Something went wrong showing this screen</h2><p class="hint">' + U.esc(String(err && err.message || err)) + '</p>' +
      '<p>Your run is saved. You can reload, or use the tabs below to move around.</p>' +
      '<button type="button" class="btn primary xl" data-action="reload">Reload</button>' +
      '<button type="button" class="btn ghost" data-action="nav" data-arg="run">Open RUN screen</button></section>';
  }

  function tickRun() {
    const now = Date.now();
    const run = app.activeRun();
    if (run && run.status === 'active') {
      const since = run.lastSeenAt || now;
      const advanced = E.advance(run, now);
      const sched = E.schedule(run, now);

      // App was closed / phone asleep: ask the user to check reality.
      if (now - since > 90000 && !app.modal) {
        const att = E.attention(run, sched, since, now);
        if (att) openModal({ type: 'attention', data: att });
      }

      const due = E.dueAlerts(run, sched, now);
      if (due.fire.length || due.stale.length) {
        due.fire.forEach((a) => {
          if (A.fire(a, app.settings)) app.banner = { title: a.title, body: a.body, t: now };
        });
        E.markAlerts(run, due.fire.concat(due.stale));
        save();
      }
      run.lastSeenAt = now;
      if (advanced.length || now - lastSave > 15000) save();
    }
  }

  function markSeen() {
    const run = app.activeRun();
    if (run && run.status === 'active') { run.lastSeenAt = Date.now(); save(); }
  }

  // ------------------------------------------------------------- actions

  function withRun(fn) {
    const run = app.activeRun();
    if (!run) return;
    fn(run, Date.now());
    app.banner = null; // acting on the run acknowledges any alert
    run.lastSeenAt = Date.now();
    E.advance(run, Date.now());
    save();
    render(true);
  }

  function download(name, obj) { A.download(name, JSON.stringify(obj, null, 2), 'application/json'); }

  function safeName(s) { return String(s || 'run').replace(/[^\w-]+/g, '-').replace(/-+/g, '-').slice(0, 60); }

  function newProfileFrom(src, name) {
    const p = U.clone(src);
    p.id = U.uid('profile');
    p.name = name;
    p.builtIn = false;
    return p;
  }

  function importData(obj) {
    const msg = [];
    const mergeRuns = (runs) => {
      let n = 0;
      runs.forEach((r) => {
        if (!r || !r.id || !r.profile || !Array.isArray(r.events)) return;
        const i = app.runs.findIndex((x) => x.id === r.id);
        if (i >= 0) app.runs[i] = r; else app.runs.push(r);
        n++;
      });
      return n;
    };
    if (obj.type === 'casting-backup') {
      (obj.profiles || []).forEach((p) => {
        const np = P.normalise(p);
        const i = app.profiles.findIndex((x) => x.id === np.id);
        if (i >= 0) app.profiles[i] = np; else app.profiles.push(np);
      });
      msg.push(mergeRuns(obj.runs || []) + ' runs');
      if (obj.settings) app.settings = Object.assign(app.settings, obj.settings);
      if (obj.activeRunId && !app.activeRun()) app.activeRunId = obj.activeRunId;
      msg.push((obj.profiles || []).length + ' profiles');
    } else if (obj.type === 'casting-history') {
      msg.push(mergeRuns(obj.runs || []) + ' runs');
    } else if (obj.type === 'casting-run' && obj.run) {
      mergeRuns([obj.run]);
      if (obj.run.status === 'active' && !app.activeRun()) app.activeRunId = obj.run.id;
      msg.push('1 run');
    } else if (obj.type === 'casting-profile' || Array.isArray(obj.stages)) {
      const np = P.normalise(obj.profile || obj);
      if (app.profiles.some((x) => x.id === np.id)) np.id = U.uid('profile');
      app.profiles.push(np);
      msg.push('profile “' + np.name + '”');
    } else {
      throw new Error('Unrecognised file.');
    }
    save(); saveProfiles(); saveSettings(); applyTheme();
    toast('Imported ' + msg.join(', ') + '.');
    render(true);
  }

  function readFile(input, cb) {
    const f = input.files && input.files[0];
    if (!f) return;
    const r = new FileReader();
    r.onload = () => {
      try { cb(JSON.parse(r.result)); } catch (e) { toast('Import failed: ' + e.message); }
      input.value = '';
    };
    r.readAsText(f);
  }

  function historyRun(id) { return app.runs.find((r) => r.id === id); }

  const actions = {
    nav: (arg) => go(arg),
    settings: () => go('settings'),
    newRun: () => openModal({ type: 'newRun' }),
    createRun: () => {
      const now = Date.now();
      const current = app.activeRun();
      if (current && current.status === 'active') { toast('Finish or abandon the current run first.'); closeModal(); return; }
      if (current && current.status === 'draft') app.runs = app.runs.filter((r) => r.id !== current.id);
      const profile = app.profiles.find((p) => p.id === $('#nr-profile').value) || app.profiles[0];
      const run = E.newRun(profile, now, $('#nr-name').value.trim() || undefined);
      run.values.modelName = $('#nr-model').value.trim();
      app.runs.push(run);
      app.activeRunId = run.id;
      save();
      app.modal = null;
      if (!app.settings.safetyAcknowledged) openModal({ type: 'safety' }); else renderModal();
      go('run');
    },
    startRun: () => withRun((run, now) => {
      E.startRun(run, now);
      A.unlockAudio();
      app.view = 'now';
      toast('Run started.');
    }),
    complete: () => withRun((run, now) => {
      const sched = E.schedule(run, now);
      const s = run.profile.stages[sched.cur];
      if (s && s.type === 'soak') {
        const f = E.flaskInfo(run, sched, now);
        if (!f.ready || sched.facts.metal.status !== 'ready') { toast('Casting unlocks when the soak is complete and the metal is confirmed.'); return; }
      }
      E.completeCurrent(run, now);
    }),
    resetStage: () => withRun((run, now) => { if (E.restartCurrent(run, now)) toast('Timer reset — this step restarted from now.'); }),
    skipStage: () => openModal({ type: 'confirm', title: 'Skip this step?', text: 'Marks the current step finished now and starts the next one. You can undo it straight afterwards.', yes: 'Skip step', onYes: () => withRun((run, now) => { if (E.skipCurrent(run, now)) toast('Moved on to the next step.'); }) }),
    backStage: () => withRun((run, now) => { if (E.backOne(run, now)) toast('Back on the previous step, restarted from now.'); }),
    completeAnyway: (arg) => openModal({ type: 'confirm', title: 'Continue to casting?', text: 'Still waiting on: ' + (arg || 'a gate') + '. Only continue if you have checked the flask and metal yourself — the manufacturer soak minimum protects the mould.', yes: 'Continue anyway', onYes: () => withRun((run, now) => E.completeCurrent(run, now)) }),
    extend: (arg) => withRun((run, now) => {
      const s = run.profile.stages[E.currentIndex(run)];
      if (!s) return;
      E.extend(run, s.id, Number(arg), now);
      toast('+' + arg + ' min on “' + s.name + '”' + (s.control === 'kiln' ? ' — extend the kiln controller too.' : '.'));
    }),
    extendCustom: () => openModal({ type: 'extend' }),
    applyExtend: () => {
      const v = Number($('#ext-min').value);
      closeModal();
      if (!v) return;
      withRun((run, now) => { const s = run.profile.stages[E.currentIndex(run)]; if (s) E.extend(run, s.id, v, now); });
    },
    pause: () => withRun((run, now) => { const s = run.profile.stages[E.currentIndex(run)]; if (s) E.pause(run, s.id, now); }),
    resume: () => withRun((run, now) => { const s = run.profile.stages[E.currentIndex(run)]; if (s) E.resume(run, s.id, now); }),
    undo: () => withRun((run) => { const u = E.undoable(run); if (E.undo(run)) toast('Undone: ' + u.label); }),
    metalStart: () => withRun((run, now) => E.metalStart(run, now)),
    metalReady: () => withRun((run, now) => E.metalReady(run, now)),
    metalReset: () => openModal({ type: 'confirm', title: 'Reset metal status?', text: 'This clears the metal heating / ready confirmation.', yes: 'Reset', onYes: () => withRun((run, now) => E.metalReset(run, now)) }),
    flaskConfirm: (arg) => withRun((run, now) => E.confirmFlask(run, arg, now)),
    mark: (arg) => withRun((run, now) => E.mark(run, arg, now)),
    kilnSyncOpen: () => openModal({ type: 'kilnSync' }),
    syncPick: (arg) => { app.modal.selected = Number(arg); renderModal(); },
    kilnSyncApply: (arg) => {
      if (arg == null) { closeModal(); return; }
      const mins = Number($('#sync-min').value);
      closeModal();
      withRun((run, now) => E.kilnSync(run, Number(arg), mins, now));
      toast('Schedule re-synced to the kiln.');
    },
    attentionOk: () => closeModal(),
    attentionSync: () => openModal({ type: 'kilnSync' }),
    attentionYes: (arg) => { closeModal(); withRun((run, now) => E.completeCurrent(run, now, { at: Number(arg) })); },
    attentionNo: () => closeModal(),
    toggleCheck: (arg) => withRun((run) => {
      const idx = arg.lastIndexOf(':');
      const id = arg.slice(0, idx);
      const n = arg.slice(idx + 1);
      run.checks[id] = run.checks[id] || {};
      run.checks[id][n] = !run.checks[id][n];
    }),
    rating: (arg) => {
      const idx = arg.lastIndexOf(':');
      const scope = arg.slice(0, idx);
      const n = Number(arg.slice(idx + 1));
      const target = scopeTarget(scope);
      if (!target) return;
      const key = scope === 'run' ? 'resultDraft' : 'result';
      target[key] = target[key] || {};
      target[key].rating = n;
      save(); render(true);
    },
    toggleDefect: (arg) => {
      // arg = "run:<defect>" or "hrun:<runId>:<defect>"
      let scope = 'run';
      let name = arg.slice(4);
      if (arg.startsWith('hrun:')) {
        const cut = arg.indexOf(':', 5);
        scope = arg.slice(0, cut);
        name = arg.slice(cut + 1);
      }
      const target = scopeTarget(scope);
      if (!target) return;
      const key = scope === 'run' ? 'resultDraft' : 'result';
      target[key] = target[key] || {};
      const d = target[key].defects = target[key].defects || [];
      const i = d.indexOf(name);
      if (i >= 0) d.splice(i, 1); else d.push(name);
      save(); render(true);
    },
    completeRun: () => {
      const run = app.activeRun();
      if (!run) return;
      const d = run.resultDraft || {};
      if (!d.rating && !confirm('No result rating yet. Complete the run anyway?')) return;
      const now = Date.now();
      const last = run.profile.stages[Math.min(E.currentIndex(run), run.profile.stages.length - 1)];
      const checks = (last && run.checks[last.id]) || {};
      E.completeRun(run, Object.assign({ defects: [], notes: '' }, d, { followUp: checks }), now);
      delete run.resultDraft;
      app.activeRunId = null;
      save();
      app.historyRunId = run.id;
      app.view = 'history';
      toast('Run saved to history.');
      render(true);
    },
    abandonRun: () => {
      const run = app.activeRun();
      if (!run) return;
      const draft = run.status === 'draft';
      openModal({
        type: 'confirm', title: draft ? 'Discard this draft?' : 'Abandon this run?',
        text: draft ? 'The draft and its values will be deleted.' : 'The run stops and is kept in history as abandoned.',
        yes: draft ? 'Discard' : 'Abandon',
        onYes: () => {
          if (draft) app.runs = app.runs.filter((r) => r.id !== run.id);
          else E.abandonRun(run, Date.now());
          app.activeRunId = null;
          save();
          go('now');
        },
      });
    },
    confirmYes: () => { const m = app.modal; closeModal(); if (m && m.onYes) m.onYes(); },
    closeModal: () => closeModal(),
    accentReset: () => { app.settings.accent = ''; saveSettings(); applyTheme(); render(true); },
    reload: () => location.reload(),
    dismissBanner: () => { app.banner = null; renderChrome(); },
    safetyAck: () => { app.settings.safetyAcknowledged = true; saveSettings(); closeModal(); },
    setRatio: (arg) => withRun((run, now) => {
      const par = run.profile.params.waterRatioPct;
      const before = par.value;
      if (Number(before) === Number(arg)) return;
      const note = P.editParam(par, Number(arg));
      E.logEdit(run, 'params.waterRatioPct.value', before, Number(arg), now);
      toast('Water ratio ' + arg + ':100 — ' + E.waterMl(run.profile) + ' ml water.' + (note ? ' ' + note : ''));
    }),
    planOpen: () => openModal({ type: 'plan' }),
    planAt: (arg) => withRun((run, now) => {
      const MIN = U.MIN;
      const stages = run.profile.stages;
      const raw = run.plan || {};
      let idx = raw.stageId ? stages.findIndex((s) => s.id === raw.stageId) : -1;
      if (idx < 0) idx = E.defaultPlanIndex(run.profile);
      const edge = raw.edge === 'end' ? 'end' : 'start';
      const base = { stageId: stages[idx].id, edge, at: now };
      let at;
      if (arg === 'earliest') {
        // Round up to the next whole minute so the plan is never in the past.
        at = Math.ceil(E.planAround(run.profile, run.values, base, now).earliest / MIN) * MIN;
      } else {
        at = Math.ceil((now + Number(arg) * MIN) / MIN) * MIN;
      }
      run.plan = { stageId: base.stageId, edge, at, locked: false };
    }),
    planStageMinutes: (arg) => withRun((run, now) => {
      const [i, m] = String(arg).split(':').map(Number);
      const st = run.profile.stages[i];
      if (!st || run.status !== 'draft' || Number(st.minutes) === m) return;
      const before = st.minutes;
      const note = P.editStageField(st, 'minutes', m);
      E.logEdit(run, 'profile.stages.' + i + '.minutes', before, m, now);
      if (note) toast(note);
    }),
    planLock: () => withRun((run) => {
      const plan = E.planOf(run.profile, run.plan);
      if (plan) run.plan = { stageId: plan.stageId, edge: plan.edge, at: plan.at, locked: true };
    }),
    planUnlock: () => withRun((run) => { if (run.plan) run.plan.locked = false; }),
    planClear: () => withRun((run) => { run.plan = null; if (app.modal && app.modal.type === 'plan') renderModal(); }),
    exportRun: (arg) => {
      const run = arg ? historyRun(arg) : app.activeRun();
      if (!run) return;
      download('casting-run-' + safeName(run.name) + '.json', { type: 'casting-run', version: CPT.VERSION, exportedAt: new Date().toISOString(), record: E.record(run), run });
    },
    exportHistory: () => {
      const runs = app.runs.filter((r) => r.status !== 'draft');
      download('casting-history-' + U.isoDate(Date.now()) + '.json', { type: 'casting-history', version: CPT.VERSION, exportedAt: new Date().toISOString(), records: runs.map(E.record), runs });
    },
    exportAll: () => download('casting-buddy-backup-' + U.isoDate(Date.now()) + '.json', { type: 'casting-backup', version: CPT.VERSION, exportedAt: new Date().toISOString(), profiles: app.profiles, runs: app.runs, settings: app.settings, activeRunId: app.activeRunId }),
    exportIcs: () => {
      const run = app.activeRun();
      if (!run) return;
      const cal = E.calendar(run, Date.now());
      if (!cal.count) { toast('Nothing upcoming to add.'); return; }
      A.download('casting-' + safeName(run.name) + '.ics', U.localiseTemps(cal.text), 'text/calendar');
      toast(cal.count + ' alarms exported. Re-export if the schedule changes.');
    },
    historyOpen: (arg) => { app.historyRunId = arg; app.view = 'history'; window.scrollTo(0, 0); render(true); },
    historyBack: () => { app.historyRunId = null; render(true); },
    deleteRun: (arg) => openModal({ type: 'confirm', title: 'Delete this run?', text: 'It will be removed from history permanently. Export it first if you want a copy.', yes: 'Delete', onYes: () => { app.runs = app.runs.filter((r) => r.id !== arg); app.historyRunId = null; save(); render(true); } }),
    requestNotify: async () => { A.unlockAudio(); const r = await A.requestPermission(); toast('Notifications: ' + r); render(true); },
    testAlert: () => { A.unlockAudio(); A.fire({ key: 'test', pref: 'test', title: 'Test alert', body: 'Alerts are working.' }, app.settings); app.banner = { title: 'Test alert', body: 'Alerts are working.' }; renderChrome(); },
    wakeToggle: async () => {
      app.settings.wakeLock = !app.settings.wakeLock;
      saveSettings();
      const ok = await A.setWakeLock(app.settings.wakeLock);
      if (app.settings.wakeLock && !ok) toast('This browser cannot keep the screen awake.');
      else toast(app.settings.wakeLock ? 'Screen will stay awake while the app is open.' : 'Screen may sleep normally.');
      renderChrome();
    },
    profileEdit: (arg) => { app.editProfileId = arg; window.scrollTo(0, 0); render(true); },
    profileClose: () => { app.editProfileId = null; render(true); },
    profileDup: (arg) => { const src = app.profiles.find((p) => p.id === arg); app.profiles.push(newProfileFrom(src, src.name + ' (copy)')); saveProfiles(); render(true); },
    profileNew: () => { const p = P.blankProfile('New profile ' + (app.profiles.length + 1)); app.profiles.push(p); app.editProfileId = p.id; saveProfiles(); render(true); },
    profileDefault: (arg) => { app.settings.defaultProfileId = arg; saveSettings(); render(true); },
    profileExport: (arg) => { const p = app.profiles.find((x) => x.id === arg); download('casting-profile-' + safeName(p.name) + '.json', { type: 'casting-profile', version: CPT.VERSION, profile: p }); },
    profileDelete: (arg) => openModal({ type: 'confirm', title: 'Delete profile?', text: 'Runs already made from it keep their own copy.', yes: 'Delete', onYes: () => { app.profiles = app.profiles.filter((p) => p.id !== arg); if (app.settings.defaultProfileId === arg) app.settings.defaultProfileId = null; saveProfiles(); saveSettings(); render(true); } }),
    stageMove: (arg) => editProfile((p) => { const [i, d] = arg.split(':').map(Number); const j = i + d; if (j < 0 || j >= p.stages.length) return; const s = p.stages.splice(i, 1)[0]; p.stages.splice(j, 0, s); }),
    stageInsert: (arg) => editProfile((p) => { const i = Number(arg); p.stages.splice(i + 1, 0, P.stage({ id: U.uid('stage'), name: 'New stage', phase: (p.stages[i] || {}).phase || 'burnout', type: 'timed', minutes: 10, provenance: { duration: 'working' } })); }),
    stageDelete: (arg) => openModal({ type: 'confirm', title: 'Delete stage?', text: 'Remove this stage from the profile.', yes: 'Delete', onYes: () => editProfile((p) => { if (p.stages.length > 1) p.stages.splice(Number(arg), 1); }) }),
    eventAdd: (arg) => editProfile((p) => { const s = p.stages[Number(arg)]; s.events = s.events || []; s.events.push({ id: U.uid('ev'), trigger: 'before-end', offsetMinutes: 15, text: 'Reminder' }); }),
    eventDelete: (arg) => editProfile((p) => { const [i, j] = arg.split(':').map(Number); p.stages[i].events.splice(j, 1); }),
  };

  function editProfile(fn) {
    const p = app.profiles.find((x) => x.id === app.editProfileId);
    if (!p) return;
    fn(p);
    p.edited = true;
    saveProfiles();
    render(true);
  }

  // ------------------------------------------------------------- binding

  function scopeTarget(scope) {
    if (scope === 'run') return app.activeRun();
    if (scope === 'settings') return app.settings;
    if (scope.startsWith('hrun:')) return historyRun(scope.slice(5));
    if (scope.startsWith('profile:')) return app.profiles.find((p) => p.id === scope.slice(8));
    return null;
  }

  function readValue(el) {
    const type = el.getAttribute('data-type');
    if (type === 'bool') return el.checked;
    const v = el.value;
    if (type === 'number') return v === '' ? null : U.num(v, null);
    if (type === 'tempC') { const n = v === '' ? null : U.num(v, null); return n == null ? null : U.fromDisplayTemp(n); }
    if (type === 'seconds') return v === '' ? 0 : U.num(v, 0) / 60;
    if (type === 'lines') return v.split('\n').map((x) => x.trim()).filter(Boolean);
    if (type === 'datetime') { if (!v) return null; const t = new Date(v).getTime(); return isNaN(t) ? null : t; }
    return v;
  }

  /** Write one bound input into state. Returns true if something changed. */
  function applyBinding(el) {
    const spec = el.getAttribute('data-bind');
    const bar = spec.indexOf('|');
    const scope = spec.slice(0, bar);
    const path = spec.slice(bar + 1);
    const target = scopeTarget(scope);
    if (!target) return false;
    let value = readValue(el);
    // Phase ids are used as object keys and in bindings: keep them simple.
    if (/(^|\.)phase$/.test(path)) value = String(value).toLowerCase().replace(/[^a-z0-9_]+/g, '_').replace(/^_+|_+$/g, '') || 'phase';
    const now = Date.now();

    if (path.startsWith('coolMode:')) {
      const st = target.profile.stages[Number(path.slice(9))];
      const before = st.type;
      if (value === 'ramp') { st.type = 'ramp'; st.control = 'kiln'; } else { st.type = 'temperature_wait'; st.control = 'user'; }
      if (scope === 'run') E.logEdit(target, 'cool mode', before, st.type, now);
      return true;
    }

    // Values that affect provenance go through the profile helpers.
    const m = path.match(/^(?:profile\.)?stages\.(\d+)\.(minutes|targetC|minMinutes)$/);
    const pm = path.match(/^(?:profile\.)?params\.(\w+)\.value$/);
    const prof = scope === 'run' || scope.startsWith('hrun:') ? target.profile : target;
    const before = U.getPath(target, path);
    if (before === value) return false;
    let note = null;
    if (m) note = P.editStageField(prof.stages[Number(m[1])], m[2], value);
    else if (pm) note = P.editParam(prof.params[pm[1]], value);
    else U.setPath(target, path, value);
    if (note) toast(note);

    if (scope === 'run' && path !== 'name' && !path.startsWith('values.') && !path.startsWith('resultDraft') && !path.startsWith('plan')) {
      E.logEdit(target, path, before, value, now);
    }
    return true;
  }

  function persistScope(el) {
    const scope = el.getAttribute('data-bind').split('|')[0];
    if (scope === 'settings') { saveSettings(); applyTheme(); if (el.getAttribute('data-bind') === 'settings|wakeLock') A.setWakeLock(app.settings.wakeLock); }
    else if (scope.startsWith('profile:')) { const p = scopeTarget(scope); if (p) p.edited = true; saveProfiles(); }
    else save();
  }

  // --------------------------------------------------------------- boot

  function onClick(e) {
    A.unlockAudio();
    if (app.modal && e.target.classList && e.target.classList.contains('modal-backdrop')) { closeModal(); return; }
    const el = e.target.closest('[data-action]');
    if (!el || el.disabled) return;
    if (el.tagName === 'INPUT') return;
    const fn = actions[el.getAttribute('data-action')];
    if (!fn) return;
    e.preventDefault();
    fn(el.getAttribute('data-arg'));
    if (app.modal && app.modal.type === 'plan') renderModal();
  }

  function onChange(e) {
    const el = e.target;
    const act = el.getAttribute && el.getAttribute('data-action-change');
    if (act === 'importFile') return readFile(el, importData);
    if (act === 'importProfile') return readFile(el, (obj) => importData(Object.assign({ type: 'casting-profile' }, obj.profile ? obj : { profile: obj })));
    if (!el.hasAttribute || !el.hasAttribute('data-bind')) return;
    if (applyBinding(el)) {
      persistScope(el);
      if (app.modal && app.modal.type === 'plan') renderModal();
      render(true);
    }
  }

  function onInput(e) {
    const el = e.target;
    if (!el.hasAttribute || !el.hasAttribute('data-bind')) return;
    const t = el.getAttribute('data-type');
    if (t !== 'number' && t !== 'tempC') return;
    // While drafting, live-update calculated readouts (water ml etc.) as you
    // type. Everything else is applied on 'change' so edits are logged once.
    const spec = el.getAttribute('data-bind');
    const run = app.activeRun();
    if (!run || run.status !== 'draft' || !/^run\|(profile\.params\.|values\.)/.test(spec)) return;
    if (applyBinding(el)) { persistScope(el); render(false); }
  }

  function boot() {
    applyBranding();
    applyTheme();
    document.addEventListener('click', onClick);
    document.addEventListener('change', onChange);
    document.addEventListener('input', onInput);
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && app.modal) closeModal(); });
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') markSeen(); else tick(); });
    window.addEventListener('pagehide', markSeen);
    window.addEventListener('storage', (e) => {
      if (!S.isStorageEvent(e)) return;
      app.profiles = S.loadProfiles(); app.runs = S.loadRuns(); app.activeRunId = S.loadActiveRunId(); app.settings = S.loadSettings();
      render(true);
    });
    if (app.settings.wakeLock) A.setWakeLock(true);
    S.requestPersistence().then((p) => { app.persisted = !!p; });

    if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
      navigator.serviceWorker.register('sw.js').catch(() => { /* offline support is optional */ });
    }

    const run = app.activeRun();
    if (!run && app.activeRunId) { app.activeRunId = null; save(); }
    render(true);
    tick();
    setInterval(tick, 1000);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})(globalThis.CPT = globalThis.CPT || {});
