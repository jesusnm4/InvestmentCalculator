/* app.js — state, form wiring, persistence, and rendering the results. */
(function () {
  'use strict';

  var STORAGE_KEY = 'investment-projection-v1';
  var COMPOUNDING = [
    { value: 'daily',   label: 'Daily' },
    { value: 'monthly', label: 'Monthly' },
    { value: 'yearly',  label: 'Yearly' }
  ];

  var el = {
    startingAmount: document.getElementById('starting-amount'),
    periodList:     document.getElementById('period-list'),
    periodEmpty:    document.getElementById('period-empty'),
    addPeriod:      document.getElementById('add-period'),
    windfallList:   document.getElementById('windfall-list'),
    windfallEmpty:  document.getElementById('windfall-empty'),
    addWindfall:    document.getElementById('add-windfall'),
    reset:          document.getElementById('reset-btn'),
    themeToggle:    document.getElementById('theme-toggle'),
    finalAmount:    document.getElementById('final-amount'),
    finalSub:       document.getElementById('final-sub'),
    contributed:    document.getElementById('kpi-contributed'),
    contributedNote: document.getElementById('kpi-contributed-note'),
    growth:         document.getElementById('kpi-growth'),
    growthNote:     document.getElementById('kpi-growth-note'),
    duration:       document.getElementById('kpi-duration'),
    durationNote:   document.getElementById('kpi-duration-note'),
    chart:          document.getElementById('chart'),
    legend:         document.getElementById('legend'),
    extrasLegend:   document.getElementById('extras-legend'),
    withdrawal:     document.getElementById('withdrawal-note'),
    tbody:          document.getElementById('breakdown-body')
  };

  var state = load() || defaultState();

  // ---------------------------------------------------------------- state

  function defaultState() {
    return {
      startingAmount: 10000,
      periods: [
        makePeriod(0, { name: 'Accumulation', months: 120, monthlyContribution: 500, annualRatePercent: 7 }),
        makePeriod(1, { name: 'Coasting',     months: 120, monthlyContribution: 0,   annualRatePercent: 5 })
      ],
      windfalls: []
    };
  }

  /* A one-off is anchored to an absolute month on the timeline, so it stays put
     when periods are edited or reordered. `at` seeds only the name. */
  function makeWindfall(at) {
    return {
      name: 'Extra ' + (at + 1), atMonth: 12, amount: 10000,
      repeatEvery: 0, repeatUntil: null, shapeSlot: nextShapeSlot()
    };
  }

  /* Stored per extra rather than derived from position, so deleting one does not
     reshuffle the others' markers — the same reason periods own a colorSlot.
     Prefers a shape nothing else is using. */
  function nextShapeSlot() {
    var used = state.windfalls.map(function (w) { return Math.max(0, Math.floor(Number(w.shapeSlot) || 0)); });
    for (var s = 0; s < Chart.shapeCount; s++) if (used.indexOf(s) < 0) return s;
    return state.windfalls.length % Chart.shapeCount;
  }

  // `at` is the position the period will occupy — it seeds the name and color.
  function makePeriod(at, over) {
    var p = {
      name: 'Period ' + (at + 1),
      months: 60,
      monthlyContribution: 500,
      annualRatePercent: 7,
      compounding: 'monthly',
      colorSlot: at % Chart.slotCount
    };
    for (var k in over) if (Object.prototype.hasOwnProperty.call(over, k)) p[k] = over[k];
    return p;
  }

  function save() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (e) { /* private mode */ }
  }

  function load() {
    var raw;
    try { raw = localStorage.getItem(STORAGE_KEY); } catch (e) { return null; }
    if (!raw) return null;
    try {
      var parsed = JSON.parse(raw);
      if (!parsed || !Array.isArray(parsed.periods)) return null;
      parsed.periods.forEach(function (p) {
        if (COMPOUNDING.map(function (c) { return c.value; }).indexOf(p.compounding) < 0) p.compounding = 'monthly';
        p.colorSlot = Math.max(0, Math.floor(Number(p.colorSlot) || 0)) % Chart.slotCount;
      });
      // Absent in state saved before one-offs existed — default rather than reject.
      if (!Array.isArray(parsed.windfalls)) parsed.windfalls = [];
      parsed.windfalls.forEach(function (w) {
        w.atMonth = Math.max(0, Math.floor(Number(w.atMonth) || 0));
        w.amount = Number(w.amount) || 0;
        // Absent before extras could repeat; 0 means "does not repeat".
        w.repeatEvery = Math.max(0, Math.floor(Number(w.repeatEvery) || 0));
        w.repeatUntil = (w.repeatUntil === null || w.repeatUntil === undefined || w.repeatUntil === '')
          ? null
          : Math.max(0, Math.floor(Number(w.repeatUntil) || 0));
        w.shapeSlot = Math.max(0, Math.floor(Number(w.shapeSlot) || 0)) % Chart.shapeCount;
      });
      return parsed;
    } catch (e) { return null; }
  }

  // ------------------------------------------------------------ rendering

  function periodMeta() {
    return state.periods.map(function (p, i) {
      return { name: p.name || ('Period ' + (i + 1)), colorSlot: p.colorSlot };
    });
  }

  /* One marker per occurrence — a repeat contributes several. Skips extras that
     never land and zero amounts, which would mark the chart for nothing. */
  function windfallMeta(projection) {
    var horizon = projection.totals.totalMonths;
    var out = [];
    state.windfalls.forEach(function (w, i) {
      if (projection.unappliedWindfalls.indexOf(i) >= 0) return;
      var amount = Number(w.amount) || 0;
      if (!amount) return;
      Calc.windfallMonths(w, horizon).forEach(function (mth) {
        if (mth <= horizon) {
          out.push({ name: w.name || ('Extra ' + (i + 1)), atMonth: mth, amount: amount, shapeSlot: w.shapeSlot });
        }
      });
    });
    return out;
  }

  function apyText(p) {
    var apy = Calc.effectiveAnnualYield(p.annualRatePercent, p.compounding);
    return 'Effective annual yield: ' + (apy * 100).toFixed(2) + '%';
  }

  /* Structural render: rebuilds every card. Only called on add / delete /
     reorder — typing in a field must not blow away the caret. */
  function renderPeriods() {
    el.periodList.innerHTML = '';
    el.periodEmpty.hidden = state.periods.length > 0;

    state.periods.forEach(function (p, i) {
      var li = document.createElement('li');
      li.className = 'period';
      li.dataset.index = i;
      li.style.setProperty('--period-color', Chart.colorFor(p.colorSlot));

      var compOptions = COMPOUNDING.map(function (c) {
        return '<option value="' + c.value + '"' + (c.value === p.compounding ? ' selected' : '') + '>' + c.label + '</option>';
      }).join('');

      var swatches = '';
      for (var s = 0; s < Chart.slotCount; s++) {
        swatches += '<button type="button" class="swatch" data-slot="' + s + '"' +
          ' style="background:' + Chart.colorFor(s) + '"' +
          ' aria-pressed="' + (s === p.colorSlot) + '"' +
          ' title="' + Chart.colorNames[s] + '" aria-label="' + Chart.colorNames[s] + '"></button>';
      }

      li.innerHTML =
        '<div class="period-head">' +
          '<span class="period-index">' + (i + 1) + '</span>' +
          '<input type="text" data-field="name" value="' + escapeAttr(p.name) + '" aria-label="Period name">' +
          '<button type="button" class="icon-btn" data-action="up" title="Move up" aria-label="Move up"' + (i === 0 ? ' disabled' : '') + '>&#9650;</button>' +
          '<button type="button" class="icon-btn" data-action="down" title="Move down" aria-label="Move down"' + (i === state.periods.length - 1 ? ' disabled' : '') + '>&#9660;</button>' +
          '<button type="button" class="icon-btn danger" data-action="delete" title="Delete period" aria-label="Delete period">&#10005;</button>' +
        '</div>' +
        '<div class="period-grid">' +
          '<div class="field">' +
            '<span class="field-label">Length (months)</span>' +
            '<span class="months-row">' +
              '<input type="number" min="0" step="1" data-field="months" aria-label="Length in months" value="' + escapeAttr(p.months) + '">' +
              '<button type="button" class="icon-btn" data-action="x12" title="Type a number of years, then click to convert it to months">&times;12</button>' +
            '</span>' +
            '<span class="months-note" data-role="months-note"></span>' +
          '</div>' +
          '<label class="field">' +
            '<span class="field-label">Contribution / month</span>' +
            '<span class="money"><span class="affix">$</span>' +
              '<input type="number" step="50" data-field="monthlyContribution" value="' + escapeAttr(p.monthlyContribution) + '">' +
            '</span>' +
          '</label>' +
          '<label class="field">' +
            '<span class="field-label">Annual growth</span>' +
            '<span class="pct"><span class="affix">%</span>' +
              '<input type="number" step="0.1" data-field="annualRatePercent" value="' + escapeAttr(p.annualRatePercent) + '">' +
            '</span>' +
          '</label>' +
          '<label class="field">' +
            '<span class="field-label">Compounding</span>' +
            '<select data-field="compounding">' + compOptions + '</select>' +
          '</label>' +
          '<div class="field wide">' +
            '<span class="field-label">Color</span>' +
            '<div class="swatches">' + swatches + '</div>' +
          '</div>' +
        '</div>' +
        '<p class="apy-note" data-role="apy"></p>' +
        '<p class="warn-note" data-role="warn" hidden></p>';

      el.periodList.appendChild(li);
      refreshCardNotes(li, p);
    });
  }

  // Non-structural bits that change as you type.
  function refreshCardNotes(li, p) {
    var months = Math.max(0, Math.floor(Number(p.months) || 0));
    li.querySelector('[data-role="months-note"]').textContent = months ? '= ' + Chart.durationLabel(months) : '';
    li.querySelector('[data-role="apy"]').textContent = apyText(p);
  }

  /* Structural render: rebuilds every row. Add / delete only — same rule as the
     period cards, since rebuilding mid-input would destroy the caret. */
  function renderWindfalls() {
    el.windfallList.innerHTML = '';
    el.windfallEmpty.hidden = state.windfalls.length > 0;

    state.windfalls.forEach(function (w, i) {
      var li = document.createElement('li');
      li.className = 'windfall';
      li.dataset.index = i;
      var repeats = Number(w.repeatEvery) > 0;

      li.innerHTML =
        '<div class="windfall-row">' +
          '<input type="text" data-field="name" value="' + escapeAttr(w.name) + '" aria-label="Extra name">' +
          '<button type="button" class="icon-btn danger" data-action="delete" title="Delete extra" aria-label="Delete extra">&#10005;</button>' +
        '</div>' +
        '<div class="windfall-grid">' +
          '<label class="field">' +
            '<span class="field-label">Amount</span>' +
            '<span class="money"><span class="affix">$</span>' +
              '<input type="number" step="1000" data-field="amount" value="' + escapeAttr(w.amount) + '">' +
            '</span>' +
          '</label>' +
          '<div class="field">' +
            '<span class="field-label">At month</span>' +
            '<span class="months-row">' +
              '<input type="number" min="0" step="1" data-field="atMonth" aria-label="At month" value="' + escapeAttr(w.atMonth) + '">' +
              '<button type="button" class="icon-btn" data-action="x12" title="Type a number of years, then click to convert it to months">&times;12</button>' +
            '</span>' +
          '</div>' +
        '</div>' +
        '<label class="repeat-toggle">' +
          '<input type="checkbox" data-field="repeat"' + (repeats ? ' checked' : '') + '> Repeat' +
        '</label>' +
        '<div class="repeat-fields"' + (repeats ? '' : ' hidden') + '>' +
          '<label class="field">' +
            '<span class="field-label">Every (months)</span>' +
            '<input type="number" min="1" step="1" data-field="repeatEvery" value="' + escapeAttr(w.repeatEvery || 12) + '">' +
          '</label>' +
          '<label class="field">' +
            '<span class="field-label">Until month</span>' +
            '<input type="number" min="0" step="1" placeholder="end" data-field="repeatUntil" value="' +
              (w.repeatUntil === null || w.repeatUntil === undefined ? '' : escapeAttr(w.repeatUntil)) + '">' +
          '</label>' +
        '</div>' +
        '<p class="months-note" data-role="at-note"></p>' +
        '<p class="warn-note" data-role="warn" hidden></p>';

      el.windfallList.appendChild(li);
    });
  }

  /* Reads the projection, so it lives with the results render rather than the
     structural one — an open-ended repeat's occurrence count depends on how long
     the periods actually run. */
  function refreshWindfallNotes(projection) {
    var horizon = projection.totals.totalMonths;

    state.windfalls.forEach(function (w, i) {
      var li = el.windfallList.children[i];
      if (!li) return;

      var months = Calc.windfallMonths(w, horizon).filter(function (mth) { return mth <= horizon; });
      var at = Math.max(0, Math.floor(Number(w.atMonth) || 0));
      var every = Math.max(0, Math.floor(Number(w.repeatEvery) || 0));
      var lands = at ? 'lands at ' + Chart.durationLabel(at) : 'lands today';
      if (every && months.length > 1) {
        lands += ', then every ' + Chart.durationLabel(every) +
                 ' — ' + months.length + ' payments';
      }
      li.querySelector('[data-role="at-note"]').textContent = lands;

      var warn = li.querySelector('[data-role="warn"]');
      var unapplied = projection.unappliedWindfalls.indexOf(i) >= 0;
      warn.hidden = !unapplied;
      if (unapplied) {
        warn.textContent = horizon
          ? 'Never lands — the projection ends at ' + Chart.durationLabel(horizon) + '.'
          : 'Never lands — there are no periods yet.';
      }
    });
  }

  function renderResults() {
    var projection = Calc.project(state);
    var t = projection.totals;

    el.finalAmount.textContent = Chart.money2.format(t.finalAmount);
    el.finalSub.textContent = t.totalMonths
      ? 'after ' + Chart.durationLabel(t.totalMonths) + ' across ' + state.periods.length +
        (state.periods.length === 1 ? ' period' : ' periods')
      : 'no periods yet';

    el.contributed.textContent = Chart.money2.format(t.totalContributed);
    // One-offs are money in too, so name them once they exist.
    el.contributedNote.textContent = t.totalWindfalls
      ? 'starting amount + contributions + extras'
      : 'starting amount + contributions';
    el.growth.textContent = Chart.money2.format(t.totalGrowth);
    el.growth.className = 'kpi-value ' + (t.totalGrowth > 0 ? 'up' : t.totalGrowth < 0 ? 'down' : '');
    el.growthNote.textContent = t.totalContributed > 0
      ? ((t.totalGrowth / t.totalContributed) * 100).toFixed(1) + '% of what you paid in'
      : ' ';
    el.duration.textContent = Chart.durationLabel(t.totalMonths);
    el.durationNote.textContent = t.totalMonths + ' monthly steps';

    // Truncation warnings live on the cards.
    projection.perPeriod.forEach(function (pp, i) {
      var li = el.periodList.children[i];
      if (!li) return;
      var warn = li.querySelector('[data-role="warn"]');
      warn.hidden = !pp.truncated;
      if (pp.truncated) {
        warn.textContent = 'Trimmed to ' + pp.months + ' months — the projection caps at ' +
          (Calc.MAX_TOTAL_MONTHS / 12) + ' years total.';
      }
    });

    refreshWindfallNotes(projection);
    renderWithdrawal(t.finalAmount);
    renderLegend(projection);
    renderExtrasLegend(projection);
    renderTable(projection);
    Chart.render(el.chart, projection, { periods: periodMeta(), windfalls: windfallMeta(projection) });
    lastChartWidth = el.chart.clientWidth;
  }

  /* The 4% rule, applied to whatever the projection ends on. Nothing to say
     when the balance never gets above zero. */
  function renderWithdrawal(finalAmount) {
    if (!(finalAmount > 0)) { el.withdrawal.hidden = true; return; }

    var w = Calc.safeWithdrawal(finalAmount);
    el.withdrawal.hidden = false;
    el.withdrawal.innerHTML =
      '<span class="lede">Under the ' + Calc.SAFE_WITHDRAWAL_PERCENT + '% rule, ' +
        Chart.money0.format(finalAmount) + ' would support about ' +
        '<strong>' + Chart.money0.format(w.perYear) + ' a year</strong> — roughly ' +
        '<strong>' + Chart.money2.format(w.perMonth) + ' a month</strong>.</span> ' +
      'The ' + Calc.SAFE_WITHDRAWAL_PERCENT + '% rule is a retirement rule of thumb ' +
      '(Bengen, 1994; the Trinity study, 1998): withdraw ' + Calc.SAFE_WITHDRAWAL_PERCENT +
      '% of the balance in the first year, then adjust that dollar amount for inflation ' +
      'each year after. Historically that has lasted a 30-year retirement — it assumes a ' +
      'stock-and-bond portfolio and is a rough guide, not a guarantee.';
  }

  function renderLegend(projection) {
    if (!state.periods.length) { el.legend.innerHTML = ''; return; }
    el.legend.innerHTML = state.periods.map(function (p, i) {
      var pp = projection.perPeriod[i];
      return '<span class="legend-item">' +
        '<span class="legend-dot" style="background:' + Chart.colorFor(p.colorSlot) + '"></span>' +
        escapeHtml(p.name || ('Period ' + (i + 1))) +
        '<span style="color:var(--muted)">· ' + Chart.durationLabel(pp ? pp.months : 0) + '</span>' +
        '</span>';
    }).join('');
  }

  /* A separate, quieter key. Extras annotate the curve rather than being series
     of their own, so they sit below the period legend instead of inside it. */
  function renderExtrasLegend(projection) {
    var horizon = projection.totals.totalMonths;
    var items = state.windfalls.map(function (w, i) {
      if (projection.unappliedWindfalls.indexOf(i) >= 0) return null;
      var amount = Number(w.amount) || 0;
      if (!amount) return null;

      var months = Calc.windfallMonths(w, horizon).filter(function (mth) { return mth <= horizon; });
      if (!months.length) return null;

      var every = Math.max(0, Math.floor(Number(w.repeatEvery) || 0));
      var when = (every && months.length > 1)
        ? 'every ' + Chart.durationLabel(every) + ' &middot; ' + months.length + '&times;'
        : 'at ' + Chart.durationLabel(months[0]);

      return {
        at: months[0],
        html: '<span class="extra-item">' + Chart.shapeGlyph(w.shapeSlot) +
          escapeHtml(w.name || ('Extra ' + (i + 1))) +
          '<span class="extra-meta">' + Chart.money0.format(amount) + ' &middot; ' + when + '</span>' +
          '</span>'
      };
    }).filter(Boolean)
      // Chart order, not edit order — a key should scan the way the chart reads.
      .sort(function (a, b) { return a.at - b.at; })
      .map(function (it) { return it.html; });

    el.extrasLegend.hidden = !items.length;
    el.extrasLegend.innerHTML = items.join('');
  }

  function renderTable(projection) {
    if (!state.periods.length) {
      el.tbody.innerHTML = '<tr class="empty"><td colspan="7">Add a period to see the breakdown.</td></tr>';
      return;
    }
    var rows = projection.perPeriod.map(function (pp, i) {
      var p = state.periods[i];
      var sign = pp.growth < 0 ? 'neg' : pp.growth > 0 ? 'pos' : '';
      return '<tr>' +
        '<td><span class="swatch-dot" style="background:' + Chart.colorFor(p.colorSlot) + '"></span>' +
          escapeHtml(p.name || ('Period ' + (i + 1))) + '</td>' +
        '<td class="num">' + Chart.durationLabel(pp.months) + '</td>' +
        '<td class="num">' + (Number(p.annualRatePercent) || 0) + '% ' +
          '<span style="color:var(--muted)">' + escapeHtml(p.compounding) + '</span></td>' +
        '<td class="num">' + Chart.money0.format(pp.contributed) + '</td>' +
        '<td class="num ' + extraSign(pp.windfalls) + '">' + extraText(pp.windfalls) + '</td>' +
        '<td class="num ' + sign + '">' + Chart.money0.format(pp.growth) + '</td>' +
        '<td class="num">' + Chart.money0.format(pp.endBalance) + '</td>' +
      '</tr>';
    });

    var t = projection.totals;
    rows.push('<tr class="total-row">' +
      '<td>Total</td>' +
      '<td class="num">' + Chart.durationLabel(t.totalMonths) + '</td>' +
      '<td class="num">&mdash;</td>' +
      '<td class="num">' + Chart.money0.format(t.totalContributed - t.totalWindfalls) + '</td>' +
      '<td class="num ' + extraSign(t.totalWindfalls) + '">' + extraText(t.totalWindfalls) + '</td>' +
      '<td class="num ' + (t.totalGrowth < 0 ? 'neg' : t.totalGrowth > 0 ? 'pos' : '') + '">' +
        Chart.money0.format(t.totalGrowth) + '</td>' +
      '<td class="num">' + Chart.money0.format(t.finalAmount) + '</td>' +
    '</tr>');

    el.tbody.innerHTML = rows.join('');
  }

  // A zero extra reads better as a dash than as $0.
  function extraText(v) { return v ? Chart.money0.format(v) : '&mdash;'; }
  function extraSign(v) { return v < 0 ? 'neg' : v > 0 ? 'pos' : ''; }

  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c];
    });
  }
  function escapeAttr(s) {
    return escapeHtml(s).replace(/"/g, '&quot;');
  }

  // -------------------------------------------------------------- events

  el.startingAmount.addEventListener('input', function () {
    state.startingAmount = this.value === '' ? 0 : Number(this.value);
    save();
    renderResults();
  });

  el.periodList.addEventListener('input', function (ev) {
    var input = ev.target.closest('[data-field]');
    if (!input) return;
    var li = ev.target.closest('.period');
    var p = state.periods[Number(li.dataset.index)];
    var field = input.dataset.field;

    if (field === 'name' || field === 'compounding') {
      p[field] = input.value;
    } else {
      p[field] = input.value === '' ? 0 : Number(input.value);
    }

    refreshCardNotes(li, p);
    save();
    renderResults();
  });

  el.periodList.addEventListener('click', function (ev) {
    var swatch = ev.target.closest('.swatch');
    var li = ev.target.closest('.period');
    if (!li) return;
    var index = Number(li.dataset.index);

    if (swatch) {
      state.periods[index].colorSlot = Number(swatch.dataset.slot);
      li.style.setProperty('--period-color', Chart.colorFor(state.periods[index].colorSlot));
      li.querySelectorAll('.swatch').forEach(function (b) {
        b.setAttribute('aria-pressed', String(b === swatch));
      });
      save();
      renderResults();
      return;
    }

    var btn = ev.target.closest('[data-action]');
    if (!btn) return;
    var action = btn.dataset.action;

    if (action === 'delete') {
      state.periods.splice(index, 1);
    } else if (action === 'up' && index > 0) {
      state.periods.splice(index - 1, 0, state.periods.splice(index, 1)[0]);
    } else if (action === 'down' && index < state.periods.length - 1) {
      state.periods.splice(index + 1, 0, state.periods.splice(index, 1)[0]);
    } else if (action === 'x12') {
      // "Type years, click to convert."
      var input = li.querySelector('[data-field="months"]');
      var months = Math.max(0, Math.floor(Number(input.value) || 0)) * 12;
      state.periods[index].months = months;
      input.value = months;
      refreshCardNotes(li, state.periods[index]);
      save();
      renderResults();
      return;
    } else {
      return;
    }

    save();
    renderPeriods();
    renderResults();
  });

  el.windfallList.addEventListener('input', function (ev) {
    var input = ev.target.closest('[data-field]');
    if (!input) return;
    var li = ev.target.closest('.windfall');
    var w = state.windfalls[Number(li.dataset.index)];
    var field = input.dataset.field;

    if (field === 'repeat') {
      // The checkbox is a view of repeatEvery: 0 means "does not repeat".
      var everyInput = li.querySelector('[data-field="repeatEvery"]');
      w.repeatEvery = input.checked ? Math.max(1, Math.floor(Number(everyInput.value) || 12)) : 0;
      li.querySelector('.repeat-fields').hidden = !input.checked;
    } else if (field === 'repeatEvery') {
      w.repeatEvery = Math.max(1, Math.floor(Number(input.value) || 1));
    } else if (field === 'repeatUntil') {
      // Empty means "to the end of the projection" — not month zero.
      w.repeatUntil = input.value === '' ? null : Math.max(0, Math.floor(Number(input.value)));
    } else if (field === 'name') {
      w.name = input.value;
    } else {
      w[field] = input.value === '' ? 0 : Number(input.value);
    }

    save();
    renderResults();
  });

  el.windfallList.addEventListener('click', function (ev) {
    var btn = ev.target.closest('[data-action]');
    var li = ev.target.closest('.windfall');
    if (!btn || !li) return;
    var index = Number(li.dataset.index);

    if (btn.dataset.action === 'x12') {
      // "Type years, click to convert." Same affordance as a period's length.
      var input = li.querySelector('[data-field="atMonth"]');
      var months = Math.max(0, Math.floor(Number(input.value) || 0)) * 12;
      state.windfalls[index].atMonth = months;
      input.value = months;
      save();
      renderResults();
      return;
    }

    if (btn.dataset.action !== 'delete') return;
    state.windfalls.splice(index, 1);
    save();
    renderWindfalls();
    renderResults();
  });

  el.addWindfall.addEventListener('click', function () {
    state.windfalls.push(makeWindfall(state.windfalls.length));
    save();
    renderWindfalls();
    renderResults();
    var added = el.windfallList.lastElementChild;
    if (added) added.querySelector('[data-field="name"]').focus();
  });

  el.addPeriod.addEventListener('click', function () {
    var last = state.periods[state.periods.length - 1];
    state.periods.push(makePeriod(state.periods.length, last ? {
      months: last.months,
      monthlyContribution: last.monthlyContribution,
      annualRatePercent: last.annualRatePercent,
      compounding: last.compounding
    } : {}));
    save();
    renderPeriods();
    renderResults();
    var added = el.periodList.lastElementChild;
    if (added) added.querySelector('[data-field="name"]').focus();
  });

  el.reset.addEventListener('click', function () {
    if (!confirm('Reset to the example projection? Your current periods will be lost.')) return;
    try { localStorage.removeItem(STORAGE_KEY); } catch (e) { /* ignore */ }
    state = defaultState();
    el.startingAmount.value = state.startingAmount;
    save();
    renderPeriods();
    renderWindfalls();
    renderResults();
  });

  // Re-render the chart on resize (width only — height is fixed, and reacting to
  // height would feed the ResizeObserver its own output) and on theme flips.
  var lastChartWidth = 0;
  if (typeof ResizeObserver === 'function') {
    new ResizeObserver(function () {
      if (el.chart.clientWidth !== lastChartWidth) renderResults();
    }).observe(el.chart);
  } else {
    window.addEventListener('resize', renderResults);
  }

  /* Theme. Every series color comes from js/chart.js, so a theme change means
     re-rendering the swatches and the chart, not just swapping CSS variables. */
  function repaintForTheme() {
    el.themeToggle.querySelectorAll('[data-theme-choice]').forEach(function (b) {
      b.setAttribute('aria-pressed', String(b.dataset.themeChoice === Theme.get()));
    });
    renderPeriods();
    renderWindfalls();
    renderResults();
  }

  el.themeToggle.addEventListener('click', function (ev) {
    var btn = ev.target.closest('[data-theme-choice]');
    if (!btn) return;
    Theme.set(btn.dataset.themeChoice);
    repaintForTheme();
  });

  Theme.onSystemChange(repaintForTheme);

  // --------------------------------------------------------------- start
  el.startingAmount.value = state.startingAmount;
  repaintForTheme();
})();
