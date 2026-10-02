/* Run with: node --test tests/ */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');

require('../js/util.js');
require('../js/profile.js');
require('../profiles/protocast-trueblue-cz121.js');
require('../js/engine.js');

const { Engine: E, Profile: P, util: U } = globalThis.CPT;
const MIN = 60000;
const INITIAL = 'protocast-trueblue-cz121-initial';
const FAST = 'protocast-trueblue-cz121-fast5h';
const T0 = Date.UTC(2026, 8, 27, 8, 0, 0);

function idx(run, id) { return run.profile.stages.findIndex((s) => s.id === id); }
function cur(run) { return run.profile.stages[E.currentIndex(run)]; }

/** Tap through user stages until the named stage is current. */
function advanceTo(run, id, t) {
  let guard = 0;
  while (cur(run).id !== id && guard++ < 50) {
    E.completeCurrent(run, t);
    E.advance(run, t);
  }
  assert.equal(cur(run).id, id);
}

function started() {
  const run = E.newRun(P.builtIn(INITIAL), T0);
  E.startRun(run, T0);
  return run;
}

test('default profile carries the spec values (nothing hard-coded in engine)', () => {
  const p = P.builtIn(INITIAL);
  const s = P.summary(p);
  assert.equal(s.flaskCastingTempC, 525);
  assert.equal(s.metalPourTempC, 975);
  assert.equal(s.peakC, 750);
  assert.equal(s.peakHoldMinutes, 240);
  assert.equal(s.setMinutes, 120);
  assert.equal(s.soakMinutes, 60);
  assert.equal(s.postPourVacuumSeconds, 60);
  assert.equal(s.initialCoolingMinutes, 15);
  const mixing = p.stages.filter((x) => x.phase === 'invest' && x.type === 'timed').reduce((a, x) => a + x.minutes, 0);
  assert.equal(mixing, 8, 'Protocast conventional mixing totals 8 minutes');
  const burnout = p.stages.filter((x) => x.phase === 'burnout').reduce((a, x) => a + x.minutes, 0);
  assert.equal(burnout, 90 + 180 + 120 + 120 + 180 + 240);
});

test('water is calculated from powder and ratio', () => {
  const p = P.builtIn(INITIAL);
  assert.equal(E.waterMl(p), 260);
  p.params.powderG.value = 800;
  assert.equal(E.waterMl(p), 320);
  const c = E.calculator(P.builtIn(INITIAL), 0);
  assert.equal(c.flaskVolumeCm3, 463);
});

test('ramp start temperatures and hold targets are derived', () => {
  const p = P.builtIn(INITIAL);
  const i = p.stages.findIndex((s) => s.id === 'burnout_ramp_2');
  assert.equal(P.startTempOf(p, i), 220);
  assert.equal(P.targetOf(p, i), 450);
  const soak = p.stages.findIndex((s) => s.role === 'soak');
  assert.equal(P.targetOf(p, soak), 525);
  assert.equal(P.startTempOf(p, 0), 20);
});

test('a late tap on a user stage shifts every later projected time', () => {
  const run = started();
  advanceTo(run, 'set', T0);
  const set = idx(run, 'set');
  const before = E.schedule(run, T0).rows[set + 3].start;
  // Set is 120 min; user taps 17 minutes late.
  const late = T0 + 137 * MIN;
  const s = E.schedule(run, late);
  assert.equal(s.rows[set].overdue, 17 * MIN);
  assert.equal(s.rows[set + 3].start - before, 17 * MIN);
  E.completeCurrent(run, late);
  const after = E.schedule(run, late);
  assert.equal(after.rows[set + 3].start - before, 17 * MIN);
});

