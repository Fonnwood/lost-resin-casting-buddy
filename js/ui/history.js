/* Casting Process Tracker — HISTORY view: finished runs, comparison table and run detail.
 * Renderers return { html, live } — see js/ui/components.js. */
(function (CPT) {
  'use strict';

  const U = CPT.util;
  const E = CPT.Engine;
  const h = U.esc;
  const MIN = U.MIN;
  const { ctx, btn, kv, resultForm } = CPT.UI.lib;

  function renderHistory(app, now) {
    const c = ctx();
    if (app.historyRunId) return { html: historyDetail(app, now), live: c.live };
    const runs = app.runs.filter((r) => r.status === 'complete' || r.status === 'abandoned').slice().reverse();
    let html = '<section class="card"><h2>History</h2><div class="row2">' + btn('exportHistory', 'Export all history (JSON)', 'ghost') + '<label class="btn ghost file">Import JSON<input type="file" accept="application/json,.json" data-action-change="importFile" hidden></label></div></section>';
    if (!runs.length) return { html: html + '<section class="card"><p>No finished runs yet. Completed casts and their results appear here.</p></section>', live: c.live };

    const recs = runs.map((r) => ({ run: r, rec: E.record(r) }));
    html += '<section class="card"><h2>Compare runs</h2><div class="table-wrap"><table class="compare"><thead><tr><th>Run</th><th>Mix</th><th>Flask</th><th>Metal</th><th>Peak hold</th><th>Soak</th><th>Result</th></tr></thead><tbody>' +
      recs.map(({ run, rec }) => '<tr data-action="historyOpen" data-arg="' + h(run.id) + '"><td><strong>' + h(run.name) + '</strong><br><small>' + h(rec.date) + '</small></td><td>' + h(rec.waterRatioPct) + ':100</td><td>' + h(rec.flaskCastingTempC) + '°C</td><td>' + h(rec.metalPourTempC) + '°C</td><td>' + h(U.dur(rec.peakHoldMinutes)) + '</td><td>' + h(U.dur(rec.soakMinutes)) + '</td><td>' + (run.status === 'abandoned' ? 'abandoned' : rec.rating ? h(rec.rating) + '/5' : '—') + '</td></tr>').join('') +
      '</tbody></table></div></section>';

    html += recs.map(({ run, rec }) => '<button type="button" class="card listcard" data-action="historyOpen" data-arg="' + h(run.id) + '"><div class="lc-top"><strong>' + h(run.name) + '</strong><span>' + (rec.rating ? '★'.repeat(rec.rating) + '☆'.repeat(5 - rec.rating) : run.status === 'abandoned' ? 'abandoned' : '') + '</span></div>' +
      '<div class="muted">' + h(rec.date) + ' · ' + h(rec.metal) + ' · flask ' + h(rec.flaskCastingTempC) + '°C · pour ' + h(rec.metalPourTempC) + '°C</div>' +
      (rec.defects && rec.defects.length ? '<div class="defect-tags">' + rec.defects.map((d) => '<span class="tag">' + h(d) + '</span>').join('') + '</div>' : '') + '</button>').join('');
    return { html, live: c.live };
  }

  function historyDetail(app, now) {
    const run = app.runs.find((r) => r.id === app.historyRunId);
    if (!run) return '<section class="card"><p>Run not found.</p>' + btn('historyBack', '← Back', 'ghost') + '</section>';
    const rec = E.record(run);
    const devs = E.deviations(run);
    const info = E.runtime(run);
    let html = '<div class="row2">' + btn('historyBack', '← All runs', 'ghost') + '</div>';
    html += '<section class="card"><h2>' + h(run.name) + '</h2><p class="muted">' + h(rec.date) + ' · ' + h(run.profileName) + (run.values.modelName ? ' · ' + h(run.values.modelName) : '') + '</p>' +
      '<div class="kv">' +
      kv('Investment', rec.investment) + kv('Resin', rec.resin) + kv('Powder / water', rec.powderG + ' g / ' + rec.waterMl + ' ml (' + rec.waterRatioPct + ':100)') +
      kv('Flask', rec.flaskDiameterMm + ' × ' + rec.flaskHeightMm + ' mm') + kv('Metal', rec.metal + (rec.metalWeightG ? ' · ' + rec.metalWeightG + ' g' : '')) +
      kv('Flask casting temp', rec.flaskCastingTempC + '°C') + kv('Pour temp', rec.metalPourTempC + '°C') + kv('Peak hold', rec.peakC + '°C · ' + U.dur(rec.peakHoldMinutes)) +
      kv('Flask out → pour', rec.flaskOutToPourSeconds != null ? rec.flaskOutToPourSeconds + ' s' : '—') +
      '</div>' + (run.values.notes ? '<p>' + h(run.values.notes) + '</p>' : '') + '</section>';

    html += '<section class="card"><h2>Result</h2>' + resultForm('hrun:' + run.id, run.result || {}) + '</section>';

    html += '<section class="card"><h2>Actual timeline</h2><div class="table-wrap"><table class="devs"><thead><tr><th>Stage</th><th>Start</th><th>Actual</th><th>Set</th><th>Δ</th></tr></thead><tbody>' +
      devs.map((d) => '<tr><td>' + h(d.stage.short || d.stage.name) + (d.doneBy === 'schedule' ? ' <em>sched.</em>' : '') + '</td><td>' + h(U.clock(d.start, d.end)) + '</td><td>' + h(U.durCompact(d.actualMin * MIN)) + '</td><td>' + h(U.dur(d.plannedMin, d.stage.unit)) + '</td><td>' + (d.deltaMin != null && Math.abs(d.deltaMin) >= 1 ? (d.deltaMin > 0 ? '+' : '') + Math.round(d.deltaMin) + 'm' : '') + '</td></tr>').join('') +
      '</tbody></table></div>';
    const marks = Object.keys(info.facts.marks);
    if (marks.length) html += '<div class="kv">' + marks.map((k) => kv(E.MARK_LABELS[k] || k, new Date(info.facts.marks[k]).toLocaleTimeString())).join('') + '</div>';
    if (info.facts.edits.length) html += '<details><summary>' + info.facts.edits.length + ' value change(s) during the run</summary><ul class="edits">' + info.facts.edits.map((e) => '<li>' + h(new Date(e.t).toLocaleTimeString()) + ' · ' + h(e.path) + ': ' + h(e.from) + ' → ' + h(e.to) + '</li>').join('') + '</ul></details>';
    html += '</section>';

    html += '<section class="card"><div class="row2">' + btn('exportRun', 'Export run as JSON', 'ghost', run.id) + btn('deleteRun', 'Delete run', 'danger', run.id) + '</div></section>';
    return html;
  }

  CPT.UI.renderHistory = renderHistory;
})(globalThis.CPT = globalThis.CPT || {});
