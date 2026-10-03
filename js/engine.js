/* Casting Process Tracker — process engine.
 *
 * A casting run is an append-only event log plus a snapshot of the profile it
 * was started from. Everything the UI shows (current stage, countdowns,
 * projected clock times, run state, metal timing, alerts) is a pure function
 * of (run, now). Timers are therefore timestamp-based and survive the browser
 * being closed or suspended.
 *
 * Stage control:
 *   'kiln' — a segment of the kiln controller's programme. Advances on
 *            schedule; a late tap in the app cannot delay the real kiln.
 *   'user' — something a person does/confirms. Waits for a tap; running late
 *            shifts every later projected time.
 */
(function (CPT) {
  'use strict';

  const U = CPT.util;
  const P = CPT.Profile;
  const MIN = U.MIN;

  const TIMER_TYPES = ['timed', 'ramp', 'hold', 'soak'];
  const ALERT_STALE_MS = 10 * MIN;

  function hasTimer(stage) { return TIMER_TYPES.includes(stage.type); }
  function minutesOf(stage) { return Math.max(0, U.num(stage.minutes, 0)); }

  // ---------------------------------------------------------------- runs

  function newRun(profile, now, name) {
    const snap = U.clone(profile);
    return {
      id: U.uid('run'),
      name: name || 'Casting ' + U.isoDate(now),
      createdAt: now,
      status: 'draft',
      profileId: profile.id,
      profileName: profile.name,
      profile: snap,
      values: { modelName: '', displacementMl: 0, notes: '' },
      plan: null,
      events: [],
      checks: {},
      firedAlerts: {},
      lastSeenAt: now,
      result: null,
    };
  }

  let aidCounter = 0;
  function newAid(prefix) { aidCounter += 1; return (prefix || 'u') + ':' + Date.now().toString(36) + ':' + aidCounter; }

  function push(run, events, by) {
    const aid = newAid(by === 'schedule' ? 'auto' : 'u');
    events.forEach((e) => run.events.push(Object.assign({ aid, by: by || 'user' }, e)));
    refreshStatus(run);
    return aid;
  }

  function refreshStatus(run) {
    const types = new Set(run.events.map((e) => e.type));
    if (types.has('RUN_ABANDON')) run.status = 'abandoned';
    else if (types.has('RUN_COMPLETE')) run.status = 'complete';
    else if (types.has('RUN_START')) run.status = 'active';
    else run.status = 'draft';
  }

  // ------------------------------------------------------------- runtime

  /** Fold the event log into per-stage runtime facts and run-level facts. */
  function runtime(run) {
    const stages = run.profile.stages;
    const idx = {};
    stages.forEach((s, i) => { idx[s.id] = i; });
    const rt = stages.map(() => ({ start: null, end: null, by: null, doneBy: null, ext: 0, pauses: [], pausedAt: null, endOverride: null }));
    const facts = { runStart: null, runEnd: null, metal: { status: 'idle', startedAt: null, readyAt: null }, marks: {}, flaskConfirm: null, edits: [] };

    for (const e of run.events) {
      const r = e.stageId != null && idx[e.stageId] != null ? rt[idx[e.stageId]] : null;
      switch (e.type) {
        case 'RUN_START': facts.runStart = e.t; break;
        case 'RUN_COMPLETE': case 'RUN_ABANDON': facts.runEnd = e.t; break;
        case 'STAGE_START':
          if (r) { r.start = e.t; r.by = e.by; r.end = null; r.ext = 0; r.pauses = []; r.pausedAt = null; r.endOverride = null; }
          break;
        case 'STAGE_DONE': if (r) { if (r.pausedAt != null) { r.pauses.push([r.pausedAt, e.t]); r.pausedAt = null; } r.end = e.t; r.doneBy = e.by; } break;
        case 'STAGE_REOPEN': if (r) { r.end = null; r.doneBy = null; } break;
        case 'STAGE_UNSTART': if (r) { r.start = null; r.end = null; r.ext = 0; r.pauses = []; r.pausedAt = null; r.endOverride = null; } break;
        case 'EXTEND': if (r) r.ext += U.num(e.minutes, 0); break;
        case 'PAUSE': if (r && r.pausedAt == null) r.pausedAt = e.t; break;
        case 'RESUME': if (r && r.pausedAt != null) { r.pauses.push([r.pausedAt, e.t]); r.pausedAt = null; } break;
        case 'SYNC': if (r) { r.endOverride = e.t + U.num(e.remainingMinutes, 0) * MIN; r.ext = 0; } break;
        case 'METAL_START': facts.metal = { status: 'heating', startedAt: e.t, readyAt: null }; break;
        case 'METAL_READY': facts.metal = Object.assign({}, facts.metal, { status: 'ready', readyAt: e.t }); break;
        case 'METAL_RESET': facts.metal = { status: 'idle', startedAt: null, readyAt: null }; break;
        case 'FLASK_CONFIRM': facts.flaskConfirm = { t: e.t, mode: e.mode }; break;
        case 'MARK': facts.marks[e.key] = e.t; break;
        case 'EDIT': facts.edits.push(e); break;
        default: break;
      }
    }
    return { rt, facts, idx };
  }

  function pausedMs(r, now) {
    let ms = r.pauses.reduce((a, p) => a + (p[1] - p[0]), 0);
    if (r.pausedAt != null) ms += now - r.pausedAt;
    return ms;
  }

  /** Scheduled end of a started stage (includes extensions and paused time). */
  function plannedEnd(stage, r, now) {
    if (r.start == null) return null;
    const base = r.endOverride != null ? r.endOverride : r.start + minutesOf(stage) * MIN;
    return base + r.ext * MIN + pausedMs(r, now);
  }

  function currentIndex(run, rtInfo) {
    const { rt } = rtInfo || runtime(run);
    for (let i = 0; i < rt.length; i++) if (rt[i].end == null) return i;
    return rt.length;
  }

  // ------------------------------------------------------------ schedule

  /**
   * Projected timeline for every stage.
   * Row: { i, stage, status: done|active|pending, start, end, estimate,
   *        remaining, elapsed, overdue, paused, doneBy, by, ext }
   * `end` of an active user stage that is overdue is projected as `now`, so
   * later stages slide with the delay.
   */
  function schedule(run, now) {
    const info = runtime(run);
    const { rt, facts } = info;
    const stages = run.profile.stages;
    const cur = currentIndex(run, info);
    const rows = [];
    let cursor = now;

    for (let i = 0; i < stages.length; i++) {
      const s = stages[i];
      const r = rt[i];
      const timer = hasTimer(s);
      const row = { i, stage: s, status: 'pending', start: null, end: null, scheduledEnd: null, estimate: false, remaining: null, elapsed: null, overdue: 0, paused: r.pausedAt != null, doneBy: r.doneBy, by: r.by, ext: r.ext };

      if (r.end != null) {
        row.status = 'done';
        row.start = r.start;
        row.end = r.end;
        row.scheduledEnd = timer ? plannedEnd(s, Object.assign({}, r, { pausedAt: null }), r.end) : null;
        cursor = r.end;
      } else if (r.start != null) {
        row.status = 'active';
        row.start = r.start;
        const end = timer ? plannedEnd(s, r, now) : r.start + minutesOf(s) * MIN;
        row.scheduledEnd = end;
        row.estimate = !timer;
        row.elapsed = now - r.start - pausedMs(r, now);
        row.remaining = end - now;
        row.overdue = timer && now > end ? now - end : 0;
        row.end = s.control === 'kiln' ? end : Math.max(end, now);
        cursor = row.end;
      } else {
        row.start = cursor;
        row.end = cursor + minutesOf(s) * MIN;
        row.scheduledEnd = row.end;
        row.estimate = !timer || s.type === 'temperature_wait';
        cursor = row.end;
      }
      rows.push(row);
    }

    // A draft run with a plan is laid out around its anchor: the chosen stage
    // starts (or ends) at the chosen time and everything else follows.
    const plan = run.status === 'draft' ? planOf(run.profile, run.plan) : null;
    if (plan) {
      const anchor = rows[plan.index];
      const shift = plan.at - (plan.edge === 'end' ? anchor.end : anchor.start);
      rows.forEach((row) => { row.start += shift; row.end += shift; row.scheduledEnd += shift; });
    }

    return { rows, cur, facts, runtime: info, now };
  }

  function castIndex(profile) {
    const i = profile.stages.findIndex((s) => s.role === 'cast');
    return i >= 0 ? i : profile.stages.length - 1;
  }

  /** "Casting time" for planning = the moment the flask soak completes and casting can begin. */
  function planAnchorIndex(profile) {
    const i = profile.stages.findIndex((s) => s.role === 'cast_prep');
    return i >= 0 ? i : castIndex(profile);
  }

  /** The milestone offered first in the planner: the flask's rest/set period, else ready-to-cast. */
  function defaultPlanIndex(profile) {
    const i = profile.stages.findIndex((s) => s.role === 'set');
    return i >= 0 ? i : planAnchorIndex(profile);
  }

  /**
   * Normalise a run's plan: `{ stageId, edge: 'start'|'end', at, locked }`.
   * Any stage can be the anchor. Plans saved by older versions
   * (`{ castAt }`) anchor on the start of the "ready to cast" stage.
   * Returns null if there is no usable plan; otherwise adds `index`.
   */
  function planOf(profile, plan) {
    if (!plan) return null;
    let stageId = plan.stageId;
    let edge = plan.edge === 'end' ? 'end' : 'start';
    let at = plan.at;
    if (at == null && plan.castAt != null) { at = plan.castAt; stageId = null; edge = 'start'; }
    if (at == null || !isFinite(at)) return null;
    let index = stageId ? profile.stages.findIndex((s) => s.id === stageId) : -1;
    if (index < 0) {
      // Legacy plans anchor on "ready to cast"; a new plan with no stage chosen yet on the rest.
      index = plan.castAt != null ? planAnchorIndex(profile) : defaultPlanIndex(profile);
      if (plan.castAt != null) edge = 'start';
    }
    if (index < 0) return null;
    return { stageId: profile.stages[index].id, edge, at, index, locked: !!plan.locked };
  }

  function indexOfRole(profile, role) { return profile.stages.findIndex((s) => s.role === role); }

  // -------------------------------------------------------------- actions

  function startRun(run, now) {
    if (run.status !== 'draft') return;
    const first = run.profile.stages[0];
    push(run, [{ type: 'RUN_START', t: now }, { type: 'STAGE_START', t: now, stageId: first.id }]);
  }

  /** Complete the current stage (at `at`, default now) and start the next. */
  function completeCurrent(run, now, opts) {
    opts = opts || {};
    const at = opts.at != null ? opts.at : now;
    const cur = currentIndex(run);
    const stages = run.profile.stages;
    if (cur >= stages.length) return;
    const evs = [{ type: 'STAGE_DONE', t: at, stageId: stages[cur].id, note: opts.note }];
    if (opts.extra) evs.push.apply(evs, opts.extra.map((e) => Object.assign({ t: at }, e)));
    if (cur + 1 < stages.length) evs.push({ type: 'STAGE_START', t: at, stageId: stages[cur + 1].id });
    push(run, evs, opts.by);
  }

  /**
   * Escape hatches. These work on any stage, regardless of the gating that
   * normal buttons enforce (soak minimum, metal confirmation, cooling timer),
   * so the user can never be stuck behind a timer. Each is one undoable group.
   */

  /** Restart the current stage's timer from `now` (clears extensions, pauses and kiln syncs). */
  function restartCurrent(run, now) {
    const cur = currentIndex(run);
    const stages = run.profile.stages;
    if (cur >= stages.length) return false;
    push(run, [{ type: 'STAGE_START', t: now, stageId: stages[cur].id, label: 'Reset timer on “' + stages[cur].name + '”' }]);
    return true;
  }

  /** Move on to the next stage right now, whatever state the current one is in. */
  function skipCurrent(run, now) {
    if (currentIndex(run) >= run.profile.stages.length) return false;
    completeCurrent(run, now);
    return true;
  }

  /** Step back to the previous stage and restart it from `now`. From the very end, reopens the last stage. */
  function backOne(run, now) {
    const stages = run.profile.stages;
    const cur = currentIndex(run);
    const target = cur >= stages.length ? stages.length - 1 : cur - 1;
    if (target < 0) return false;
    const evs = [];
    if (cur < stages.length) evs.push({ type: 'STAGE_UNSTART', t: now, stageId: stages[cur].id });
    evs.push({ type: 'STAGE_REOPEN', t: now, stageId: stages[target].id, label: 'Back to “' + stages[target].name + '”' });
    evs.push({ type: 'STAGE_START', t: now, stageId: stages[target].id });
    push(run, evs);
    return true;
  }

  function extend(run, stageId, minutes, now) {
    if (!minutes) return;
    push(run, [{ type: 'EXTEND', t: now, stageId, minutes: Number(minutes) }]);
  }

  function pause(run, stageId, now) { push(run, [{ type: 'PAUSE', t: now, stageId }]); }
  function resume(run, stageId, now) { push(run, [{ type: 'RESUME', t: now, stageId }]); }

  /**
   * Tell the app where the kiln programme actually is: stage `targetIndex`
   * with `remainingMinutes` left. Works forwards (kiln ahead) and backwards
   * (kiln behind the app's schedule).
   */
  function kilnSync(run, targetIndex, remainingMinutes, now) {
    const stages = run.profile.stages;
    const cur = currentIndex(run);
    const evs = [];
    if (targetIndex > cur) {
      for (let i = cur; i < targetIndex; i++) {
        evs.push({ type: 'STAGE_DONE', t: now, stageId: stages[i].id });
        evs.push({ type: 'STAGE_START', t: now, stageId: stages[i + 1].id });
      }
    } else if (targetIndex < cur) {
      for (let i = Math.min(cur, stages.length - 1); i > targetIndex; i--) evs.push({ type: 'STAGE_UNSTART', t: now, stageId: stages[i].id });
      evs.push({ type: 'STAGE_REOPEN', t: now, stageId: stages[targetIndex].id });
    }
    evs.push({ type: 'SYNC', t: now, stageId: stages[targetIndex].id, remainingMinutes: Number(remainingMinutes) });
    push(run, evs, 'sync');
  }

  /**
   * Advance kiln-programme stages whose scheduled time has passed. Returns
   * the ids of stages completed on schedule (may be several after the app
   * was closed). Never advances a user-controlled stage.
   */
  function advance(run, now) {
    const advanced = [];
    if (run.status !== 'active') return advanced;
    const stages = run.profile.stages;
    for (let guard = 0; guard < stages.length; guard++) {
      const info = runtime(run);
      const cur = currentIndex(run, info);
      if (cur >= stages.length) break;
      const s = stages[cur];
      const r = info.rt[cur];
      if (s.control !== 'kiln' || !hasTimer(s) || r.start == null || r.pausedAt != null) break;
      const end = plannedEnd(s, r, now);
      if (now < end) break;
      const evs = [{ type: 'STAGE_DONE', t: end, stageId: s.id }];
      if (cur + 1 < stages.length) evs.push({ type: 'STAGE_START', t: end, stageId: stages[cur + 1].id });
      push(run, evs, 'schedule');
      advanced.push(s.id);
    }
    return advanced;
  }

  function metalStart(run, now) { push(run, [{ type: 'METAL_START', t: now }]); }
  function metalReady(run, now) { push(run, [{ type: 'METAL_READY', t: now }]); }
  function metalReset(run, now) { push(run, [{ type: 'METAL_RESET', t: now }]); }

  /**
   * Confirm the flask is at casting temperature when the soak was started by
   * schedule (scheduled cool-down ramp). mode 'scheduled' accepts the
   * scheduled start; mode 'now' restarts the soak from now (conservative).
   */
  function confirmFlask(run, mode, now) {
    const soak = run.profile.stages[indexOfRole(run.profile, 'soak')];
    const evs = [{ type: 'FLASK_CONFIRM', t: now, mode }];
    if (mode === 'now' && soak) evs.push({ type: 'STAGE_START', t: now, stageId: soak.id });
    push(run, evs);
  }

  const CAST_STEPS = ['flask_removed', 'flask_seated', 'vacuum_on', 'pour_started'];

  /** Record a casting-sequence moment. Some marks also move the stage on. */
  function mark(run, key, now) {
    const cur = currentIndex(run);
    const s = run.profile.stages[cur];
    const markEv = { type: 'MARK', key };
    if (key === 'pour_started' && s && s.type === 'cast_sequence') {
      completeCurrent(run, now, { extra: [markEv] });
    } else if (key === 'vacuum_off' && s && s.role === 'post_pour_vacuum') {
      completeCurrent(run, now, { extra: [markEv] });
    } else if (key === 'quench' && s && s.role === 'cooling') {
      completeCurrent(run, now, { extra: [markEv] });
    } else {
      push(run, [Object.assign({ t: now }, markEv)]);
    }
  }

  function logEdit(run, path, from, to, now) {
    if (run.status === 'draft') return;
    push(run, [{ type: 'EDIT', t: now, path, from, to }], 'edit');
  }

  function completeRun(run, result, now) {
    run.result = Object.assign({ recordedAt: now }, result);
    const cur = currentIndex(run);
    const evs = [];
    if (cur < run.profile.stages.length) evs.push({ type: 'STAGE_DONE', t: now, stageId: run.profile.stages[cur].id });
    evs.push({ type: 'RUN_COMPLETE', t: now });
    push(run, evs);
  }

  function abandonRun(run, now) { push(run, [{ type: 'RUN_ABANDON', t: now }]); }

  /** The most recent user action group, if it can be undone. */
  function undoable(run) {
    if (!run.events.length) return null;
    const last = run.events[run.events.length - 1];
    if (last.by === 'schedule' || last.by === 'edit') return null;
    const group = run.events.filter((e) => e.aid === last.aid);
    if (group.some((e) => e.type === 'RUN_START' || e.type === 'RUN_COMPLETE')) return null;
    return { aid: last.aid, events: group, label: describe(run, group) };
  }

  function undo(run) {
    const u = undoable(run);
    if (!u) return false;
    run.events = run.events.filter((e) => e.aid !== u.aid);
    refreshStatus(run);
    return true;
  }

  function stageName(run, id) {
    const s = run.profile.stages.find((x) => x.id === id);
    return s ? s.name : id;
  }

  const MARK_LABELS = {
    flask_removed: 'Flask removed', flask_seated: 'Flask seated', vacuum_on: 'Vacuum on', pour_started: 'Pour started',
    vacuum_off: 'Vacuum off', quench: 'Quenched',
  };

  function describe(run, group) {
    const labelled = group.find((x) => x.label);
    if (labelled) return labelled.label;
    const e = group.find((x) => x.type === 'MARK') || group.find((x) => x.type !== 'STAGE_START') || group[0];
    switch (e.type) {
      case 'STAGE_DONE': return 'Complete “' + stageName(run, e.stageId) + '”';
      case 'EXTEND': return (e.minutes > 0 ? '+' : '') + e.minutes + ' min on “' + stageName(run, e.stageId) + '”';
      case 'PAUSE': return 'Pause tracking';
      case 'RESUME': return 'Resume tracking';
      case 'METAL_START': return 'Start metal melt';
      case 'METAL_READY': return 'Metal at pour temperature';
      case 'METAL_RESET': return 'Reset metal';
      case 'FLASK_CONFIRM': return 'Flask at target temperature';
      case 'MARK': return MARK_LABELS[e.key] || e.key;
      case 'SYNC': case 'STAGE_UNSTART': case 'STAGE_REOPEN': return 'Kiln re-sync';
      case 'STAGE_START': return 'Start “' + stageName(run, e.stageId) + '”';
      default: return e.type;
    }
  }

  // ------------------------------------------------------ derived status

  function flaskInfo(run, sched, now) {
    const i = indexOfRole(run.profile, 'soak');
    if (i < 0) return { index: -1 };
    const row = sched.rows[i];
    const s = row.stage;
    const active = row.status === 'active';
    const readyAt = row.scheduledEnd;
    const needsConfirm = active && row.by === 'schedule' && !sched.facts.flaskConfirm;
    return {
      index: i, row, active, done: row.status === 'done',
      targetC: P.targetOf(run.profile, i),
      start: row.start, readyAt,
      minMinutes: s.minMinutes,
      belowMinimum: s.minMinutes != null && minutesOf(s) < U.num(s.minMinutes, 0),
      ready: active && now >= readyAt && !needsConfirm,
      timeReached: active && now >= readyAt,
      needsConfirm,
      elapsed: active ? now - row.start : null,
      remaining: active ? readyAt - now : null,
    };
  }

  function metalInfo(run, sched, now) {
    const prof = run.profile;
    const heat = U.num(P.param(prof, 'metalHeatMinutes'), 0);
    const offset = U.num(P.param(prof, 'metalReadyOffsetMinutes'), 0);
    const m = sched.facts.metal;
    const si = indexOfRole(prof, 'soak');
    const soakRow = si >= 0 ? sched.rows[si] : null;
    const soakReadyAt = soakRow ? (soakRow.status === 'active' ? soakRow.scheduledEnd : soakRow.end) : null;
    const targetReadyAt = soakReadyAt != null ? soakReadyAt + offset * MIN : null;
    const recommendedStart = targetReadyAt != null ? targetReadyAt - heat * MIN : null;
    const expectedReadyAt = m.startedAt != null ? m.startedAt + heat * MIN : null;
    const coolIdx = indexOfRole(prof, 'cool_to_cast');
    const castIdx = castIndex(prof);
    const cur = sched.cur;
    const poured = sched.facts.marks.pour_started != null;
    const relevant = run.status === 'active' && !poured && cur <= castIdx && (
      m.status !== 'idle' || (coolIdx >= 0 && cur >= coolIdx) || (recommendedStart != null && now >= recommendedStart - 60 * MIN)
    );
    // Before the soak has started its timing depends on an estimated cool-down.
    const estimated = soakRow ? soakRow.status === 'pending' : true;
    return {
      status: m.status, startedAt: m.startedAt, readyAt: m.readyAt,
      heatMinutes: heat, offsetMinutes: offset,
      soakReadyAt, targetReadyAt, recommendedStart, expectedReadyAt,
      startIn: recommendedStart != null ? recommendedStart - now : null,
      relevant, estimated, poured,
      targetC: P.param(prof, 'metalTargetC'),
      name: prof.materials.metal,
    };
  }

  /** Spec §49 run states. */
  function runState(run, sched, now) {
    if (run.status === 'draft') return 'DRAFT';
    if (run.status === 'complete') return 'COMPLETE';
    if (run.status === 'abandoned') return 'ABANDONED';
    const s = run.profile.stages[sched.cur];
    if (!s) return 'COMPLETE';
    switch (s.phase) {
      case 'prepare': return 'PREPARING';
      case 'invest': return 'INVESTING';
      case 'set': return 'SETTING';
      case 'burnout_prep': case 'burnout': return 'BURNOUT';
      case 'casting_temp': return sched.facts.metal.status === 'heating' ? 'METAL_PREP' : 'CASTING_TEMP';
      case 'soak': {
        const f = flaskInfo(run, sched, now);
        if (f.ready && sched.facts.metal.status === 'ready') return 'READY_TO_CAST';
        if (sched.facts.metal.status === 'heating') return 'METAL_PREP';
        return 'CASTING_TEMP';
      }
      case 'cast': return s.type === 'cast_prep' ? 'READY_TO_CAST' : 'CASTING';
      case 'cooling': return s.type === 'finish' ? 'QUENCHED' : 'COOLING';
      default: return 'ACTIVE';
    }
  }

  // --------------------------------------------------- stage interventions

  /** Scheduled actions inside stages (spec §48), e.g. "15 min before end". */
  function stageEvents(run, sched) {
    const out = [];
    sched.rows.forEach((row) => {
      if (row.status === 'done') return;
      (row.stage.events || []).forEach((ev) => {
        const off = U.num(ev.offsetMinutes, 0) * MIN;
        const at = ev.trigger === 'after-start' ? row.start + off : row.scheduledEnd - off;
        out.push({ key: 'ev:' + row.stage.id + ':' + ev.id, at, text: ev.text, stageId: row.stage.id, estimate: row.status === 'pending' });
      });
    });
    return out.sort((a, b) => a.at - b.at);
  }

  // ---------------------------------------------------------------- alerts

  const ALERT_PREFS = {
    stageEnd: 'Stage complete (burnout, set, mixing)',
    stageEvents: 'In-stage reminders',
    metal15: 'Start brass furnace in 15 minutes',
    metalNow: 'Start brass furnace now',
    metalReady: 'Expected metal readiness',
    soakComplete: 'Flask soak complete',
    readyToCast: 'Ready to cast',
    vacuumComplete: 'Post-pour vacuum complete',
    coolingComplete: 'Initial cooling interval complete',
  };

  function stageEndText(run, row) {
    const s = row.stage;
    if (s.alertText) return s.alertText;
    const t = P.targetOf(run.profile, row.i);
    if (s.type === 'ramp') return 'Ramp to ' + t + '°C should now be complete (scheduled — not measured).';
    if (s.type === 'hold') return t + '°C hold complete (scheduled).';
    return s.name + ' — time is up.';
  }

  /** All alert moments for the run, fired or not. */
  function alertCandidates(run, sched, now) {
    const out = [];
    if (run.status !== 'active') return out;
    const prefFor = (s) => (s.role === 'soak' ? 'soakComplete' : s.role === 'post_pour_vacuum' ? 'vacuumComplete' : s.role === 'cooling' ? 'coolingComplete' : 'stageEnd');

    sched.rows.forEach((row) => {
      const s = row.stage;
      if (!hasTimer(s)) return;
      const endedBySchedule = row.status === 'done' && row.doneBy === 'schedule';
      if (row.status === 'active' || endedBySchedule) {
        const at = row.scheduledEnd;
        const title = s.role === 'soak' ? 'Flask soak complete' : stageEndText(run, row);
        out.push({ key: 'end:' + s.id, at, pref: prefFor(s), title, body: s.role === 'soak' ? 'Minimum casting-temperature soak reached.' : '' });
      }
    });

    stageEvents(run, sched).forEach((ev) => {
      if (ev.estimate) return;
      out.push({ key: ev.key, at: ev.at, pref: 'stageEvents', title: ev.text, body: stageName(run, ev.stageId) });
    });

    const metal = metalInfo(run, sched, now);
    if (!metal.poured) {
      if (metal.status === 'idle' && metal.recommendedStart != null) {
        out.push({ key: 'metal15', at: metal.recommendedStart - 15 * MIN, pref: 'metal15', title: 'Start ' + metal.name + ' furnace in 15 minutes', body: 'Estimated heat-up ' + U.dur(metal.heatMinutes) + '.' });
        out.push({ key: 'metalNow', at: metal.recommendedStart, pref: 'metalNow', title: 'Start ' + metal.name + ' furnace now', body: 'So the metal is ready as the flask soak completes.' });
      }
      if (metal.status === 'heating' && metal.expectedReadyAt != null) {
        out.push({ key: 'metalReady:' + metal.startedAt, at: metal.expectedReadyAt, pref: 'metalReady', title: 'Expected metal readiness', body: 'Check the metal temperature, then confirm in the app.' });
      }
      const flask = flaskInfo(run, sched, now);
      if (flask.ready && metal.status === 'ready') {
        out.push({ key: 'readyToCast', at: Math.max(flask.readyAt, metal.readyAt), pref: 'readyToCast', title: 'Ready to cast', body: 'Flask soak complete and metal confirmed.' });
      }
    }
    return out;
  }

  /**
   * Alerts that should fire now. Returns { fire: [...], stale: [...] }.
   * Stale ones (missed by more than 10 min, e.g. app was closed) should be
   * marked as fired without notifying — the reopen screen covers them.
   */
  function dueAlerts(run, sched, now) {
    const fire = [];
    const stale = [];
    alertCandidates(run, sched, now).forEach((a) => {
      if (a.at == null || now < a.at) return;
      const fired = run.firedAlerts[a.key];
      if (fired != null && fired >= a.at) return;
      (now - a.at > ALERT_STALE_MS ? stale : fire).push(a);
    });
    return { fire, stale };
  }

  function markAlerts(run, alerts) { alerts.forEach((a) => { run.firedAlerts[a.key] = a.at; }); }

  // ------------------------------------------------------- reopen / attention

  /**
   * After the app has been closed/suspended since `since`, describe what
   * needs the user's attention: kiln stages that advanced on schedule, and a
   * user stage that ran past its scheduled end.
   */
  function attention(run, sched, since, now) {
    if (run.status !== 'active') return null;
    const advanced = sched.rows.filter((r) => r.status === 'done' && r.doneBy === 'schedule' && r.end > since && r.end <= now);
    const cur = sched.rows[sched.cur];
    // Only plain timed steps get the "is it finished?" prompt. The soak,
    // post-pour vacuum and cooling have their own gated completion actions.
    const overdueUser = cur && cur.status === 'active' && cur.stage.control !== 'kiln' && cur.stage.type === 'timed' &&
      !['post_pour_vacuum', 'cooling'].includes(cur.stage.role) && cur.overdue > 0 && cur.scheduledEnd > since - 1
      ? cur : null;
    if (!advanced.length && !overdueUser) return null;
    return { advanced, current: cur, overdueUser, since };
  }

  // ------------------------------------------------------------ planning

  /**
   * Plan a draft run around any milestone (spec §30): `anchor` is
   * `{ stageId, edge: 'start'|'end', at }`. Every other stage is laid out
   * before and after it using the current durations.
   * Returns the planned rows plus key clock times, and the earliest time the
   * anchor could happen if the run started now (`tooLate` when `at` is sooner).
   */
  function planAround(profile, values, anchor, now) {
    const draft = newRun(profile, now);
    draft.values = Object.assign(draft.values, values || {});
    const plan = planOf(profile, anchor);
    const forward = schedule(draft, now);
    const fRow = forward.rows[plan.index];
    const earliest = plan.edge === 'end' ? fRow.end : fRow.start;
    draft.plan = { stageId: plan.stageId, edge: plan.edge, at: plan.at };
    const planned = schedule(draft, now);
    const rowByRole = (role) => planned.rows.find((r) => r.stage.role === role);
    const metal = metalInfo(draft, planned, now);
    const kiln = rowByRole('kiln_start');
    const soak = rowByRole('soak');
    const castRow = planned.rows[planAnchorIndex(profile)];
    return {
      rows: planned.rows,
      anchor: plan,
      at: plan.at,
      castAt: castRow.start,
      earliest,
      tooLate: plan.at < earliest,
      startAt: planned.rows[0].start,
      investAt: (rowByRole('measure') || planned.rows[0]).start,
      kilnStartAt: kiln ? kiln.end : null,
      soakStartAt: soak ? soak.start : null,
      flaskReadyAt: soak ? soak.end : null,
      metalStartAt: metal.recommendedStart,
    };
  }

  /** Plan backwards from a desired casting time (the "ready to cast" stage). */
  function planFromCastTime(profile, values, castAt, now) {
    return planAround(profile, values, { stageId: profile.stages[planAnchorIndex(profile)].id, edge: 'start', at: castAt }, now);
  }

  // -------------------------------------------------------------- history

  function waterMl(profile) {
    return U.round(U.num(P.param(profile, 'powderG'), 0) * U.num(P.param(profile, 'waterRatioPct'), 0) / 100, 1);
  }

  function calculator(profile, displacementMl) {
    const d = U.num(P.param(profile, 'flaskDiameterMm'), 0) / 10;
    const h = U.num(P.param(profile, 'flaskHeightMm'), 0) / 10;
    const vol = Math.PI * (d / 2) * (d / 2) * h;
    const net = Math.max(0, vol - U.num(displacementMl, 0));
    const factor = U.num(P.param(profile, 'powderPerCm3'), 0);
    const ratio = U.num(P.param(profile, 'waterRatioPct'), 0);
    const estPowder = net * factor;
    return {
      flaskVolumeCm3: U.round(vol, 0),
      netVolumeCm3: U.round(net, 0),
      estimatedPowderG: U.round(estPowder, 0),
      estimatedWaterMl: U.round(estPowder * ratio / 100, 0),
      powderG: U.num(P.param(profile, 'powderG'), 0),
      waterMl: waterMl(profile),
    };
  }

  /** Per-stage planned vs actual for the history view. */
  function deviations(run) {
    const sched = schedule(run, Date.now());
    return sched.rows.filter((r) => r.status === 'done').map((r) => {
      const actualMin = (r.end - r.start) / MIN;
      const plannedMin = minutesOf(r.stage);
      return {
        stage: r.stage, start: r.start, end: r.end, actualMin, plannedMin,
        deltaMin: hasTimer(r.stage) ? actualMin - plannedMin : null,
        ext: r.ext, doneBy: r.doneBy,
      };
    });
  }

  /** Flat record for comparison table & export (spec §22). */
  function record(run) {
    const sum = P.summary(run.profile);
    const info = runtime(run);
    return Object.assign({
      runId: run.id,
      runName: run.name,
      date: U.isoDate(info.facts.runStart || run.createdAt),
      status: run.status,
      profile: run.profileName,
      model: run.values.modelName,
      flaskDiameterMm: P.param(run.profile, 'flaskDiameterMm'),
      flaskHeightMm: P.param(run.profile, 'flaskHeightMm'),
      powderG: P.param(run.profile, 'powderG'),
      waterMl: waterMl(run.profile),
      metalWeightG: P.param(run.profile, 'metalWeightG'),
      rating: run.result ? run.result.rating : null,
      defects: run.result ? run.result.defects : [],
      flaskOutToPourSeconds: info.facts.marks.flask_removed && info.facts.marks.pour_started
        ? Math.round((info.facts.marks.pour_started - info.facts.marks.flask_removed) / 1000) : null,
    }, sum);
  }

  // ------------------------------------------------------------ calendar

  function icsDate(t) {
    const d = new Date(t);
    return d.getUTCFullYear() + U.pad(d.getUTCMonth() + 1) + U.pad(d.getUTCDate()) + 'T' + U.pad(d.getUTCHours()) + U.pad(d.getUTCMinutes()) + U.pad(d.getUTCSeconds()) + 'Z';
  }

  function icsText(s) { return String(s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n'); }

  /**
   * Calendar file with an alarm at every upcoming intervention, so the phone's
   * calendar can wake you during an overnight burnout (a suspended web page
   * cannot).
   */
  function calendar(run, now) {
    const sched = schedule(run, now);
    const items = [];
    sched.rows.forEach((row) => {
      if (row.status === 'done' || row.end < now) return;
      const s = row.stage;
      const est = row.estimate || row.status === 'pending' ? ' (estimated)' : '';
      if (hasTimer(s) || s.type === 'temperature_wait') {
        items.push({ at: row.status === 'active' ? row.scheduledEnd : row.end, title: 'End: ' + s.name + est, desc: stageEndText(run, row) });
      }
      if (row.status === 'pending' && (s.control === 'user' || s.role === 'kiln_start')) {
        items.push({ at: row.start, title: 'Next: ' + s.name + est, desc: s.doNow || s.name });
      }
    });
    stageEvents(run, sched).forEach((ev) => { if (ev.at > now) items.push({ at: ev.at, title: ev.text, desc: stageName(run, ev.stageId) }); });
    const metal = metalInfo(run, sched, now);
    if (metal.status === 'idle' && metal.recommendedStart != null && metal.recommendedStart > now) {
      items.push({ at: metal.recommendedStart, title: 'START ' + metal.name.toUpperCase() + ' FURNACE' + (metal.estimated ? ' (estimated)' : ''), desc: 'Estimated heat-up ' + U.dur(metal.heatMinutes) + '. Target ' + metal.targetC + '°C.' });
    }
    items.sort((a, b) => a.at - b.at);

    const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Lost Resin Casting Buddy//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH'];
    items.forEach((it, n) => {
      lines.push('BEGIN:VEVENT',
        'UID:' + run.id + '-' + n + '-' + it.at + '@casting-buddy',
        'DTSTAMP:' + icsDate(now),
        'DTSTART:' + icsDate(it.at),
        'DTEND:' + icsDate(it.at + 5 * MIN),
        'SUMMARY:' + icsText('🔥 ' + it.title),
        'DESCRIPTION:' + icsText(run.name + ' — ' + it.desc + '\nTimes are from the app schedule and are not measured temperatures.'),
        'BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:' + icsText(it.title), 'TRIGGER:PT0M', 'END:VALARM',
        'END:VEVENT');
    });
    lines.push('END:VCALENDAR');
    return { text: lines.join('\r\n'), count: items.length };
  }

  CPT.Engine = {
    TIMER_TYPES, CAST_STEPS, MARK_LABELS, ALERT_PREFS, ALERT_STALE_MS,
    hasTimer, minutesOf, newRun, runtime, plannedEnd, currentIndex, schedule, castIndex, planAnchorIndex, defaultPlanIndex, planOf, indexOfRole,
    startRun, completeCurrent, restartCurrent, skipCurrent, backOne, extend, pause, resume, kilnSync, advance, metalStart, metalReady, metalReset,
    confirmFlask, mark, logEdit, completeRun, abandonRun, undoable, undo, refreshStatus,
    flaskInfo, metalInfo, runState, stageEvents, alertCandidates, dueAlerts, markAlerts, attention, stageEndText,
    planAround, planFromCastTime, waterMl, calculator, deviations, record, calendar,
  };
})(globalThis.CPT = globalThis.CPT || {});