test('kiln programme stages advance on schedule and do not drift', () => {
  const run = started();
  advanceTo(run, 'burnout_prep', T0);
  E.completeCurrent(run, T0); // flask in kiln at T0
  const ramp1 = idx(run, 'burnout_ramp_1');
  assert.equal(cur(run).id, 'burnout_ramp_1');
  // Phone asleep for 5 hours: ramp (90) + hold (180) = 270 min passed.
  const t = T0 + 300 * MIN;
  const advanced = E.advance(run, t);
  assert.deepEqual(advanced, ['burnout_ramp_1', 'burnout_hold_1']);
  assert.equal(cur(run).id, 'burnout_ramp_2');
  const s = E.schedule(run, t);
  assert.equal(s.rows[ramp1 + 1].end, T0 + 270 * MIN, 'hold ended at its scheduled time, not when the app reopened');
  assert.equal(s.rows[ramp1 + 2].start, T0 + 270 * MIN);
  assert.equal(s.rows[ramp1 + 2].remaining, 90 * MIN);
});

test('user stages are never auto-advanced', () => {
  const run = started();
  advanceTo(run, 'set', T0);
  assert.deepEqual(E.advance(run, T0 + 1000 * MIN), []);
  assert.equal(cur(run).id, 'set');
});

test('extending a stage shifts downstream; the whole burnout chain follows', () => {
  const run = started();
  advanceTo(run, 'burnout_prep', T0);
  E.completeCurrent(run, T0);
  const peak = idx(run, 'burnout_peak');
  const before = E.schedule(run, T0).rows[peak].end;
  E.extend(run, 'burnout_ramp_1', 30, T0 + MIN);
  const after = E.schedule(run, T0 + MIN).rows[peak].end;
  assert.equal(after - before, 30 * MIN);
});

test('pause tracking holds the countdown of a user timed stage', () => {
  const run = started();
  advanceTo(run, 'set', T0);
  const set = idx(run, 'set');
  E.pause(run, 'set', T0 + 10 * MIN);
  const s = E.schedule(run, T0 + 40 * MIN);
  assert.equal(s.rows[set].remaining, 110 * MIN);
  E.resume(run, 'set', T0 + 40 * MIN);
  assert.equal(E.schedule(run, T0 + 50 * MIN).rows[set].remaining, 100 * MIN);
});

test('brass furnace start is timed so metal is ready as the soak completes', () => {
  const run = started();
  advanceTo(run, 'cool_to_cast', T0);
  E.completeCurrent(run, T0); // kiln at 525 → soak starts, 60 min
  let s = E.schedule(run, T0);
  let m = E.metalInfo(run, s, T0);
  assert.equal(m.soakReadyAt, T0 + 60 * MIN);
  assert.equal(m.recommendedStart, T0, 'heat-up 60 min, soak 60 min → start now');
  assert.ok(m.relevant);

  run.profile.params.metalHeatMinutes.value = 45;
  s = E.schedule(run, T0);
  m = E.metalInfo(run, s, T0);
  assert.equal(m.startIn, 15 * MIN, 'start brass furnace in 15 minutes');

  assert.ok(E.dueAlerts(run, s, T0).fire.some((a) => a.key === 'metal15'));
  const due = E.dueAlerts(run, s, T0 + 15 * MIN);
  assert.ok(due.fire.some((a) => a.key === 'metalNow'));
  assert.ok(due.stale.some((a) => a.key === 'metal15'), 'missed by >10 min → stale, not notified');
});

test('ready to cast needs both flask soak and a manual metal confirmation', () => {
  const run = started();
  advanceTo(run, 'cool_to_cast', T0);
  E.completeCurrent(run, T0);
  E.metalStart(run, T0);
  let t = T0 + 61 * MIN;
  let s = E.schedule(run, t);
  assert.equal(E.flaskInfo(run, s, t).ready, true);
  assert.notEqual(E.runState(run, s, t), 'READY_TO_CAST', 'estimated metal readiness is not readiness');
  E.metalReady(run, t);
  s = E.schedule(run, t);
  assert.equal(E.runState(run, s, t), 'READY_TO_CAST');
});

