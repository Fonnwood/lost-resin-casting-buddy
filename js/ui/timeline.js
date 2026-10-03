/* Casting Process Tracker — TIMELINE view: every stage with actual and projected clock times.
 * Renderers return { html, live } — see js/ui/components.js. */
(function (CPT) {
  'use strict';

  const U = CPT.util;
  const P = CPT.Profile;
  const E = CPT.Engine;
  const h = U.esc;
  const MIN = U.MIN;
  const { ctx, btn } = CPT.UI.lib;

  function renderTimeline(app, now) {
    const c = ctx();
    const run = app.activeRun();
    if (!run) return { html: '<section class="card"><h2>No active run</h2><p>The timeline appears once you create a run.</p>' + btn('newRun', 'Start new run', 'primary') + '</section>', live: c.live };
    const sched = E.schedule(run, now);
    const metal = E.metalInfo(run, sched, now);
    const flask = E.flaskInfo(run, sched, now);
    let html = '<div class="runbar"><div class="runname">' + h(run.name) + '</div><span class="state">' + h(E.runState(run, sched, now).replace(/_/g, ' ')) + '</span></div>';

    // Key milestones
    const castRow = sched.rows[E.planAnchorIndex(run.profile)];
    html += '<section class="card milestones">';
    if (flask.index >= 0) html += '<div><span class="k">Flask ready</span><span class="v">' + (flask.done ? '✓' : h(U.clock(metal.soakReadyAt, now)) + (metal.estimated ? ' <em>est.</em>' : '')) + '</span></div>';
    if (metal.status === 'idle' && metal.recommendedStart && !metal.poured) html += '<div><span class="k">Start ' + h(metal.name) + ' furnace</span><span class="v">' + h(U.clock(metal.recommendedStart, now)) + (metal.estimated ? ' <em>est.</em>' : '') + '</span></div>';
    if (castRow && castRow.status !== 'done') html += '<div><span class="k">Ready to cast</span><span class="v">' + h(U.clock(castRow.start, now)) + ' <em>est.</em></span></div>';
    const pl = E.planOf(run.profile, run.plan);
    if (pl) html += '<div><span class="k">' + (pl.locked ? '🔒 ' : '') + 'Plan: ' + h(run.profile.stages[pl.index].short || run.profile.stages[pl.index].name) + ' ' + (pl.edge === 'end' ? 'ends' : 'starts') + '</span><span class="v">' + h(U.clock(pl.at, now)) + '</span></div>';
    html += '<div class="row2">' + btn('exportIcs', '📅 Add alarms to calendar', 'ghost') + (run.status === 'draft' ? btn('planOpen', 'Plan the timeline', 'ghost') : '') + '</div>';
    html += '<p class="hint">Calendar alarms ring even when this page is asleep — use them for overnight burnouts.</p></section>';

    const track = E.metalTrack(run, sched, now);
    const metalRows = (after) => track.filter((it) => it.afterIndex === after).map((it) => metalRow(it, metal, c, now)).join('');

    let phase = null;
    html += '<section class="card timeline">' + metalRows(-1);
    sched.rows.forEach((row) => {
      const s = row.stage;
      if (s.phase !== phase) {
        phase = s.phase;
        html += '<div class="tl-phase">' + h(P.phaseLabel(run.profile, phase)) + '</div>';
      }
      const icon = row.status === 'done' ? '✓' : row.status === 'active' ? '▶' : '○';
      let right = '';
      if (row.status === 'done') {
        const actual = row.end - row.start;
        let dev = '';
        if (E.hasTimer(s) && row.scheduledEnd != null) {
          const delta = Math.round((row.end - row.scheduledEnd) / MIN);
          if (Math.abs(delta) >= 1) dev = ' <span class="dev">' + (delta > 0 ? '+' : '') + delta + ' min</span>';
        }
        if (row.ext) dev += ' <span class="dev">ext ' + (row.ext > 0 ? '+' : '') + row.ext + '</span>';
        right = h(U.clock(row.start, now)) + '–' + h(U.clock(row.end, now)) + ' · ' + h(U.durCompact(actual)) + dev + (row.doneBy === 'schedule' ? ' <em>sched.</em>' : '');
      } else if (row.status === 'active') {
        if (E.hasTimer(s)) right = row.overdue > 0 && s.control !== 'kiln' ? '<strong class="over">+' + c.L('tl_active', U.hms(row.overdue)) + ' over</strong>' : '<strong>' + c.L('tl_active', U.hms(Math.max(0, row.remaining))) + '</strong> remaining';
        else right = '<strong>' + c.L('tl_active', U.hms(now - row.start)) + '</strong> elapsed';
        right += '<br>Started ' + h(U.clock(row.start, now)) + ' · ends ' + (row.estimate ? '≈ ' : '') + h(U.clock(row.end, now));
      } else {
        right = 'Starts ' + h(U.clock(row.start, now)) + '<br>Ends ' + h(U.clock(row.end, now)) + ' · ' + h(U.dur(s.minutes, s.unit)) + (row.estimate ? ' <em>est.</em>' : '');
      }
      const t = P.targetOf(run.profile, row.i);
      html += '<div class="tl-row ' + row.status + '"><div class="tl-icon">' + icon + '</div><div class="tl-main"><div class="tl-name">' + h(s.short || s.name) + (t != null && ['ramp', 'hold', 'soak', 'temperature_wait'].includes(s.type) && !/°C/.test(s.short || s.name) ? ' <span class="muted">' + h(t) + '°C</span>' : '') + (s.control === 'kiln' ? ' <span class="tag">kiln</span>' : '') + '</div><div class="tl-times">' + right + '</div></div></div>';
      html += metalRows(row.i);
    });
    html += '</section>';
    return { html, live: c.live };
  }

  /** One step of the metal melt, drawn as a side lane next to the stage it falls in. */
  function metalRow(it, metal, c, now) {
    const name = h(metal.name);
    let icon, title, times;
    if (it.key === 'start') {
      icon = it.status === 'done' ? '✓' : '🔥';
      if (it.status === 'done') {
        title = name + ' furnace started';
        times = h(U.clock(it.at, now));
      } else {
        title = 'Start ' + name + ' furnace';
        times = it.late
          ? '<strong class="over">Start now — ' + c.L('tl_metal_late', U.durCompact(it.late)) + ' late</strong>'
          : 'At ' + h(U.clock(it.at, now)) + (it.estimate ? ' <em>est.</em>' : '') + ' · heat-up ' + h(U.dur(metal.heatMinutes));
      }
    } else {
      const temp = metal.targetC != null ? ' <span class="muted">' + h(metal.targetC) + '°C</span>' : '';
      if (it.status === 'done') {
        icon = '✓';
        title = name + ' at pour temperature' + temp;
        times = 'Confirmed ' + h(U.clock(it.at, now));
      } else if (it.status === 'active') {
        icon = '▶';
        title = name + ' heating' + temp;
        times = now < it.at
          ? '<strong>' + c.L('tl_metal', U.hms(it.at - now)) + '</strong> to expected readiness · ≈ ' + h(U.clock(it.at, now))
          : '<strong class="over">Expected ready ' + h(U.clock(it.at, now)) + '</strong> — check the temperature, then confirm on NOW';
      } else {
        icon = '○';
        title = name + ' ready to pour' + temp;
        times = '≈ ' + h(U.clock(it.at, now)) + ' <em>est.</em>';
      }
    }
    return '<div class="tl-row metal ' + it.status + (it.late ? ' late' : '') + '"><div class="tl-icon" aria-hidden="true">' + icon + '</div><div class="tl-main"><div class="tl-name">' + title + ' <span class="tag metal">metal</span></div><div class="tl-times">' + times + '</div></div></div>';
  }

  CPT.UI.renderTimeline = renderTimeline;
})(globalThis.CPT = globalThis.CPT || {});
