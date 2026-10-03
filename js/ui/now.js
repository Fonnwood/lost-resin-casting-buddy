/* Casting Process Tracker — NOW view: the current step, its timer, and the flask/metal panel.
 * Renderers return { html, live } — see js/ui/components.js. */
(function (CPT) {
  'use strict';

  const U = CPT.util;
  const P = CPT.Profile;
  const E = CPT.Engine;
  const h = U.esc;
  const MIN = U.MIN;
  const { ctx, prov, btn, openSourceNote, pushNudge, fill, textVars, stageTitle, describeStage, rampRate, checklist, checklistProgress, minLine, refLine, provRow, extendRow, kilnProgramBlock, safetyCard, defaultProfileOf, resultForm } = CPT.UI.lib;

  function renderNow(app, now) {
    const c = ctx();
    const run = app.activeRun();
    if (!run) return { html: welcome(app, now), live: c.live };
    if (run.status === 'draft') return { html: draftCard(app, run, now, c), live: c.live };

    const sched = E.schedule(run, now);
    const i = sched.cur;
    const stages = run.profile.stages;
    if (i >= stages.length) {
      return { html: '<section class="card"><h2>All steps complete</h2><p>Record the result to finish this run.</p>' + resultForm('run', run.resultDraft || {}) + btn('completeRun', 'SAVE RESULTS & COMPLETE RUN', 'primary xl') + btn('backStage', '← Back to previous step', 'ghost') + '</section>', live: c.live };
    }

    const row = sched.rows[i];
    const s = row.stage;
    const state = E.runState(run, sched, now);
    const metal = E.metalInfo(run, sched, now);
    const flask = E.flaskInfo(run, sched, now);
    const done = sched.rows.filter((r) => r.status === 'done').length;

    let html = '<div class="runbar"><div class="runname">' + h(run.name) + '</div><span class="state state-' + state.toLowerCase() + '">' + state.replace(/_/g, ' ') + '</span></div>';
    html += '<div class="progress" role="progressbar" aria-valuemin="0" aria-valuemax="' + stages.length + '" aria-valuenow="' + done + '"><div style="width:' + Math.round(done / stages.length * 100) + '%"></div></div>';
    html += '<div class="progress-label">Overall casting progress: ' + (done + 1) + ' / ' + stages.length + '</div>';

    html += stageCard(app, run, sched, row, metal, flask, now, c);

    if (metal.relevant && s.type !== 'cast_sequence') html += metalPanel(run, metal, flask, now, c);

    const evs = E.stageEvents(run, sched).filter((ev) => ev.at > now && ev.at - now < 3 * 3600000).slice(0, 3);
    if (evs.length) {
      html += '<section class="card upcoming"><div class="eyebrow">COMING UP</div>' + evs.map((ev, n) => '<div class="up"><span class="mono">' + c.L('ev' + n, U.hms(ev.at - now)) + '</span><span>' + h(ev.text) + (ev.estimate ? ' <em>(est.)</em>' : '') + '</span></div>').join('') + '</section>';
    }

    const next = sched.rows[i + 1];
    if (next && s.type !== 'finish') {
      html += '<section class="card next"><div class="eyebrow">NEXT</div><div class="next-name">' + h(next.stage.name) + '</div>' +
        '<p>' + h(describeStage(run, i + 1)) + '</p>' +
        '<div class="times"><span>Starts ' + (row.status === 'active' && s.control === 'kiln' ? '' : '≈ ') + h(U.clock(next.start, now)) + '</span><span>Ends ' + (next.estimate ? '≈ ' : '') + h(U.clock(next.end, now)) + '</span></div></section>';
    }

    const u = E.undoable(run);
    html += '<section class="card escape"><div class="eyebrow">TIMER STUCK OR WRONG?</div><div class="row3">' +
      btn('resetStage', '↺ Reset timer', 'ghost small') + btn('skipStage', 'Skip step →', 'ghost small') + (i > 0 ? btn('backStage', '← Previous step', 'ghost small') : '') +
      '</div></section>';
    html += pushNudge();
    html += '<div class="footer-actions">' + (u ? btn('undo', '↶ Undo: ' + h(u.label), 'ghost small') : '') + btn('nav', 'Full timeline', 'ghost small', 'timeline') + '</div>';
    return { html, live: c.live };
  }

  function welcome(app, now) {
    const recent = app.runs.filter((r) => r.status === 'complete').slice(-3).reverse();
    let html = '<section class="card hero"><div class="eyebrow">NO ACTIVE CASTING RUN</div><h1>Ready when you are</h1>' +
      '<p>Start a run to track investing, burnout, flask soak, metal and pour from one screen.</p>' +
      btn('newRun', 'START NEW CASTING RUN', 'primary xl') + '</section>';
    const st = CPT.Sync && CPT.Sync.status;
    if (st && st.available && !st.email) {
      html += '<p class="hint center">Using more than one device? ' + btn('signIn', 'Sign in to sync (optional)', 'ghost small') + '</p>';
    }
    if (recent.length) {
      html += '<section class="card"><div class="eyebrow">RECENT RUNS</div>' + recent.map((r) => '<button type="button" class="listrow" data-action="historyOpen" data-arg="' + h(r.id) + '"><span>' + h(r.name) + '</span><span class="muted">' + (r.result && r.result.rating ? '★ ' + r.result.rating + '/5' : '') + '</span></button>').join('') + '</section>';
    }
    html += safetyCard(defaultProfileOf(app), true);
    html += openSourceNote('hint center');
    return html;
  }

  function draftCard(app, run, now, c) {
    let html = '<div class="runbar"><div class="runname">' + h(run.name) + '</div><span class="state state-draft">DRAFT</span></div>';
    html += '<section class="card hero"><div class="eyebrow">WHAT TO DO NOW</div>';
    const pl = E.planOf(run.profile, run.plan);
    if (pl) {
      const plan = E.planAround(run.profile, run.values, pl, now);
      const a = plan.rows[pl.index];
      const aName = a.stage.short || a.stage.name;
      html += '<h1>' + (pl.locked ? '🔒 ' : '') + 'Plan: ' + h(aName) + ' ' + (pl.edge === 'end' ? 'ends' : 'starts') + ' ' + h(U.clock(pl.at, now)) + '</h1>';
      if (plan.tooLate) {
        html += '<p class="warnbox">That time is too soon. Earliest if you start now: <strong>' + h(U.clock(plan.earliest, now)) + '</strong>.</p>';
      } else {
        html += '<p>' + h(aName) + ': <strong>' + h(U.clock(a.start, now)) + '</strong> – <strong>' + h(U.clock(a.end, now)) + '</strong>. Ready to cast about <strong>' + h(U.clock(plan.castAt, now)) + '</strong>.</p>' +
          '<p>Start the run (prepare the tree) at <strong>' + h(U.clock(plan.startAt, now)) + '</strong>. Start investing by <strong>' + h(U.clock(plan.investAt, now)) + '</strong>. Flask into the kiln by <strong>' + h(U.clock(plan.kilnStartAt, now)) + '</strong>.</p>' +
          '<p>Start in: <strong class="mono">' + c.L('planStartIn', U.hms(Math.max(0, plan.startAt - now))) + '</strong></p>';
      }
    } else {
      html += '<h1>Run not started</h1><p>Check the values for this casting on the RUN screen, or plan backwards from a casting time. Then start.</p>';
    }
    html += btn('startRun', 'START RUN NOW', 'primary xl') + '<div class="row2">' + btn('nav', 'Edit run values', 'ghost', 'run') + btn('planOpen', 'Plan the timeline', 'ghost') + '</div>' + '</section>';
    html += pushNudge();
    html += safetyCard(run.profile, true);
    return html;
  }

  function stageCard(app, run, sched, row, metal, flask, now, c) {
    const s = row.stage;
    const i = row.i;
    const vars = textVars(run, i);
    const t = P.targetOf(run.profile, i);
    vars.remaining = U.hms(row.remaining || 0);
    const kiln = s.control === 'kiln';
    const overdue = row.overdue > 0;
    const stepLabel = P.phaseLabel(run.profile, s.phase) + ' · Step ' + (i + 1) + ' of ' + run.profile.stages.length;

    let todo;
    let body = '';
    let actions = '';
    let timerHtml = '';
    let tempHtml = '';

    // Defaults for "what to do now"
    if (s.doNow) todo = fill(s.doNow, vars, c);
    else if (s.type === 'ramp') todo = fill('Let the kiln programme ramp to {targetC}°C. No action required for another {remaining}.', vars, c);
    else if (s.type === 'hold') todo = fill('Leave the kiln at {targetC}°C. No action required for another {remaining}.', vars, c);
    else todo = fill(s.name + '.', vars, c);

    if (t != null && ['ramp', 'hold', 'temperature_wait', 'soak'].includes(s.type)) {
      tempHtml = '<div class="temp">' + h(t) + '°C</div>';
      if (s.type === 'ramp') {
        const from = P.startTempOf(run.profile, i);
        const frac = Math.min(1, Math.max(0, row.elapsed / Math.max(1, row.scheduledEnd - row.start)));
        tempHtml += '<div class="temp-sub">' + h(from) + '°C → ' + h(t) + '°C · ' + h(rampRate(run, i)) + '</div>';
        tempHtml += '<div class="temp-sub">Programme setpoint now ≈ ' + c.L('setpoint', Math.round(from + (t - from) * frac) + '°C') + ' <em>(scheduled, not measured)</em></div>';
      } else if (kiln) {
        tempHtml += '<div class="temp-sub">Kiln programme target · not measured</div>';
      }
    }

    const timeLine = (label2, endVal) => '<div class="times"><span>Started ' + h(U.clock(row.start, now)) + '</span><span>' + label2 + ' ' + endVal + '</span></div>';

    switch (s.type) {
      case 'ramp':
      case 'hold':
      case 'timed': {
        const isVac = s.role === 'post_pour_vacuum';
        const isCooling = s.role === 'cooling';
        if (overdue && !kiln) {
          timerHtml = '<div class="timer overdue">+' + c.L('timer', U.hms(row.overdue)) + '</div><div class="timer-label">' + (isVac ? 'POST-POUR VACUUM COMPLETE' : isCooling ? 'INITIAL COOLING PERIOD COMPLETE' : 'TIME UP — OVER BY') + '</div>';
          if (!isVac && !isCooling) todo = fill('Time is up. When you have finished, tap “' + (s.completeLabel || 'Complete now') + '”.', vars, c);
        } else {
          timerHtml = '<div class="timer">' + c.L('timer', U.hms(Math.max(0, row.remaining))) + '</div><div class="timer-label">' + (row.paused ? 'TRACKING PAUSED' : 'remaining') + '</div>';
        }
        body += timeLine(overdue && !kiln ? 'Was due' : 'Expected finish', h(U.clock(row.scheduledEnd, now)));
        if (s.role === 'peak_hold' || s.banner) body = '<div class="banner-hot">' + h(s.banner || 'HIGH-TEMPERATURE BURNOUT') + '</div>' + body;
        body += minLine(s) + refLine(s);
        if (s.phase === 'invest') {
          const first = sched.rows.find((r) => r.stage.phase === 'invest' && r.stage.type === 'timed');
          if (first && first.start) {
            const total = sched.rows.filter((r) => r.stage.phase === 'invest' && r.stage.type === 'timed').reduce((a, r) => a + E.minutesOf(r.stage), 0);
            body += '<div class="subtimer">Since powder added: <span class="mono">' + c.L('mixElapsed', U.shortTimer(now - first.start)) + '</span> / ' + h(U.dur(total)) + ' total</div>';
          }
        }
        if (isVac) {
          if (overdue) {
            todo = fill('Post-pour vacuum complete. Switch the vacuum off.', vars, c);
            actions = btn('mark', 'SWITCH VACUUM OFF', 'primary xl', 'vacuum_off');
          } else {
            todo = fill('Keep vacuum running.', vars, c);
            actions = btn('mark', 'Vacuum off early', 'ghost', 'vacuum_off');
          }
          const poured = sched.facts.marks.pour_started;
          if (poured) body += '<div class="subtimer">Pour started ' + h(U.clock(poured, now)) + '</div>';
        } else if (isCooling) {
          if (overdue || row.remaining <= 0) {
            todo = fill('Initial cooling period complete. Decide whether the casting is ready to quench — the timer cannot tell you that.', vars, c);
            actions = '<div class="row2">' + btn('mark', 'QUENCH NOW', 'primary xl', 'quench') + btn('extend', 'WAIT LONGER +5 MIN', 'secondary xl', 5) + '</div>';
          } else {
            body = '<div class="banner-warn">DO NOT QUENCH YET</div>' + body;
            actions = extendRow(s) + btn('mark', 'Quench early', 'ghost', 'quench');
          }
        } else {
          actions = btn('complete', h(s.completeLabel || 'COMPLETE NOW'), (overdue || kiln ? 'primary' : 'secondary') + ' xl');
          if (kiln) actions = btn('complete', 'Kiln already moved on — complete now', 'ghost') + btn('kilnSyncOpen', 'Kiln is on a different step…', 'ghost');
          actions = extendRow(s) + actions;
          if (!kiln) actions += row.paused ? btn('resume', '▶ Resume tracking', 'ghost') : btn('pause', 'Pause tracking', 'ghost');
          if (!kiln) actions += '<p class="hint">Pause tracking only pauses this timer — not any equipment.</p>';
        }
        break;
      }

      case 'temperature_wait': {
        timerHtml = '<div class="timer">' + c.L('timer', U.hms(now - row.start)) + '</div><div class="timer-label">waiting for kiln</div>';
        body += '<div class="times"><span>Started ' + h(U.clock(row.start, now)) + '</span><span>Est. ' + h(U.dur(s.minutes)) + ' → ≈ ' + h(U.clock(row.start + s.minutes * MIN, now)) + '</span></div>';
        body += '<p class="hint">Cool-down time depends on your kiln. The estimate is only used for planning.</p>';
        if (s.notes) body += '<p class="hint">' + h(s.notes) + '</p>';
        actions = btn('complete', h((s.completeLabel || 'Kiln at casting temperature').toUpperCase()) + ' (' + h(t) + '°C)', 'primary xl');
        break;
      }

      case 'soak': {
        if (flask.needsConfirm) {
          body += '<div class="warnbox"><strong>Scheduled only.</strong> The cool-down ramp has reached its scheduled end, but the app cannot see the kiln. Confirm the kiln display shows ' + h(t) + '°C.</div>';
          actions += btn('flaskConfirm', 'At ' + h(t) + '°C since scheduled time', 'secondary', 'scheduled') + btn('flaskConfirm', 'FLASK AT TARGET TEMPERATURE NOW (restart soak)', 'primary', 'now');
        }
        if (!flask.timeReached) {
          timerHtml = '<div class="timer">' + c.L('timer', U.hms(flask.remaining)) + '</div><div class="timer-label">remaining</div>';
          body += '<div class="banner-warn">Do not cast until this reaches zero.</div>';
          if (!s.doNow) todo = fill('Leave the flask in the kiln at {targetC}°C.', vars, c);
        } else {
          timerHtml = '<div class="timer ok">' + c.L('timer', U.hms(flask.elapsed)) + '</div><div class="timer-label">at ' + h(t) + '°C for</div>';
          body = '<div class="banner-ok">FLASK READY</div>' + body;
          if (!s.doNow) todo = fill('Flask ready for casting. Keep it in the kiln until the metal and vacuum machine are ready.', vars, c);
        }
        if (metal.status === 'idle' && metal.startIn != null && metal.startIn <= 0) {
          todo = '<strong>Start the ' + h(metal.name) + ' furnace.</strong><br>The flask will complete its required ' + h(t) + '°C soak in approximately ' + c.L('todoSoak', U.durCompact(Math.max(0, flask.remaining))) + '.';
        }
        body += '<div class="times"><span>Soak started ' + h(U.clock(row.start, now)) + '</span><span>Ready ' + h(U.clock(flask.readyAt, now)) + '</span></div>';
        body += minLine(s);
        const ready = flask.ready && metal.status === 'ready';
        if (ready) {
          body += '<div class="readylist"><div class="eyebrow">READY TO CAST</div>' +
            '<div>Flask: ' + h(t) + '°C ✓</div><div>Flask soak: ' + c.L('soakFor', U.durCompact(flask.elapsed)) + ' ✓</div>' +
            '<div>' + h(metal.name) + ': ' + h(metal.targetC) + '°C ✓ <span class="muted">(confirmed ' + h(U.clock(metal.readyAt, now)) + ')</span></div></div>';
          actions += btn('complete', 'CONTINUE TO CASTING →', 'primary xl');
        } else if (!flask.needsConfirm) {
          const waiting = [];
          if (!flask.timeReached) waiting.push('flask soak');
          if (metal.status !== 'ready') waiting.push('metal confirmation');
          actions += '<button type="button" class="btn primary xl" disabled>Casting unlocks after: ' + h(waiting.join(' + ')) + '</button>' +
            btn('completeAnyway', 'Continue to casting anyway…', 'ghost', waiting.join(' + '));
        }
        const prep = run.profile.stages.find((x) => x.role === 'cast_prep');
        if (prep && prep.checklist && prep.checklist.length) {
          const pr = checklistProgress(run, prep);
          body += '<details class="meanwhile"><summary>While you wait: prepare the vacuum machine (' + pr.done + '/' + pr.n + ')</summary>' + checklist(run, prep) + '</details>';
        }
        break;
      }

      case 'cast_prep': {
        const soakRow = sched.rows[flask.index];
        timerHtml = '';
        body += '<div class="readylist"><div class="eyebrow">READY TO CAST</div>' +
          '<div>Flask: ' + h(flask.targetC) + '°C ✓</div>' +
          (soakRow ? '<div>Flask soak: ' + h(U.durCompact(soakRow.end - soakRow.start)) + ' ✓ · still in kiln ' + c.L('stillIn', U.hms(now - soakRow.start)) + '</div>' : '') +
          '<div>' + h(metal.name) + ': ' + h(metal.targetC) + '°C ' + (metal.status === 'ready' ? '✓' : '—') + '</div></div>';
        body += '<div class="eyebrow">Vacuum machine ready?</div>' + checklist(run, s);
        actions = btn('complete', 'CONFIRM — VACUUM MACHINE READY', 'primary xl');
        break;
      }

      case 'cast_sequence':
        return castSequence(run, sched, row, metal, flask, now, c);

      case 'finish':
        return finishCard(app, run, sched, row, now, c);

      default: {
        // manual / checkpoint
        timerHtml = '<div class="timer small">' + c.L('timer', U.hms(now - row.start)) + '</div><div class="timer-label">elapsed' + (s.minutes ? ' · est. ' + h(U.dur(s.minutes)) : '') + '</div>';
        if (s.role === 'measure') {
          body += '<div class="measure"><div><span class="k">Water</span><span class="v">' + h(vars.waterMl) + ' ml</span></div><div><span class="k">Powder</span><span class="v">' + h(vars.powderG) + ' g</span></div><div><span class="k">Ratio</span><span class="v">' + h(vars.waterRatioPct) + ':100</span></div></div>';
          const wr = run.profile.params.waterRatioPct;
          if (wr) body += '<div class="provrow">' + prov(wr.sourceType, 'Ratio') + '</div>';
          if (wr && P.outOfRange(wr)) body += '<div class="refline">⚠ Stronger than the datasheet range (' + h(wr.range[0]) + '–' + h(wr.range[1]) + ':100): thicker slurry, less working time. Keep to the mixing times.</div>';
        }
        body += checklist(run, s);
        if (s.role === 'kiln_start') body += kilnProgramBlock(run.profile, true);
        const pr = checklistProgress(run, s);
        const label = h(s.completeLabel || 'DONE — NEXT STEP');
        actions = btn('complete', label + (pr && pr.done < pr.n ? ' <small>(' + pr.done + '/' + pr.n + ' ticked)</small>' : ''), 'primary xl');
      }
    }

    let html = '<section class="card stage type-' + h(s.type) + (overdue && !kiln ? ' is-overdue' : '') + (kiln ? ' is-kiln' : '') + '">';
    html += '<div class="todo"><div class="eyebrow">WHAT TO DO NOW</div><p>' + todo + '</p></div>';
    html += '<div class="eyebrow">' + h(stepLabel) + (kiln ? ' · <span class="tag">KILN PROGRAMME</span>' : '') + '</div>';
    html += '<h1 class="stage-name">' + h(stageTitle(run, i)) + '</h1>';
    html += tempHtml + timerHtml + body;
    if (s.warning && s.role !== 'cooling') html += '<div class="banner-warn">' + h(s.warning) + '</div>';
    if (s.instructions) html += '<p class="instructions">' + fill(s.instructions, vars) + '</p>';
    html += provRow(s);
    html += '<div class="actions">' + actions + '</div>';
    html += '</section>';
    return html;
  }

  function castSequence(run, sched, row, metal, flask, now, c) {
    const m = sched.facts.marks;
    const soakRow = sched.rows[flask.index];
    let html = '';
    if (m.flask_removed) {
      html += '<section class="card flask-out"><div class="eyebrow">FLASK OUT OF KILN</div><div class="timer hot">' + c.L('flaskOut', U.hms(now - m.flask_removed)) + '</div><div class="timer-label">counting up — keep moving</div></section>';
    }
    const steps = [
      { n: 1, title: 'Leave flask in kiln', text: 'Keep the flask at casting temperature until everything else is ready.', done: true },
      { n: 2, title: 'Prepare vacuum casting machine', text: 'Checklist confirmed.', done: true },
      { n: 3, title: 'Prepare metal', text: metal.status === 'ready' ? metal.name + ' at ' + metal.targetC + '°C — confirmed ' + U.clock(metal.readyAt, now) : 'Confirm the metal is at pour temperature.', done: metal.status === 'ready', key: 'metal' },
      { n: 4, title: 'Remove flask from kiln', key: 'flask_removed', label: 'FLASK REMOVED' },
      { n: 5, title: 'Place flask on vacuum table', key: 'flask_seated', label: 'FLASK SEATED' },
      { n: 6, title: 'Start vacuum', key: 'vacuum_on', label: 'VACUUM ON', text: 'Confirm adequate vacuum before pouring.' },
      { n: 7, title: 'Pour ' + (metal.name || 'metal'), key: 'pour_started', label: 'POUR STARTED', text: 'Keep vacuum running.' },
    ];
    let activeFound = false;
    html += '<section class="card"><div class="eyebrow">CASTING SEQUENCE' + (soakRow && soakRow.end ? ' · flask soaked ' + h(U.durCompact(soakRow.end - soakRow.start)) : '') + '</div>';
    steps.forEach((st) => {
      let isDone = st.done;
      if (st.key && st.key !== 'metal') isDone = m[st.key] != null;
      const active = !isDone && !activeFound;
      if (active) activeFound = true;
      html += '<div class="seq' + (isDone ? ' done' : '') + (active ? ' active' : '') + '"><div class="seq-n">' + (isDone ? '✓' : st.n) + '</div><div class="seq-body"><div class="seq-title">' + h(st.title) + '</div>' +
        (st.text ? '<div class="seq-text">' + h(st.text) + '</div>' : '') +
        (st.key && m[st.key] ? '<div class="seq-text">' + h(U.clock(m[st.key], now)) + '</div>' : '');
      if (active) {
        if (st.key === 'metal') html += btn('metalReady', h(metal.name).toUpperCase() + ' AT POUR TEMPERATURE', 'primary xl');
        else html += btn('mark', st.label, 'primary xl', st.key);
      }
      html += '</div></div>';
    });
    html += '</section>';
    return html;
  }

  function finishCard(app, run, sched, row, now, c) {
    const m = sched.facts.marks;
    const d = run.resultDraft || {};
    let html = '<section class="card"><div class="eyebrow">CASTING COMPLETE</div><h1 class="stage-name">Quench & record results</h1>';
    html += '<div class="times"><span>Poured ' + h(U.clock(m.pour_started, now)) + '</span><span>Quenched ' + h(U.clock(m.quench, now)) + '</span></div>';
    html += '<div class="eyebrow">FOLLOW-UP</div>' + checklist(run, row.stage);
    html += resultForm('run', d);
    html += btn('completeRun', 'SAVE RESULTS & COMPLETE RUN', 'primary xl') + '</section>';
    return html;
  }

  function metalPanel(run, metal, flask, now, c) {
    let html = '<section class="card metal"><div class="dual">';
    // Flask side
    html += '<div class="side"><div class="eyebrow">FLASK</div><div class="side-temp">' + h(P.targetOf(run.profile, flask.index)) + '°C</div>';
    if (flask.active) {
      if (flask.timeReached) html += '<div class="side-status ok">' + (flask.needsConfirm ? 'Confirm temp' : 'Ready ✓') + '</div>';
      else html += '<div class="side-status">Ready in <span class="mono">' + c.L('mFlask', U.hms(flask.remaining)) + '</span></div>';
    } else if (flask.done) {
      html += '<div class="side-status ok">Soaked ✓</div>';
    } else {
      html += '<div class="side-status">Ready ≈ ' + h(U.clock(metal.soakReadyAt, now)) + ' <em>(est.)</em></div>';
    }
    html += '</div>';
    // Metal side
    html += '<div class="side"><div class="eyebrow">' + h((metal.name || 'METAL').toUpperCase()) + '</div><div class="side-temp">' + h(metal.targetC) + '°C</div>';
    if (metal.status === 'idle') html += '<div class="side-status">Not started</div>';
    else if (metal.status === 'heating') html += '<div class="side-status">Heating since ' + h(U.clock(metal.startedAt, now)) + '</div>';
    else html += '<div class="side-status ok">At pour temp ✓</div>';
    html += '</div></div>';

    if (metal.status === 'idle') {
      if (metal.startIn > 0) {
        html += '<div class="metal-call">Start ' + h(metal.name) + ' furnace in<div class="timer">' + c.L('mStart', U.hms(metal.startIn)) + '</div><div class="timer-label">at ' + h(U.clock(metal.recommendedStart, now)) + (metal.estimated ? ' · estimate — depends on actual cool-down' : '') + '</div></div>';
        html += btn('metalStart', 'START METAL MELT', 'secondary xl');
      } else {
        html += '<div class="metal-call now">START ' + h((metal.name || 'metal').toUpperCase()) + ' FURNACE NOW' + (metal.startIn < -60000 ? '<div class="timer-label">recommended ' + h(U.clock(metal.recommendedStart, now)) + '</div>' : '') + '</div>';
        html += btn('metalStart', 'START METAL MELT', 'primary xl');
      }
    } else if (metal.status === 'heating') {
      const left = metal.expectedReadyAt - now;
      if (left > 0) {
        html += '<div class="metal-call">Expected metal readiness in<div class="timer">' + c.L('mReady', U.hms(left)) + '</div><div class="timer-label">≈ ' + h(U.clock(metal.expectedReadyAt, now)) + ' · estimate, not a measurement</div></div>';
      } else {
        html += '<div class="metal-call now">EXPECTED METAL READINESS<div class="timer-label">Check the temperature before confirming.</div></div>';
      }
      html += btn('metalReady', h((metal.name || 'metal').toUpperCase()) + ' AT POUR TEMPERATURE', left > 0 ? 'secondary xl' : 'primary xl');
    } else {
      html += '<p class="muted">Confirmed at ' + h(metal.targetC) + '°C at ' + h(U.clock(metal.readyAt, now)) + '.</p>';
    }
    html += '<div class="provrow">' + prov(run.profile.params.metalTargetC && run.profile.params.metalTargetC.sourceType, 'Pour temp') + prov(run.profile.params.metalHeatMinutes && run.profile.params.metalHeatMinutes.sourceType, 'Heat-up ' + U.dur(metal.heatMinutes)) + '</div>';
    if (metal.status !== 'idle') html += btn('metalReset', 'Reset metal status', 'ghost small');
    html += '</section>';
    return html;
  }

  CPT.UI.renderNow = renderNow;
})(globalThis.CPT = globalThis.CPT || {});