test('scheduled cool-down ramp requires a flask temperature confirmation', () => {
  const run = started();
  const p = run.profile;
  const cool = p.stages.find((x) => x.role === 'cool_to_cast');
  cool.type = 'ramp';
  cool.control = 'kiln';
  advanceTo(run, 'burnout_prep', T0);
  E.completeCurrent(run, T0);
  const total = p.stages.filter((x) => x.control === 'kiln').reduce((a, x) => a + x.minutes, 0);
  const t = T0 + (total + 70) * MIN;
  E.advance(run, t);
  assert.equal(cur(run).role, 'soak');
  let s = E.schedule(run, t);
  const f = E.flaskInfo(run, s, t);
  assert.equal(f.timeReached, true);
  assert.equal(f.needsConfirm, true);
  assert.equal(f.ready, false);
  E.confirmFlask(run, 'now', t);
  s = E.schedule(run, t);
  assert.equal(E.flaskInfo(run, s, t).remaining, 60 * MIN, 'restarting the soak is the conservative choice');
});

test('casting sequence marks advance through vacuum, cooling and quench', () => {
  const run = started();
  advanceTo(run, 'cast', T0);
  ['flask_removed', 'flask_seated', 'vacuum_on'].forEach((k, n) => E.mark(run, k, T0 + n * 5000));
  assert.equal(cur(run).id, 'cast');
  E.mark(run, 'pour_started', T0 + 20000);
  assert.equal(cur(run).role, 'post_pour_vacuum');
  const s = E.schedule(run, T0 + 20000);
  assert.equal(s.rows[s.cur].remaining, 60000);
  E.mark(run, 'vacuum_off', T0 + 80000);
  assert.equal(cur(run).role, 'cooling');
  E.mark(run, 'quench', T0 + 80000 + 16 * MIN);
  assert.equal(cur(run).role, 'finish');
  E.completeRun(run, { rating: 4, defects: ['Porosity'], notes: 'ok' }, T0 + 100 * MIN);
  assert.equal(run.status, 'complete');
  const rec = E.record(run);
  assert.equal(rec.rating, 4);
  assert.equal(rec.flaskOutToPourSeconds, 20);
  assert.equal(rec.flaskCastingTempC, 525);
});

test('undo removes only the last user action', () => {
  const run = started();
  E.completeCurrent(run, T0 + MIN);
  assert.equal(cur(run).id, 'invest_measure');
  assert.ok(E.undoable(run));
  E.undo(run);
  assert.equal(cur(run).id, 'prepare_tree');
  assert.equal(E.undoable(run), null, 'cannot undo starting the run');
});

test('kiln re-sync can move the schedule back to an earlier segment', () => {
  const run = started();
  advanceTo(run, 'burnout_prep', T0);
  E.completeCurrent(run, T0);
  const t = T0 + 300 * MIN;
  E.advance(run, t); // app thinks we are on ramp 2
  const hold1 = idx(run, 'burnout_hold_1');
  E.kilnSync(run, hold1, 25, t); // kiln is actually still holding at 220
  assert.equal(cur(run).id, 'burnout_hold_1');
  const s = E.schedule(run, t);
  assert.equal(s.rows[hold1].remaining, 25 * MIN);
  assert.equal(s.rows[hold1 + 1].start, t + 25 * MIN);
});

test('reopen attention lists kiln stages passed while away and overdue user stages', () => {
  const run = started();
  advanceTo(run, 'burnout_prep', T0);
  E.completeCurrent(run, T0);
  const since = T0 + 10 * MIN;
  const t = T0 + 300 * MIN;
  E.advance(run, t);
  const a = E.attention(run, E.schedule(run, t), since, t);
  assert.deepEqual(a.advanced.map((r) => r.stage.id), ['burnout_ramp_1', 'burnout_hold_1']);

  const run2 = started();
  advanceTo(run2, 'set', T0);
  const t2 = T0 + 137 * MIN;
  const a2 = E.attention(run2, E.schedule(run2, t2), T0 + 60 * MIN, t2);
  assert.equal(a2.overdueUser.stage.id, 'set');
  assert.equal(a2.overdueUser.overdue, 17 * MIN);

  const run3 = started();
  advanceTo(run3, 'cool_to_cast', T0);
  E.completeCurrent(run3, T0);
  const t3 = T0 + 90 * MIN;
  assert.equal(E.attention(run3, E.schedule(run3, t3), T0 + MIN, t3), null, 'soak past its minimum is not an "overdue" prompt');
});

