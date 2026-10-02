/* Casting Process Tracker — RUN view: values for this casting, calculator, and per-stage timing edits.
 * Renderers return { html, live } — see js/ui/components.js. */
(function (CPT) {
  'use strict';

  const U = CPT.util;
  const P = CPT.Profile;
  const E = CPT.Engine;
  const h = U.esc;
  const { ctx, prov, btn, refLine, kilnProgramBlock, field, numInput, paramField, planBlock } = CPT.UI.lib;

  function renderRun(app, now) {
    const c = ctx();
    const run = app.activeRun();
    if (!run) {
      return { html: '<section class="card"><h2>No active run</h2><p>Create a run to enter the flask, investment and metal values for this casting.</p>' + btn('newRun', 'Start new run', 'primary xl') + '</section>', live: c.live };
    }
    const p = run.profile;
    const calc = E.calculator(p, run.values.displacementMl);
    const sched = E.schedule(run, now);
    let html = '<div class="runbar"><div class="runname">' + h(run.name) + '</div><span class="state">' + (run.status === 'draft' ? 'DRAFT' : 'ACTIVE') + '</span></div>';
    if (run.status === 'draft') html += '<section class="card">' + btn('startRun', 'START RUN NOW', 'primary xl') + '<p class="hint">Starting records the time and begins step 1 (prepare resin tree).</p></section>';

    html += '<section class="card"><h2>Run</h2>' +
      field('Run name', '<input type="text" data-bind="run|name" value="' + h(run.name) + '">') +
      field('Model / tree', '<input type="text" data-bind="run|values.modelName" value="' + h(run.values.modelName) + '" placeholder="e.g. Dunrobin Castle tower">') +
      '<div class="grid2">' +
      field('Investment', '<input type="text" data-bind="run|profile.materials.investment" value="' + h(p.materials.investment) + '">') +
      field('Resin', '<input type="text" data-bind="run|profile.materials.resin" value="' + h(p.materials.resin) + '">') +
      '</div>' +
      field('Notes', '<textarea rows="3" data-bind="run|values.notes">' + h(run.values.notes) + '</textarea>') +
      '<p class="hint">Profile: ' + h(run.profileName) + '. Changes here apply to this run only.</p></section>';

    html += '<section class="card"><h2>Flask & investment</h2><div class="calc-out">' +
      '<div><span class="k">Water</span><span class="v big">' + c.L('calcWater', calc.waterMl + ' ml') + '</span></div>' +
      '<div><span class="k">Powder</span><span class="v big">' + c.L('calcPowder', calc.powderG + ' g') + '</span></div></div>' +
      '<p class="hint"><strong>Working starting quantity — adjust after measuring actual usage.</strong> Measure water first, add powder to water.</p>' +
      mixRatios(p) +
      '<div class="grid2">' + paramField('run', p, 'powderG') + paramField('run', p, 'waterRatioPct') + '</div>' +
      '<div class="grid2">' + paramField('run', p, 'flaskDiameterMm') + paramField('run', p, 'flaskHeightMm') + '</div>' +
      field('Model / tree displacement <small>ml (optional)</small>', numInput('run|values.displacementMl', run.values.displacementMl)) +
      '<div class="calc-est"><div>Flask volume <strong>' + c.L('calcVol', calc.flaskVolumeCm3 + ' cm³') + '</strong></div><div>Net of displacement <strong>' + c.L('calcNet', calc.netVolumeCm3 + ' cm³') + '</strong></div>' +
      '<div>Estimated powder to fill <strong>' + c.L('calcEst', calc.estimatedPowderG + ' g / ' + calc.estimatedWaterMl + ' ml') + '</strong> ' + prov(p.params.powderPerCm3 && p.params.powderPerCm3.sourceType) + '</div></div>' +
      paramField('run', p, 'powderPerCm3') +
      '</section>';

    html += '<section class="card"><h2>Metal</h2>' +
      field('Metal alloy', '<input type="text" data-bind="run|profile.materials.metal" value="' + h(p.materials.metal) + '">') +
      '<div class="grid2">' + paramField('run', p, 'metalTargetC') + paramField('run', p, 'metalHeatMinutes') + '</div>' +
      '<div class="grid2">' + paramField('run', p, 'metalWeightG') + paramField('run', p, 'metalReadyOffsetMinutes') + '</div>' +
      '</section>';

    html += '<section class="card"><h2>Plan from casting time</h2>' + planBlock(run, now) + '</section>';

    html += '<section class="card"><h2>Temperatures & durations</h2><p class="hint">Change any value — every later clock time updates immediately. Completed stages are locked.</p>';
    let phase = null;
    p.stages.forEach((s, i) => {
      if (s.phase !== phase) { phase = s.phase; html += '<div class="tl-phase">' + h(P.phaseLabel(p, phase)) + '</div>'; }
      const row = sched.rows[i];
      html += stageEditRow('run', s, i, row.status === 'done', row);
    });
    html += '</section>';

    html += '<section class="card"><h2>Kiln controller</h2>' + kilnProgramBlock(p, false) + paramField('run', p, 'controllerHoldBufferMinutes') + '</section>';

    html += '<section class="card"><h2>Export</h2><div class="row2">' + btn('exportRun', 'Export run as JSON', 'ghost') + btn('exportIcs', '📅 Calendar alarms (.ics)', 'ghost') + '</div>' +
      '<div class="danger-zone">' + btn('abandonRun', run.status === 'draft' ? 'Discard draft' : 'Abandon run', 'danger') + '</div></section>';
    return { html, live: c.live };
  }

  /** Water needed at each common ratio for the current powder quantity; tap one to use it. */
  function mixRatios(p) {
    const par = p.params.waterRatioPct;
    if (!par) return '';
    const powder = U.num(P.param(p, 'powderG'), 0);
    const cur = Number(par.value);
    const opts = (par.options || [36, 38, 40]).slice();
    if (!opts.includes(cur)) opts.push(cur);
    opts.sort((a, b) => a - b);
    const label = (r) => {
      if (Number(r) === Number(par.ref)) return 'Datasheet — conventional mix';
      if (par.range && r >= par.range[0] && r <= par.range[1]) return 'Datasheet vacuum-mix range';
      return 'Stronger than datasheet · experimental';
    };
    let html = '<div class="eyebrow">MIX RATIO — water for ' + h(powder) + ' g powder</div><div class="ratios">';
    opts.forEach((r) => {
      const on = Number(r) === cur;
      html += '<button type="button" class="ratio' + (on ? ' on' : '') + '" data-action="setRatio" data-arg="' + h(r) + '" aria-pressed="' + on + '">' +
        '<span class="r">' + h(r) + ':100</span><span class="w">' + h(U.round(powder * r / 100, 1)) + ' ml</span><span class="l">' + (on ? '✓ ' : '') + h(label(r)) + '</span></button>';
    });
    html += '</div>';
    if (P.outOfRange(par)) html += '<div class="refline">⚠ ' + h(cur) + ':100 is outside the Protocast datasheet range (' + h(par.range[0]) + '–' + h(par.range[1]) + ':100). Expect a thicker slurry and shorter working time — vacuum well and work quickly.</div>';
    return html;
  }

  function stageEditRow(scope, s, i, locked, row) {
    const dis = locked ? ' disabled' : '';
    const pv = s.provenance || {};
    const isSec = s.unit === 's';
    let html = '<div class="stage-edit' + (locked ? ' locked' : '') + (row && row.status === 'active' ? ' active' : '') + '"><div class="se-name">' + (locked ? '✓ ' : row && row.status === 'active' ? '▶ ' : '') + h(s.name) + (s.control === 'kiln' ? ' <span class="tag">kiln</span>' : '') + '</div><div class="se-fields">';
    const durLabel = E.hasTimer(s) ? (isSec ? 'Seconds' : 'Minutes') : (isSec ? 'Est. seconds' : 'Est. minutes');
    html += '<label class="mini"><span>' + durLabel + '</span><input type="number" inputmode="decimal" step="any" data-type="' + (isSec ? 'seconds' : 'number') + '" data-bind="' + scope + '|profile.stages.' + i + '.minutes" value="' + h(isSec ? Math.round(s.minutes * 60) : s.minutes) + '"' + dis + '></label>';
    if (s.targetC != null || ['ramp', 'hold', 'temperature_wait'].includes(s.type)) {
      html += '<label class="mini"><span>Target °C</span><input type="number" inputmode="decimal" step="any" data-type="tempC" data-bind="' + scope + '|profile.stages.' + i + '.targetC" value="' + h(s.targetC == null ? '' : U.toDisplayTemp(s.targetC)) + '"' + dis + ' placeholder="inherit"></label>';
    }
    if (s.minMinutes != null) html += '<label class="mini"><span>Minimum</span><input type="number" value="' + h(s.minMinutes) + '" disabled></label>';
    if (s.role === 'cool_to_cast') {
      html += '<label class="mini wide"><span>Mode</span><select data-bind="' + scope + '|coolMode:' + i + '"' + dis + '>' +
        '<option value="wait"' + (s.type === 'temperature_wait' ? ' selected' : '') + '>Wait for kiln (you confirm)</option>' +
        '<option value="ramp"' + (s.type === 'ramp' ? ' selected' : '') + '>Scheduled ramp (kiln programme)</option></select></label>';
    }
    html += '</div>';
    if (s.minMinutes != null && Number(s.minutes) < Number(s.minMinutes)) html += '<div class="refline">⚠ Below the minimum of ' + h(U.dur(s.minMinutes)) + (pv.minimum === 'manufacturer' ? ' (manufacturer)' : '') + '</div>';
    html += '<div class="provrow">' + (pv.target && s.targetC != null ? prov(pv.target, 'Temp') : '') + (pv.duration ? prov(pv.duration, E.hasTimer(s) ? 'Time' : 'Estimate') : '') + (pv.minimum ? prov(pv.minimum, 'Min') : '') + '</div>' + refLine(s) + '</div>';
    return html;
  }

  CPT.UI.renderRun = renderRun;
})(globalThis.CPT = globalThis.CPT || {});
