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
    if (run.plan && run.plan.castAt) html += '<div><span class="k">Planned casting time</span><span class="v">' + h(U.clock(run.plan.castAt, now)) + '</span></div>';
    html += '<div class="row2">' + btn('exportIcs', '📅 Add alarms to calendar', 'ghost') + (run.status === 'draft' ? btn('planOpen', 'Plan from casting time', 'ghost') : '') + '</div>';
    html += '<p class="hint">Calendar alarms ring even when this page is asleep — use them for overnight burnouts.</p></section>';

    let phase = null;
    html += '<section class="card timeline">';
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
    });
    html += '</section>';
    return { html, live: c.live };
  }

  CPT.UI.renderTimeline = renderTimeline;
})(globalThis.CPT = globalThis.CPT || {});