test('alerts fire once, re-fire after an extension, and stale ones are separated', () => {
  const run = started();
  advanceTo(run, 'set', T0);
  let t = T0 + 121 * MIN;
  let d = E.dueAlerts(run, E.schedule(run, t), t);
  assert.deepEqual(d.fire.map((a) => a.key), ['end:set', 'ev:set:set_prep_kiln'].filter((k) => d.fire.some((a) => a.key === k)));
  assert.ok(d.fire.some((a) => a.key === 'end:set'));
  E.markAlerts(run, d.fire);
  assert.equal(E.dueAlerts(run, E.schedule(run, t), t).fire.length, 0);
  E.extend(run, 'set', 5, t);
  t = T0 + 126 * MIN;
  assert.ok(E.dueAlerts(run, E.schedule(run, t), t).fire.some((a) => a.key === 'end:set'));
  t = T0 + 200 * MIN;
  const late = E.dueAlerts(run, E.schedule(run, t), t);
  assert.ok(late.stale.some((a) => a.key === 'end:set'));
});

test('plan from casting time works backwards', () => {
  const p = P.builtIn(INITIAL);
  const castAt = Date.UTC(2026, 8, 28, 9, 0, 0);
  const plan = E.planFromCastTime(p, {}, castAt, T0);
  assert.equal(plan.tooLate, false);
  assert.equal(plan.flaskReadyAt, castAt);
  assert.equal(plan.soakStartAt, castAt - 60 * MIN);
  const burnout = 90 + 180 + 120 + 120 + 180 + 240;
  assert.equal(plan.kilnStartAt, castAt - (60 + 90 + burnout) * MIN);
  assert.equal(plan.metalStartAt, castAt - 60 * MIN);
  const tooSoon = E.planFromCastTime(p, {}, T0 + 60 * MIN, T0);
  assert.equal(tooSoon.tooLate, true);
});

test('editing a manufacturer value flips provenance to working and back', () => {
  const p = P.builtIn(INITIAL);
  const hold = p.stages.find((s) => s.id === 'burnout_hold_1');
  assert.equal(hold.provenance.duration, 'manufacturer');
  assert.ok(P.editStageField(hold, 'minutes', 240));
  assert.equal(hold.provenance.duration, 'working');
  P.editStageField(hold, 'minutes', 180);
  assert.equal(hold.provenance.duration, 'manufacturer');
  assert.ok(P.editParam(p.params.waterRatioPct, 38));
  assert.equal(p.params.waterRatioPct.sourceType, 'working');
});

test('a run keeps its own profile snapshot', () => {
  const profile = P.builtIn(INITIAL);
  const run = E.newRun(profile, T0);
  profile.stages[0].name = 'changed';
  assert.notEqual(run.profile.stages[0].name, 'changed');
});

test('calendar export contains alarms for upcoming interventions', () => {
  const run = started();
  advanceTo(run, 'burnout_prep', T0);
  E.completeCurrent(run, T0);
  const cal = E.calendar(run, T0 + MIN);
  assert.ok(cal.count > 5);
  assert.match(cal.text, /BEGIN:VALARM/);
  assert.match(cal.text, /FURNACE/);
  assert.ok(!/[^\r]\n/.test(cal.text), 'CRLF line endings');
});

test('import normalises partial profiles', () => {
  const p = P.normalise({ name: 'X', stages: [{ name: 'Only step', minutes: 5 }] });
  assert.equal(p.stages[0].type, 'timed');
  assert.ok(p.params.waterRatioPct);
  assert.throws(() => P.normalise({}));
  assert.equal(U.hms(3599000), '00:59:59');
});

test('5-hour fast profile: timings, datasheet refs and minimum warnings', () => {
  const p = P.builtIn(FAST);
  const kiln = p.stages.filter((s) => s.control === 'kiln');
  assert.deepEqual(kiln.map((s) => [s.targetC, s.minutes]), [[220, 15], [220, 45], [450, 15], [450, 45], [730, 20], [730, 150]]);
  assert.equal(kiln.reduce((a, s) => a + s.minutes, 0), 290, 'burnout segments total 4 h 50 min');
  const peak = P.byRole(p, 'peak_hold');
  assert.ok(peak.minutes < peak.minMinutes, 'peak hold is below the datasheet minimum and must be flagged');
  assert.equal(peak.ref.minutes, 240);
  assert.equal(P.summary(p).flaskCastingTempC, 550);
  assert.equal(P.byRole(p, 'set').minutes, 90);
  assert.equal(P.byRole(p, 'soak').minutes, 60);
  assert.notEqual(p.id, P.builtIn(INITIAL).id);
});

test('kiln controller programme writes holds as Cn = Cn+1', () => {
  const k = P.kilnProgram(P.builtIn(FAST));
  const v = Object.fromEntries(k.rows.map((r) => [r.code, r.value]));
  assert.deepEqual([v.C01, v.t01, v.C02, v.t02, v.C03, v.t03, v.C04, v.t04], [20, 15, 220, 45, 220, 15, 450, 45]);
  assert.deepEqual([v.C05, v.t05, v.C06, v.t06, v.C07, v.t07, v.C08], [450, 20, 730, 150, 730, 25, 550]);
  assert.equal(v.t08, 60 + 60, 'casting hold = 60 min soak + 60 min buffer');
  assert.equal(v.t09, -121);
  k.segments.filter((g) => g.kind === 'hold').forEach((g) => assert.equal(g.fromC, g.toC));
  // Burnout + cool-down + soak, excluding the buffer
  assert.equal(k.totalMinutes - k.bufferMinutes, 375);
});

test('a run from the fast profile schedules the burnout from the flask-in tap', () => {
  const run = E.newRun(P.builtIn(FAST), T0);
  E.startRun(run, T0);
  advanceTo(run, 'burnout_prep', T0);
  E.completeCurrent(run, T0);
  const s = E.schedule(run, T0);
  const cool = s.rows.find((r) => r.stage.role === 'cool_to_cast');
  assert.equal(cool.start, T0 + 290 * MIN);
  const soak = s.rows.find((r) => r.stage.role === 'soak');
  assert.equal(soak.end, T0 + 375 * MIN, 'ready to cast ≈ 6 h 15 min after the flask goes in');
});

test('fast profile uses a 36:100 mix, marked experimental against the 38–40 datasheet range', () => {
  const p = P.builtIn(FAST);
  const wr = p.params.waterRatioPct;
  assert.equal(wr.value, 36);
  assert.equal(wr.sourceType, 'experimental');
  assert.ok(P.outOfRange(wr));
  assert.equal(E.waterMl(p), 234, '650 g × 0.36');
  assert.equal(P.summary(p).waterRatioPct, 36);
  assert.equal(P.builtIn(INITIAL).params.waterRatioPct.value, 40);
});

test('water ratio provenance follows the datasheet range', () => {
  const wr = P.builtIn(INITIAL).params.waterRatioPct;
  P.editParam(wr, 38);
  assert.equal(wr.sourceType, 'working', 'inside the vacuum-mix range');
  P.editParam(wr, 36);
  assert.equal(wr.sourceType, 'experimental', 'below the range');
  P.editParam(wr, 39);
  assert.equal(wr.sourceType, 'working');
  P.editParam(wr, 40);
  assert.equal(wr.sourceType, 'manufacturer');
});
