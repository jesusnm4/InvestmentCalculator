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
    income:         document.getElementById('kpi-income'),
    incomeNote:     document.getElementById('kpi-income-note'),
    chart:          document.getElementById('chart'),
    legend:         document.getElementById('legend'),
    extrasLegend:   document.getElementById('extras-legend'),
    withdrawal:     document.getElementById('withdrawal-note'),
    tbody:          document.getElementById('breakdown-body'),
    hero:           document.querySelector('.hero'),
    resultBar:      document.getElementById('result-bar'),
    resultBarValue: document.getElementById('result-bar-value'),
    toast:          document.getElementById('toast'),
    toastText:      document.getElementById('toast-text'),
    toastUndo:      document.getElementById('toast-undo'),
    liveSummary:    document.getElementById('live-summary'),
    exampleNote:    document.getElementById('example-note'),
    finalLabel:     document.getElementById('final-label'),
    moneyMode:      document.getElementById('money-mode'),
    inflation:      document.getElementById('inflation'),
    inflationField: document.getElementById('inflation-field'),
    depletionWarn:  document.getElementById('depletion-warn'),
    keepBaseline:   document.getElementById('keep-baseline'),
    clearBaseline:  document.getElementById('clear-baseline'),
    baselineDelta:  document.getElementById('baseline-delta'),
    growthLabel:    document.getElementById('kpi-growth-label'),
    thirdLabel:     document.getElementById('kpi-third-label'),
    leverNote:      document.getElementById('lever-note'),
    thead:          document.getElementById('breakdown-head'),
    undoLink:       document.getElementById('undo-link')
  };

  var DEFAULT_INFLATION = 2.5;

  // Drawn, not typed: unicode arrows and crosses render at different weights.
  var ICON = {
    up:    '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M4 10l4-4 4 4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    down:  '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    close: '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M4.5 4.5l7 7M11.5 4.5l-7 7" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>'
  };

  /* Which period cards have "More options" open. Keyed by the period object, so
     it follows a card through reorders; not persisted — it is view state. */
  var openOptions = typeof WeakSet === 'function' ? new WeakSet() : null;

  var state = load() || defaultState();

  // ---------------------------------------------------------------- state

  function defaultState() {
    return {
      startingAmount: 10000,
      periods: [
        makePeriod(0, { name: 'Saving',          months: 120, monthlyContribution: 500, annualRatePercent: 7 }),
        makePeriod(1, { name: 'Letting it grow', months: 120, monthlyContribution: 0,   annualRatePercent: 5 }),
        // Retirement is where the question "will it last?" lives, so the example shows it.
        makePeriod(2, { name: 'Retirement',      months: 300, annualRatePercent: 4, monthlyContribution: 0,
                        flow: 'withdraw', withdrawUnit: 'percent', withdrawPercent: 4 })
      ],
      windfalls: [],
      // Untouched example: the page says so until the first edit.
      isExample: true,
      // A plan input, not just a display setting: withdrawals rise with it.
      inflationPercent: DEFAULT_INFLATION,
      view: defaultView(),
      baseline: null,
      baselineSeen: false
    };
  }

  /* How amounts are shown. Today's dollars by default: a future dollar buys less,
     and a non-expert reading "$1M in 30 years" should not have to correct for it. */
  function defaultView() {
    return { money: 'today' };
  }

  /* A one-off is anchored to an absolute month on the timeline, so it stays put
     when periods are edited or reordered. `at` seeds only the name. */
  function makeWindfall(at) {
    return {
      // Starts at $0: adding an extra must not change the answer until you say how much.
      name: 'Extra ' + (at + 1), atMonth: 12, amount: 0,
      repeatEvery: 0, repeatUntil: null, shapeSlot: nextShapeSlot(),
      atUnit: 'years', everyUnit: 'years', untilUnit: 'years'
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

  /* A color nothing else is using, so a ninth season never silently shares a
     hue with the first (color means "which season"). Least-used once all eight
     are taken. */
  function nextColorSlot() {
    var counts = [];
    for (var c = 0; c < Chart.slotCount; c++) counts.push(0);
    state.periods.forEach(function (p) { counts[p.colorSlot % Chart.slotCount]++; });
    var best = 0;
    for (var s2 = 1; s2 < counts.length; s2++) if (counts[s2] < counts[best]) best = s2;
    return best;
  }

  // `at` is the position the period will occupy — it seeds the name and color.
  function makePeriod(at, over) {
    var p = {
      name: 'Season ' + (at + 1),
      months: 60,
      monthlyContribution: 500,
      // Saving adds the amount each month; withdrawing takes it out.
      flow: 'save',
      // Withdrawing only: a fixed amount of today's dollars, or the 4% rule.
      withdrawUnit: 'percent',
      withdrawPercent: Calc.SAFE_WITHDRAWAL_PERCENT,
      annualRatePercent: 7,
      compounding: 'monthly',
      lengthUnit: 'years',
      colorSlot: at % Chart.slotCount
    };
    for (var k in over) if (Object.prototype.hasOwnProperty.call(over, k)) p[k] = over[k];
    return p;
  }

  /* Time fields are typed in years or months, but state always holds months —
     the unit is only how a field displays. UNIT_KEY names the property that
     remembers each field's unit. */
  var UNIT_KEY = { months: 'lengthUnit', atMonth: 'atUnit', repeatEvery: 'everyUnit', repeatUntil: 'untilUnit' };

  // An unknown unit (older saved state) shows years when that reads cleanly.
  function unitOf(unit, months) {
    if (unit === 'years' || unit === 'months') return unit;
    return Math.floor(Number(months) || 0) % 12 === 0 ? 'years' : 'months';
  }
  // Two decimals of a year round-trip to the same whole month.
  function timeDisplay(months, unit) {
    if (months === null || months === undefined || months === '') return '';
    return unit === 'years' ? String(Number((Number(months) / 12).toFixed(2))) : String(months);
  }
  function timeFromInput(value, unit) {
    var n = Number(value) || 0;
    return Math.max(0, Math.round(unit === 'years' ? n * 12 : n));
  }

  /* A number with its unit picker inside the field, like the $ and % affixes. */
  function timeField(field, months, unit, label, extra) {
    return '<span class="unit-field">' +
      '<input type="number" min="0" data-field="' + field + '"' + timeInputAttrs(unit) +
        ' aria-label="' + label + '" value="' + escapeAttr(timeDisplay(months, unit)) + '"' + (extra || '') + '>' +
      '<span class="unit-select"><select data-unit="' + field + '" aria-label="' + label + ' unit">' +
        '<option value="years"' + (unit === 'years' ? ' selected' : '') + '>years</option>' +
        '<option value="months"' + (unit === 'months' ? ' selected' : '') + '>months</option>' +
      '</select></span>' +
    '</span>';
  }
  function timeInputAttrs(unit) {
    return unit === 'years' ? ' step="any" inputmode="decimal"' : ' step="1" inputmode="numeric"';
  }

  /* Switching unit converts what the field shows; the months underneath stay
     put, so nothing about the plan changes. */
  function switchUnit(li, item, select) {
    var field = select.dataset.unit;
    var unit = select.value;
    item[UNIT_KEY[field]] = unit;
    var input = li.querySelector('[data-field="' + field + '"]');
    input.value = timeDisplay(item[field], unit);
    input.step = unit === 'years' ? 'any' : '1';
    input.inputMode = unit === 'years' ? 'decimal' : 'numeric';
  }

  /* Every edit to the plan ends the example. View changes (money mode, baseline)
     pass keepExample, since they do not change the plan itself. */
  function save(keepExample) {
    if (!keepExample) state.isExample = false;
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (e) { /* private mode */ }
    el.exampleNote.hidden = !state.isExample;
    el.reset.hidden = !!state.isExample;
  }

  function load() {
    var raw;
    try { raw = localStorage.getItem(STORAGE_KEY); } catch (e) { return null; }
    if (!raw) return null;
    try {
      var parsed = JSON.parse(raw);
      if (!parsed || !Array.isArray(parsed.periods)) return null;
      parsed.periods.forEach(function (p) {
        // Absent before lengths could be typed in years.
        p.lengthUnit = unitOf(p.lengthUnit, p.months);
        if (COMPOUNDING.map(function (c) { return c.value; }).indexOf(p.compounding) < 0) p.compounding = 'monthly';
        p.colorSlot = Math.max(0, Math.floor(Number(p.colorSlot) || 0)) % Chart.slotCount;
        // Absent before Save / Withdraw: a negative amount was a withdrawal.
        var amt = Number(p.monthlyContribution) || 0;
        if (p.flow !== 'save' && p.flow !== 'withdraw') p.flow = amt < 0 ? 'withdraw' : 'save';
        p.monthlyContribution = Math.abs(amt);
        // Absent before the 4% rule option: older withdrawals were fixed amounts.
        if (p.withdrawUnit !== 'percent' && p.withdrawUnit !== 'dollars') p.withdrawUnit = amt ? 'dollars' : 'percent';
        var pct = Number(p.withdrawPercent);
        p.withdrawPercent = isFinite(pct) && pct >= 0 && pct <= 100 ? pct : Calc.SAFE_WITHDRAWAL_PERCENT;
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
        w.atUnit = unitOf(w.atUnit, w.atMonth);
        w.everyUnit = unitOf(w.everyUnit, w.repeatEvery || 12);
        w.untilUnit = unitOf(w.untilUnit, w.repeatUntil || 0);
      });
      parsed.isExample = parsed.isExample === true;
      parsed.baselineSeen = parsed.baselineSeen === true;
      // Absent before amounts could be shown in today's dollars.
      var v = parsed.view || {};
      // Inflation moved from the view into the plan once withdrawals came to depend on it.
      var infl = Number(parsed.inflationPercent !== undefined ? parsed.inflationPercent : v.inflationPercent);
      parsed.inflationPercent = isFinite(infl) && infl >= 0 && infl <= 50 ? infl : DEFAULT_INFLATION;
      parsed.view = { money: v.money === 'future' ? 'future' : 'today' };
      // A kept baseline is a list of month-end balances; anything else is dropped.
      var b = parsed.baseline;
      parsed.baseline = (b && Array.isArray(b.balances) && b.balances.length > 1 &&
        b.balances.length <= Calc.MAX_TOTAL_MONTHS + 1 &&
        b.balances.every(function (x) { return typeof x === 'number' && isFinite(x); }))
        ? { balances: b.balances } : null;
      return parsed;
    } catch (e) { return null; }
  }

  // ------------------------------------------------------------ rendering

  function periodMeta() {
    return state.periods.map(function (p, i) {
      return { name: seasonName(p, i), colorSlot: p.colorSlot };
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
      /* A long-running repeat would bead the whole curve with markers; past two
         dozen, show every Nth (always the first and last) — the key below the
         chart still counts them all. */
      var months = Calc.windfallMonths(w, horizon).filter(function (mth) { return mth <= horizon; });
      var step = months.length > 24 ? Math.ceil(months.length / 24) : 1;
      months.forEach(function (mth, k) {
        if (k % step && k !== months.length - 1) return;
        out.push({ name: w.name || ('Extra ' + (i + 1)), atMonth: mth, amount: viewMoney(amount, mth), shapeSlot: w.shapeSlot });
      });
    });
    return out;
  }

  // The timeline node: the season's color, deepened only where its number needs it.
  function setNodeColors(li, slot) {
    var c = Chart.nodeColors(slot);
    li.style.setProperty('--node-fill', c.fill);
    li.style.setProperty('--node-ink', c.ink);
  }

  function seasonName(p, i) { return p.name || ('Season ' + (i + 1)); }

  // Money of the current view: today's dollars divide by inflation up to month m.
  function viewMoney(amount, month) {
    return state.view.money === 'today' ? amount / Calc.deflator(month, state.inflationPercent) : amount;
  }

  function apyText(p) {
    var apy = Calc.effectiveAnnualYield(p.annualRatePercent, p.compounding);
    return 'Works out to ' + (apy * 100).toFixed(2) + '% a year once compounding is counted.';
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
      setNodeColors(li, p.colorSlot);
      /* Eight hues, and a ninth season shares one: its node turns hollow so the
         two never read as the same season. */
      var reused = state.periods.slice(0, i).some(function (q) { return q.colorSlot % Chart.slotCount === p.colorSlot % Chart.slotCount; });
      li.classList.toggle('color-reused', reused);

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

      var n = i + 1;
      var open = openOptions && openOptions.has(p);
      li.innerHTML =
        '<span class="period-node" aria-hidden="true">' + n + '</span>' +
        '<div class="period-head">' +
          '<input type="text" data-field="name" value="' + escapeAttr(p.name) + '" aria-label="Season ' + n + ' name">' +
          '<button type="button" class="icon-btn" data-action="up" title="Move up" aria-label="Move season ' + n + ' up"' + (i === 0 ? ' disabled' : '') + '>' + ICON.up + '</button>' +
          '<button type="button" class="icon-btn" data-action="down" title="Move down" aria-label="Move season ' + n + ' down"' + (i === state.periods.length - 1 ? ' disabled' : '') + '>' + ICON.down + '</button>' +
          '<button type="button" class="icon-btn danger" data-action="delete" title="Delete season" aria-label="Delete season ' + n + '">' + ICON.close + '</button>' +
        '</div>' +
        '<p class="period-range" data-role="range"></p>' +
        '<div class="period-grid">' +
          '<div class="field">' +
            '<span class="field-label">Length</span>' +
            timeField('months', p.months, unitOf(p.lengthUnit, p.months), 'Length, season ' + n) +
            '<span class="months-note" data-role="months-note"></span>' +
          '</div>' +
          '<label class="field">' +
            '<span class="field-label">Expected yearly return</span>' +
            '<span class="pct"><span class="affix">%</span>' +
              '<input type="number" step="0.1" data-field="annualRatePercent" aria-label="Expected yearly return, season ' + n + '" value="' + escapeAttr(p.annualRatePercent) + '">' +
            '</span>' +
            // Said once, on the first card, where the question first comes up.
          '</label>' +
          '<div class="field wide">' +
            '<span class="field-label" id="flow-label-' + n + '">Each month</span>' +
            '<div class="flow-row">' +
              // One visible choice: what the season does with money, and for withdrawals how.
              '<div class="segmented" role="group" aria-labelledby="flow-label-' + n + '">' +
                flowButton(p, 'save', 'Save') +
                flowButton(p, 'percent', 'Withdraw %') +
                flowButton(p, 'dollars', 'Withdraw $') +
              '</div>' +
              amountField(p, n) +
            '</div>' +
            '<p class="field-note" data-role="flow-note"></p>' +
          '</div>' +
          // Said once, on the first card, where the question first comes up.
          (i === 0 ? '<div class="field-note wide">Enter returns before inflation; the results take it off for you. ' +
            '<details class="hint-more"><summary>What\u2019s typical?</summary>' +
            'The S&amp;P 500 has averaged about 10% a year before inflation since the 1920s (about 7% after); ' +
            'a mix with bonds usually earns less. Past returns don\u2019t guarantee future ones.</details></div>' : '') +
        '</div>' +
        '<details class="more" data-role="more"' + (open ? ' open' : '') + '>' +
          '<summary>More options <span class="more-sum" data-role="more-sum"></span></summary>' +
          '<div class="more-body">' +
            '<label class="field">' +
              '<span class="field-label">Compounding</span>' +
              '<select data-field="compounding">' + compOptions + '</select>' +
            '</label>' +
            '<p class="apy-note" data-role="apy"></p>' +
            '<div class="field">' +
              '<span class="field-label" id="color-label-' + n + '">Color on the chart</span>' +
              '<div class="swatches" role="group" aria-labelledby="color-label-' + n + '">' + swatches + '</div>' +
            '</div>' +
          '</div>' +
        '</details>' +
        '<p class="warn-note" data-role="warn" hidden></p>';

      var more = li.querySelector('[data-role="more"]');
      more.addEventListener('toggle', function () {
        if (!openOptions) return;
        if (more.open) openOptions.add(p); else openOptions.delete(p);
      });

      el.periodList.appendChild(li);
      refreshCardNotes(li, p);
    });
  }

  // Which of Save / Withdraw % / Withdraw $ a season is.
  function flowMode(p) {
    return p.flow !== 'withdraw' ? 'save' : p.withdrawUnit === 'dollars' ? 'dollars' : 'percent';
  }
  function flowButton(p, mode, label) {
    return '<button type="button" data-flow="' + mode + '" aria-pressed="' + (flowMode(p) === mode) + '">' + label + '</button>';
  }

  /* The monthly amount, with its unit as a plain affix: dollars to save, a
     percent under the 4% rule, or a fixed amount of today's dollars. */
  function amountField(p, n) {
    var mode = flowMode(p);
    if (mode === 'percent') {
      return '<span class="pct"><span class="affix">%</span>' +
        '<input type="number" min="0" step="0.1" inputmode="decimal" data-field="withdrawPercent" aria-label="Percent withdrawn, season ' + n + '"' +
        ' value="' + escapeAttr(p.withdrawPercent) + '"></span>';
    }
    return '<span class="money"><span class="affix">$</span>' +
      '<input type="number" min="0" step="50" data-field="monthlyContribution" aria-label="' +
        (mode === 'save' ? 'Amount saved each month' : 'Amount withdrawn each month, in today’s dollars') + ', season ' + n + '"' +
      ' value="' + escapeAttr(Math.abs(Number(p.monthlyContribution) || 0)) + '"></span>';
  }

  // Non-structural bits that change as you type.
  function refreshCardNotes(li, p) {
    var months = Math.max(0, Math.floor(Number(p.months) || 0));
    // The note gives the other unit, so the conversion is always visible.
    li.querySelector('[data-role="months-note"]').textContent = !months ? ''
      : unitOf(p.lengthUnit, p.months) === 'years'
        ? '= ' + months + (months === 1 ? ' month' : ' months')
        : '= ' + Chart.durationLabel(months);
    li.querySelector('[data-role="apy"]').textContent = apyText(p);
    var comp = COMPOUNDING.filter(function (c) { return c.value === p.compounding; })[0];
    li.querySelector('[data-role="more-sum"]').textContent =
      '· ' + (comp ? comp.label.toLowerCase() : 'monthly') + ' compounding, ' +
      Chart.colorNames[p.colorSlot % Chart.slotCount].toLowerCase();
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
          '<span class="extra-glyph-wrap" title="' + Chart.shapeNames[w.shapeSlot % Chart.shapeCount] + ' on the chart">' +
            Chart.shapeGlyph(w.shapeSlot, 14) + '</span>' +
          '<input type="text" data-field="name" value="' + escapeAttr(w.name) + '" aria-label="Extra ' + (i + 1) + ' name">' +
          '<button type="button" class="icon-btn danger" data-action="delete" title="Delete extra" aria-label="Delete extra ' + (i + 1) + '">' + ICON.close + '</button>' +
        '</div>' +
        '<div class="windfall-grid">' +
          '<label class="field">' +
            '<span class="field-label">Amount</span>' +
            '<span class="money"><span class="affix">$</span>' +
              '<input type="number" step="1000" data-field="amount" placeholder="0" aria-label="Amount, extra ' + (i + 1) + '" value="' + (Number(w.amount) ? escapeAttr(w.amount) : '') + '">' +
            '</span>' +
          '</label>' +
          '<div class="field">' +
            '<span class="field-label">At</span>' +
            timeField('atMonth', w.atMonth, unitOf(w.atUnit, w.atMonth), 'At') +
          '</div>' +
        '</div>' +
        '<label class="repeat-toggle">' +
          '<input type="checkbox" data-field="repeat"' + (repeats ? ' checked' : '') + '> Repeat' +
        '</label>' +
        '<div class="repeat-fields"' + (repeats ? '' : ' hidden') + '>' +
          '<div class="field">' +
            '<span class="field-label">Every</span>' +
            timeField('repeatEvery', w.repeatEvery || 12, unitOf(w.everyUnit, w.repeatEvery || 12), 'Every') +
          '</div>' +
          '<div class="field">' +
            '<span class="field-label">Until <span class="field-aside">(blank: to the end)</span></span>' +
            timeField('repeatUntil', w.repeatUntil, unitOf(w.untilUnit, w.repeatUntil || 0), 'Until') +
          '</div>' +
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
      var within = periodAt(projection, at);
      var lands = at
        ? 'Lands at ' + Chart.durationLabel(at) + (within ? ', during ' + within : '')
        : 'Lands at the start';
      if (every && months.length > 1) {
        var amount = Number(w.amount) || 0;
        lands += ', then every ' + Chart.durationLabel(every) + ' \u2014 ' + months.length + ' payments' +
                 (amount ? ', ' + Chart.money0.format(amount * months.length) + ' in total' +
                   (state.view.money === 'today' && Number(state.inflationPercent) > 0
                     ? ' (worth ' + Chart.money0.format(months.reduce(function (sum, mth) {
                         return sum + amount / Calc.deflator(mth, state.inflationPercent);
                       }, 0)) + ' today)'
                     : '')
                 : '');
      }
      li.querySelector('[data-role="at-note"]').textContent = lands;

      var warn = li.querySelector('[data-role="warn"]');
      var unapplied = projection.unappliedWindfalls.indexOf(i) >= 0;
      warn.hidden = !unapplied;
      if (unapplied) {
        warn.textContent = horizon
          ? 'Never lands — the projection ends at ' + Chart.durationLabel(horizon) + '.'
          : 'Never lands \u2014 there are no seasons yet.';
      }
    });
  }

  /* The period an extra at absolute month `m` falls in — it lands at month end,
     so a period owns months startMonth+1 … endMonth. */
  function periodAt(projection, m) {
    for (var i = 0; i < projection.perPeriod.length; i++) {
      var pp = projection.perPeriod[i];
      if (m > pp.startMonth && m <= pp.endMonth) {
        return seasonName(state.periods[i], i);
      }
    }
    return '';
  }

  function renderResults() {
    var nominal = Calc.project(state);
    var today = state.view.money === 'today';
    // Everything shown below reads `projection`: the plan restated in the chosen money.
    var projection = today ? Calc.inTodaysDollars(nominal, state.inflationPercent) : nominal;
    var t = projection.totals;
    var depleted = t.depletedAt !== null;
    var short = t.finalAmount < 0;
    // Once a season withdraws, the question is no longer "how much" but "will it last".
    // Withdrawing seasons that actually get time (one past the 100-year cap gets none).
    var drawing = nominal.perPeriod.filter(function (pp, i) { return pp.months > 0 && Calc.isWithdrawing(state.periods[i]); });
    var drawdown = t.totalMonths > 0 && drawing.length > 0;
    var moneyNote = today ? 'today\u2019s dollars at ' + state.inflationPercent + '% inflation' : 'future dollars';
    var seasons = state.periods.length + (state.periods.length === 1 ? ' season' : ' seasons');
    // How far into its season the money runs out: "7y 6m into Retirement".
    var runsOut = '';
    if (depleted) {
      var inSeason = seasonAt(projection, t.depletedAt);
      runsOut = inSeason
        ? 'Runs out ' + Chart.durationLabel(t.depletedAt - inSeason.pp.startMonth) + ' into ' + inSeason.name
        : 'Runs out at ' + Chart.durationLabel(t.depletedAt);
    }

    if (drawdown) {
      el.finalLabel.textContent = 'Will it last?';
      // "Lasts through Retirement", not "lasts all 45 yrs": the saving years are not the question.
      var lastDraw = drawing[drawing.length - 1];
      var drawMonths = drawing.reduce(function (sum, pp) { return sum + pp.months; }, 0);
      var through = 'Lasts through ' + seasonName(state.periods[lastDraw.index], lastDraw.index);
      el.finalAmount.textContent = depleted ? runsOut : through;
      // One line: where it ends, then the frame (withdrawal years, money).
      el.finalSub.textContent = (depleted
        ? 'Year ' + (Math.floor(t.depletedAt / 12) + 1) + ' of the plan'
        : Chart.money0.format(t.finalAmount) + ' left at the end') +
        ' \u00b7 ' + Chart.durationLabel(drawMonths) + ' of withdrawals \u00b7 ' + moneyNote;
      el.resultBarValue.textContent = depleted ? runsOut : 'Lasts \u00b7 ' + Chart.money0.format(t.finalAmount) + ' left';
    } else {
      el.finalLabel.textContent = short ? 'Shortfall at the end' : 'Final amount';
      el.finalAmount.textContent = Chart.money0.format(t.finalAmount);
      el.finalSub.textContent = t.totalMonths
        ? Chart.durationLabel(t.totalMonths) + ', ' + seasons + ' \u00b7 ' + moneyNote
        : 'No seasons yet: this is just the starting amount.';
      el.resultBarValue.textContent = Chart.money0.format(t.finalAmount);
    }
    el.finalAmount.classList.toggle('short', drawdown ? depleted : short);
    el.finalAmount.classList.toggle('answer', drawdown);
    document.querySelector('.result-bar-label').textContent = drawdown ? 'Will it last?' : 'Final amount';

    /* Running out without any withdrawals (a big negative extra) still needs
       saying; with withdrawals the headline already says it. */
    var dipOnly = !depleted && t.dippedAt !== null;
    el.depletionWarn.hidden = !(dipOnly || (depleted && !drawdown));
    if (!el.depletionWarn.hidden) {
      var at = dipOnly ? t.dippedAt : t.depletedAt;
      var during = periodAt(projection, at);
      // A recovered dip is still worth saying: for those months the money was not there.
      el.depletionWarn.textContent = 'The balance goes below zero at ' + Chart.durationLabel(at) +
        (during ? ', during ' + during : '') +
        (dipOnly ? ', and only recovers later.' : '. After that the plan is short.');
    }
    renderLever(depleted, drawdown);

    /* Paid in counts money going in. A negative extra (a planned expense) is
       money out, so it is reported beside it rather than netted into it. In
       today's dollars, the as-typed sum is shown too, so it matches your maths. */
    function expenses(proj) {
      return proj.points.reduce(function (sum, pt) { return sum + Math.min(0, Number(pt.extra) || 0); }, 0);
    }
    var paidIn = t.totalContributed - expenses(projection);
    var paidTyped = nominal.totals.totalContributed - expenses(nominal);
    var spent = -expenses(projection);
    el.contributed.textContent = Chart.money0.format(paidIn);
    el.contributedNote.textContent = (today && Math.abs(paidTyped - paidIn) >= 1
      ? Chart.money0.format(paidTyped) + ' as typed, worth this today'
      : 'starting amount + savings' + (t.totalWindfalls + spent > 0 ? ' + extras' : '')) +
      (spent >= 1 ? ' \u00b7 ' + Chart.money0.format(spent) + ' of planned expenses taken out' : '');
    el.growthLabel.textContent = today ? 'Growth after inflation' : 'Total growth';
    el.growth.textContent = Chart.money0.format(t.totalGrowth);
    // Once the money has run out, "growth" mixes gains with a shrinking debt: no green.
    el.growth.className = 'kpi-value ' + (depleted ? '' : t.totalGrowth > 0 ? 'up' : t.totalGrowth < 0 ? 'down' : '');
    el.growthNote.textContent = depleted
      ? 'the money ran out at ' + Chart.durationLabel(t.depletedAt)
      : t.totalMonths && t.totalContributed > 0
        ? growthNote(t.totalGrowth / t.totalContributed)
        : '\u00a0';
    // The third figure: what a saving plan could pay out, or what a drawdown plan took out.
    if (drawdown) {
      el.thirdLabel.textContent = 'Withdrawn';
      el.income.textContent = Chart.money0.format(t.totalWithdrawn);
      // With one withdrawing season, say what it is per month (today's dollars, constant).
      var outs = state.periods.map(function (p, i) { return Calc.isWithdrawing(p) ? i : -1; }).filter(function (i) { return i >= 0; });
      var monthly = outs.length === 1 ? nominal.perPeriod[outs[0]] && nominal.perPeriod[outs[0]].firstWithdrawal : 0;
      // In the money the page is in: today's (constant), or future dollars at the start, rising.
      var startOf = outs.length === 1 ? nominal.perPeriod[outs[0]] : null;
      el.incomeNote.textContent = !(monthly > 0) ? 'taken out over the withdrawing seasons'
        : today ? Chart.money0.format(monthly) + '/month in today\u2019s dollars'
        : Chart.money0.format(monthly * Calc.deflator(startOf.startMonth + 1, state.inflationPercent)) + '/month to start, rising with inflation';
    } else {
      var income = t.totalMonths && t.finalAmount > 0 ? Calc.safeWithdrawal(t.finalAmount).perMonth : 0;
      el.thirdLabel.textContent = 'Monthly income';
      el.income.textContent = t.totalMonths ? Chart.money0.format(income) : '—';
      el.incomeNote.textContent = !t.totalMonths ? 'add a season first'
        : t.finalAmount > 0 ? 'under the ' + Calc.SAFE_WITHDRAWAL_PERCENT + '% rule' : 'needs a positive balance';
    }

    // Truncation warnings and each season's place on the timeline live on the cards.
    projection.perPeriod.forEach(function (pp, i) {
      var li = el.periodList.children[i];
      if (!li) return;
      refreshFlowNote(li, state.periods[i], nominal.perPeriod[i]);
      // Past the 100-year cap a season gets no time: its inputs would only mislead.
      li.classList.toggle('capped', !pp.months && pp.truncated);
      li.querySelector('[data-role="range"]').textContent = pp.months
        ? (pp.startMonth ? 'From ' + Chart.durationLabel(pp.startMonth) : 'From the start') +
          ' to ' + Chart.durationLabel(pp.endMonth)
        : pp.truncated
          ? 'No time left: earlier seasons already reach the ' + (Calc.MAX_TOTAL_MONTHS / 12) + '-year cap'
          : 'No length yet';
      var warn = li.querySelector('[data-role="warn"]');
      warn.hidden = !pp.truncated || !pp.months;
      if (pp.truncated && pp.months) {
        warn.textContent = 'Trimmed to ' + pp.months + ' months — the projection caps at ' +
          (Calc.MAX_TOTAL_MONTHS / 12) + ' years total.';
      }
    });

    var baseline = baselineView();
    renderBaseline(projection, baseline);
    refreshWindfallNotes(projection);
    renderAbout();
    renderExtrasLegend(projection);
    renderTable(projection, drawdown, today ? nominal : null);
    var summary = !t.totalMonths ? 'No seasons yet.'
      : drawdown
        ? (depleted ? 'The money runs out at ' + Chart.durationLabel(t.depletedAt) + '.'
                    : 'The money lasts all ' + Chart.durationLabel(t.totalMonths) + ', ending with ' +
                      Chart.money0.format(t.finalAmount) + (today ? ' in today’s dollars.' : '.'))
        : 'Final amount ' + Chart.money0.format(t.finalAmount) + (today ? ' in today’s dollars' : '') +
          ' after ' + Chart.durationLabel(t.totalMonths) + ', of which ' + Chart.money0.format(t.totalGrowth) + ' is growth.' +
          (depleted ? ' The money runs out at ' + Chart.durationLabel(t.depletedAt) + '.' : '');
    Chart.render(el.chart, projection, {
      periods: periodMeta(), windfalls: windfallMeta(projection),
      baseline: baseline, depletedAt: t.depletedAt,
      label: 'Projected balance. ' + summary
    });
    lastChartWidth = el.chart.clientWidth;
    // After the chart: the legend repeats season names only when the chart could not fit them.
    renderLegend(projection, baseline, !!(el.chart.__chart && el.chart.__chart.allLabels));
    announce(summary + (el.leverNote.hidden ? '' : ' ' + el.leverNote.textContent) +
      (el.baselineDelta.hidden ? '' : ' ' + el.baselineDelta.textContent + '.'));
  }

  /* One sentence on what would change the outcome. Short: how much less to
     withdraw, or how much more to start with. Lasting: how much more could be
     withdrawn. Withdrawal amounts are the ones typed into the cards (dollars of
     the day they are spent), so they are not restated in today's money. */
  function renderLever(depleted, drawdown) {
    var text = '';
    var withdrawing = state.periods.filter(Calc.isWithdrawing);
    var scale = drawdown ? Calc.withdrawalScale(state) : null;
    var only = withdrawing.length === 1 ? withdrawing[0] : null;
    var asPct = only && only.flow === 'withdraw' && only.withdrawUnit === 'percent';
    var one = only ? (asPct ? Number(only.withdrawPercent) : Math.abs(Number(only.monthlyContribution) || 0)) : 0;
    function roundDown(v) { return Math.floor(v / 10) * 10; }
    // Say a withdrawal the way it was typed: a percent, or today's dollars a month.
    var tagToday = state.view.money === 'future' ? ' (today\u2019s dollars)' : '';
    function amount(v, down) {
      return asPct ? (Math.floor(v * 10) / 10) + '%' : Chart.money0.format(down ? roundDown(v) : v) + '/month' + tagToday;
    }
    if (depleted) {
      var parts = [];
      if (scale !== null && scale > 0 && scale < 1) {
        parts.push(one
          ? 'Withdrawing ' + amount(one * scale, true) + ' instead of ' + amount(one) + ' would make it last'
          : 'Withdrawing about ' + Math.ceil((1 - scale) * 100) + '% less in each withdrawing season would make it last');
      }
      var more = Calc.extraStartNeeded(state);
      if (isFinite(more) && more > 0) {
        var startMore = Chart.money0.format(Math.ceil(more / 1000) * 1000);
        parts.push(parts.length ? 'or starting with ' + startMore + ' more would' : 'Starting with ' + startMore + ' more would make it last');
      }
      text = parts.length ? parts.join(', ') + '.' : '';
    } else if (drawdown && scale !== null && scale > 1.05) {
      // Past 5x the precise figure stops meaning anything; say it plainly.
      text = scale >= 5
        ? 'It lasts comfortably: you could withdraw more than 5\u00d7 as much and it would still last.'
        : one
          ? 'You could withdraw up to about ' + amount(one * scale, true) + ' and it would still last.'
          : scale >= 2
            ? 'You could withdraw about ' + (Math.floor(scale * 10) / 10) + '\u00d7 as much in each withdrawing season and it would still last.'
            : 'You could withdraw about ' + Math.floor((scale - 1) * 100) + '% more in each withdrawing season and it would still last.';
    }
    el.leverNote.hidden = !text;
    el.leverNote.textContent = text;
  }

  /* Under a withdrawing season's amount: what it means, in words, and what it
     comes to. The 4% rule is spelled out every time so it is never mistaken for
     "4% of whatever is left". */
  function refreshFlowNote(li, p, pp) {
    var note = li.querySelector('[data-role="flow-note"]');
    if (!note) return;
    var html = '';
    if (p.flow === 'withdraw' && pp && pp.months) {
      /* Lead with the dollars, then show the inflation raise in real numbers —
         "today's dollars" alone does not say whether the amount stays put or
         grows. Then size it against what the season starts with, so both kinds
         of withdrawal get the same "is this reasonable?" check against the 4% rule. */
      var infl = state.inflationPercent;
      var monthly = pp.firstWithdrawal; // today's dollars, the same every month of the season
      var start = pp.startBalance / Calc.deflator(pp.startMonth, infl);
      var pctYear = start > 0 ? monthly * 12 / start * 100 : 0;
      var rule = Calc.SAFE_WITHDRAWAL_PERCENT;
      if (!(monthly > 0)) {
        html = p.withdrawUnit === 'percent' ? 'Nothing to withdraw: the season starts with no money.' : '';
      } else {
        html = '<strong>' + Chart.money0.format(monthly) + '/month</strong> in today\u2019s money' +
          (Number(infl) > 0
            ? ', raised with inflation: \u2248' + Chart.money0.format(monthly * Calc.deflator(pp.startMonth + 1, infl)) +
              '/mo when this season starts, ' + Chart.money0.format(monthly * Calc.deflator(pp.endMonth, infl)) + ' by its end. '
            : ', the same every month (inflation is 0%). ');
        if (p.withdrawUnit === 'percent') {
          html += (Number(p.withdrawPercent) || 0) + '% of the ' + Chart.money0.format(start) +
            ' it starts with, in its first year (the 4% rule).';
        } else if (start > 0) {
          var shown = pctYear < 10 ? pctYear.toFixed(1) : String(Math.round(pctYear));
          html += '\u2248' + shown + '% a year of the ' + Chart.money0.format(start) + ' it starts with, ' +
            (pctYear > rule + 0.5 ? 'well above' : pctYear < rule - 0.5 ? 'below' : 'close to') + ' the ' + rule + '% rule.';
        } else {
          html += 'It starts with no money, so it is short from the first month.';
        }
      }
    }
    note.innerHTML = html;
    note.hidden = !html;
  }

  // The season an absolute month falls in, with its numbers, or null.
  function seasonAt(projection, m) {
    for (var i = 0; i < projection.perPeriod.length; i++) {
      var pp = projection.perPeriod[i];
      if (m > pp.startMonth && m <= pp.endMonth) return { pp: pp, name: seasonName(state.periods[i], i) };
    }
    return null;
  }

  // "+151% on top of what you paid in" reads at a glance; "151% of" did not.
  function growthNote(ratio) {
    var pct = Math.round(ratio * 100);
    return pct >= 0 ? '+' + pct + '% on top of what you paid in' : pct + '% less than you paid in';
  }

  // ------------------------------------------------------------ baseline

  /* A kept earlier version of the plan, stored as nominal month-end balances and
     shown in whichever money the page is in. */
  function baselineView() {
    if (!state.baseline) return null;
    return state.baseline.balances.map(function (b, m) { return viewMoney(b, m); });
  }

  function renderBaseline(projection, baseline) {
    var any = state.periods.length > 0;
    el.keepBaseline.hidden = !any;
    el.clearBaseline.hidden = !baseline;
    el.baselineDelta.hidden = !baseline;
    el.keepBaseline.title = baseline
      ? 'Replace the baseline with the plan as it is now'
      : 'Save the plan as it is now, to compare your next changes against it';
    el.keepBaseline.textContent = baseline ? 'Keep this instead' : 'Keep as baseline';
    if (!baseline) return;
    var then = baseline[baseline.length - 1];
    /* When the question is "will it last", compare in time: how much longer or
       shorter the money lasts than the baseline did. */
    var nowOut = projection.totals.depletedAt;
    var thenOut = null;
    for (var bm = 1; bm < baseline.length; bm++) if (baseline[bm] < 0) { thenOut = bm; break; }
    if (Calc.hasWithdrawals(state) && (nowOut !== null || thenOut !== null)) {
      el.baselineDelta.className = 'baseline-delta';
      var nowEnd = nowOut === null ? projection.totals.totalMonths : nowOut;
      var thenEnd = thenOut === null ? baseline.length - 1 : thenOut;
      var gap = nowEnd - thenEnd;
      el.baselineDelta.innerHTML = gap === 0 ? 'Lasts as long as the baseline'
        : '<span class="' + (gap > 0 ? 'up' : 'down') + '">Lasts ' + Chart.durationLabel(Math.abs(gap)) +
          (gap > 0 ? ' longer' : ' less') + '</span> than the baseline';
      return;
    }
    var rounded = Math.round(projection.totals.finalAmount - then);
    el.baselineDelta.className = 'baseline-delta';
    el.baselineDelta.innerHTML = rounded
      ? '<span class="' + (rounded > 0 ? 'up' : 'down') + '">' + (rounded > 0 ? '+' : '−') +
        Chart.money0.format(Math.abs(rounded)) + '</span> vs baseline ending at ' + Chart.money0.format(then)
      : 'Same as baseline (' + Chart.money0.format(then) + ')';
  }

  /* Screen readers hear the result once typing settles, not on every keystroke,
     and not on first load — the page itself says it then. */
  var announceTimer = null, announceReady = false;
  function announce(text) {
    if (!announceReady) return;
    clearTimeout(announceTimer);
    announceTimer = setTimeout(function () { el.liveSummary.textContent = text; }, 900);
  }

  /* One place for the explanations, closed by default: today's dollars,
     withdrawals, the baseline and the 4% rule. Rendered once and kept, so its
     open state survives every keystroke. */
  function renderAbout() {
    if (el.withdrawal.firstChild) return;
    var pct = Calc.SAFE_WITHDRAWAL_PERCENT;
    el.withdrawal.innerHTML =
      '<details class="why"><summary>About these numbers</summary>' +
      '<p><strong>Today’s dollars.</strong> A dollar in 30 years buys less than a dollar now. ' +
      'In today’s dollars every amount is shrunk by the inflation rate up to the month it happens, ' +
      'so the figures mean what they would buy today. Switch to Future $ to see the raw amounts.</p>' +
      '<p><strong>Saving and withdrawing.</strong> Each season either adds its monthly amount or takes it out. ' +
      'Retirement is usually a withdrawing season. Withdrawals are in today\u2019s dollars and rise with inflation each ' +
      'year, so they keep buying the same. Choose a fixed amount, or the ' + pct + '% rule: ' + pct + '% of what the season ' +
      'starts with, in its first year, then raised with inflation each year (not ' + pct + '% of whatever is left). ' +
      'If the balance goes below zero the money has run out, and the page says when.</p>' +
      '<p><strong>Baseline.</strong> Keep as baseline saves the plan as it is now and draws it as a dashed line, ' +
      'so you can see what each change does.</p>' +
      '<p><strong>Monthly income and the ' + pct + '% rule.</strong> For a plan that only saves, monthly income is ' + pct +
      '% of the final amount in the first year, split across 12 months. It is a retirement rule of thumb ' +
      '(Bengen, 1994; the Trinity study, 1998): withdraw ' + pct + '% in the first year, then adjust that dollar ' +
      'amount for inflation each year after. Historically that has lasted a 30-year retirement — it assumes a ' +
      'stock-and-bond portfolio and is a rough guide, not a guarantee.</p>' +
      '</details>';
  }

  function renderLegend(projection, baseline, namesOnChart) {
    var seasons = namesOnChart ? '' : state.periods.map(function (p, i) {
      var pp = projection.perPeriod[i];
      return '<span class="legend-item">' +
        '<span class="legend-dot" style="background:' + Chart.colorFor(p.colorSlot) + '"></span>' +
        escapeHtml(seasonName(p, i)) +
        '<span class="legend-meta">\u00b7 ' + (pp && pp.months ? Chart.durationLabel(pp.months) : 'no time left') + '</span>' +
        '</span>';
    }).join('');
    el.legend.innerHTML = seasons + (baseline
      ? '<span class="legend-item"><svg class="legend-dash" width="18" height="10" aria-hidden="true">' +
        '<line x1="1" y1="5" x2="17" y2="5" stroke="currentColor" stroke-width="1.5" stroke-dasharray="5 4"/></svg>Baseline</span>'
      : '');
    el.legend.hidden = !el.legend.innerHTML;
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

  /* Each cell carries its column name, so on phones the table can stack into
     one block per season with the label beside each figure (see styles.css).
     A Withdrawn column appears only when the plan withdraws, so "Paid in" is
     never negative. */
  var cols = [];
  function row(cls, cells) {
    return '<tr' + (cls ? ' class="' + cls + '"' : '') + '>' + cells.map(function (c, k) {
      return '<td' + (k ? ' class="num' + (c.cls ? ' ' + c.cls : '') + '"' : '') +
        ' data-label="' + cols[k] + '"><span class="cell">' + c.html + '</span></td>';
    }).join('') + '</tr>';
  }
  // Growth is tinted by sign, except once the money has run out: no green shortfalls.
  function growthCls(growth, endBalance) {
    if (endBalance < 0) return '';
    return growth < 0 ? 'neg' : growth > 0 ? 'pos' : '';
  }

  function renderTable(projection, drawdown, typed) {
    // In today's dollars, paid-in cells also show the sum as typed, so it matches your maths.
    function paid(view, asTyped) {
      if (!view) return '&mdash;';
      return Chart.money0.format(view) +
        (typed && Math.abs(asTyped - view) >= 1 ? '<span class="typed">' + Chart.money0.format(asTyped) + ' typed</span>' : '');
    }
    cols = ['Season', 'Length', 'Return', 'Paid in'].concat(drawdown ? ['Withdrawn'] : [], ['Extras', 'Growth', 'Balance at end']);
    el.thead.innerHTML = '<tr>' + cols.map(function (c, k) {
      return '<th scope="col"' + (k ? ' class="num"' : '') + '>' + c + '</th>';
    }).join('') + '</tr>';
    if (!state.periods.length) {
      el.tbody.innerHTML = '<tr class="empty"><td colspan="' + cols.length + '">Add a season to see the breakdown.</td></tr>';
      return;
    }
    function out(v) { return drawdown ? [{ html: v ? Chart.money0.format(v) : '&mdash;' }] : []; }
    /* The starting amount (plus any extra at month 0) gets its own row, so the
       Paid in and Extras columns each sum to their Total. */
    var t = projection.totals;
    var dash = { html: '&mdash;' };
    var startExtras = t.totalWindfalls - projection.perPeriod.reduce(function (sum, pp) {
      return sum + pp.windfalls;
    }, 0);
    var rows = [row('start-row', [
      { html: 'Starting amount' }, dash, dash,
      { html: Chart.money0.format(t.startingAmount) }
    ].concat(out(0), [
      { html: extraText(startExtras) }, dash,
      { html: Chart.money0.format(projection.points[0].balance) }
    ]))];

    rows = rows.concat(projection.perPeriod.map(function (pp, i) {
      var p = state.periods[i];
      return row('', [
        { html: '<span class="swatch-dot" style="background:' + Chart.colorFor(p.colorSlot) + '"></span>' + escapeHtml(seasonName(p, i)) },
        { html: Chart.durationLabel(pp.months) },
        { html: (Number(p.annualRatePercent) || 0) + '%<span class="unit"> / yr</span>' },
        { html: paid(pp.contributed, typed && typed.perPeriod[i].contributed) }
      ].concat(out(pp.withdrawn), [
        { html: extraText(pp.windfalls) },
        { html: Chart.money0.format(pp.growth), cls: growthCls(pp.growth, pp.endBalance) },
        { html: Chart.money0.format(pp.endBalance), cls: pp.endBalance < 0 ? 'neg' : '' }
      ]));
    }));

    rows.push(row('total-row', [
      { html: 'Total' },
      { html: Chart.durationLabel(t.totalMonths) }, dash,
      { html: paid(t.totalContributed - t.totalWindfalls,
                   typed && typed.totals.totalContributed - typed.totals.totalWindfalls) }
    ].concat(out(t.totalWithdrawn), [
      { html: extraText(t.totalWindfalls) },
      { html: Chart.money0.format(t.totalGrowth), cls: t.depletedAt !== null ? '' : growthCls(t.totalGrowth, t.finalAmount) },
      { html: Chart.money0.format(t.finalAmount), cls: t.finalAmount < 0 ? 'neg' : '' }
    ])));

    el.tbody.innerHTML = rows.join('');
  }

  // A zero extra reads better as a dash than as $0. Never tinted: money in, not growth.
  function extraText(v) { return v ? Chart.money0.format(v) : '&mdash;'; }

  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c];
    });
  }
  function escapeAttr(s) {
    return escapeHtml(s).replace(/"/g, '&quot;');
  }

  // -------------------------------------------------------------- events

  /* The starting amount is a text field so it can show thousands separators.
     Typing is parsed leniently ("250,000", "$250000"); the grouping comes back on
     blur, never mid-typing, so the caret stays put. */
  function parseMoney(text) {
    var n = Number(String(text).replace(/[^0-9.\-]/g, ''));
    return isFinite(n) ? n : 0;
  }
  function formatMoneyInput(n) {
    return Number(n) ? new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(n) : '';
  }
  el.startingAmount.addEventListener('input', function () {
    state.startingAmount = Math.max(0, parseMoney(this.value));
    save();
    renderResults();
  });
  el.startingAmount.addEventListener('blur', function () {
    this.value = formatMoneyInput(state.startingAmount);
  });

  el.periodList.addEventListener('input', function (ev) {
    if (ev.target.dataset.unit) {
      var card = ev.target.closest('.period');
      var period = state.periods[Number(card.dataset.index)];
      switchUnit(card, period, ev.target);
      refreshCardNotes(card, period);
      save();
      return;
    }
    var input = ev.target.closest('[data-field]');
    if (!input) return;
    var li = ev.target.closest('.period');
    var p = state.periods[Number(li.dataset.index)];
    var field = input.dataset.field;

    if (field === 'name' || field === 'compounding') {
      p[field] = input.value;
    } else if (field === 'months') {
      p.months = timeFromInput(input.value, unitOf(p.lengthUnit, p.months));
    } else if (field === 'monthlyContribution') {
      // Entered positive; Save / Withdraw decides the direction.
      p.monthlyContribution = Math.abs(Number(input.value) || 0);
    } else if (field === 'withdrawPercent') {
      p.withdrawPercent = Math.min(100, Math.max(0, Number(input.value) || 0));
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
      setNodeColors(li, state.periods[index].colorSlot);
      li.querySelectorAll('.swatch').forEach(function (b) {
        b.setAttribute('aria-pressed', String(b === swatch));
      });
      refreshCardNotes(li, state.periods[index]);
      save();
      renderResults();
      return;
    }

    var flowBtn = ev.target.closest('[data-flow]');
    if (flowBtn) {
      switchFlow(index, flowBtn.dataset.flow);
      return;
    }

    var btn = ev.target.closest('[data-action]');
    if (!btn) return;
    var action = btn.dataset.action;

    var focusAt = index, focusSel = '[data-field="name"]';
    if (action === 'delete') {
      var removed = state.periods.splice(index, 1)[0];
      focusAt = Math.min(index, state.periods.length - 1);
      offerUndo('\u201c' + seasonName(removed, index) + '\u201d deleted', function () {
        state.periods.splice(index, 0, removed);
        save();
        renderPeriods();
        renderResults();
        focusIn(el.periodList, index, '[data-field="name"]');
      });
    } else if (action === 'up' && index > 0) {
      state.periods.splice(index - 1, 0, state.periods.splice(index, 1)[0]);
      focusAt = index - 1; focusSel = focusAt === 0 ? '[data-action="down"]' : '[data-action="up"]';
    } else if (action === 'down' && index < state.periods.length - 1) {
      state.periods.splice(index + 1, 0, state.periods.splice(index, 1)[0]);
      focusAt = index + 1; focusSel = focusAt === state.periods.length - 1 ? '[data-action="up"]' : '[data-action="down"]';
    } else {
      return;
    }

    save();
    renderPeriods();
    renderResults();
    // The rebuild drops focus to <body>; put it back where the user was. On touch,
    // a delete lands on the card itself, so no keyboard pops up.
    if (action === 'delete' && touch()) {
      var next = el.periodList.children[focusAt];
      if (next) { next.tabIndex = -1; next.focus({ preventScroll: true }); }
    } else if (focusAt >= 0) focusIn(el.periodList, focusAt, focusSel);
    else el.addPeriod.focus();
  });

  /* Changing what a season does keeps the plan where it was: a switch never
     brings in an amount nobody typed. 4% -> fixed starts at what 4% comes to
     today; anything -> Save starts at $0. The change is named, with Undo. */
  function switchFlow(index, mode) {
    var p = state.periods[index];
    var from = flowMode(p);
    if (from === mode) return;
    var before = JSON.stringify(p);
    var note = '';
    if (mode === 'save') {
      p.flow = 'save';
      p.monthlyContribution = 0;
    } else {
      var first = Calc.project(state).perPeriod[index];
      var monthlyToday = first ? first.firstWithdrawal : 0;
      p.flow = 'withdraw';
      p.withdrawUnit = mode;
      if (mode === 'dollars') {
        p.monthlyContribution = from === 'percent' && monthlyToday > 0
          ? Math.round(monthlyToday / 10) * 10
          : 0;
        if (from === 'percent' && monthlyToday > 0) {
          note = 'Switched to a fixed ' + Chart.money0.format(p.monthlyContribution) + '/month, about what ' +
            (Number(p.withdrawPercent) || 0) + '% came to';
        }
      } else if (!(Number(p.withdrawPercent) > 0)) {
        p.withdrawPercent = Calc.SAFE_WITHDRAWAL_PERCENT;
      }
    }
    save();
    renderPeriods();
    renderResults();
    focusIn(el.periodList, index, '[data-flow="' + mode + '"]');
    offerUndo(note || (seasonName(p, index) + ': ' + (mode === 'save' ? 'saving' : mode === 'percent' ? 'withdrawing a %' : 'withdrawing a fixed amount')), function () {
      state.periods[index] = JSON.parse(before);
      save();
      renderPeriods();
      renderResults();
    });
  }

  function touch() {
    return typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
  }

  function focusIn(list, index, selector) {
    var li = list.children[index];
    var target = li && li.querySelector(selector);
    if (target) target.focus();
  }

  // ---------------------------------------------------------------- undo

  /* Deleting and resetting act at once and offer a way back, instead of asking
     first. One step deep: a newer action replaces the older offer. */
  /* A short history, so deleting three seasons in a row can be walked back one
     at a time. The toast always offers the newest; it clears when it times out. */
  var UNDO_MS = 10000, UNDO_DEPTH = 10;
  var undoStack = [], toastTimer = null, typedSinceOffer = false;
  function offerUndo(text, restore) {
    undoStack.push({ text: text, restore: restore });
    if (undoStack.length > UNDO_DEPTH) undoStack.shift();
    typedSinceOffer = false;
    showTopUndo();
  }
  function showTopUndo() {
    var top = undoStack[undoStack.length - 1];
    syncUndoLink();
    if (!top) { hideToast(); return; }
    el.toastText.textContent = top.text + (undoStack.length > 1 ? ' (' + undoStack.length + ' to undo)' : '');
    el.toastUndo.hidden = false;
    el.toast.hidden = false;
    startToastTimer(UNDO_MS);
  }
  /* The toast goes away; the history does not. While anything can be undone, a
     quiet "Undo" stays beside the plan title. */
  function syncUndoLink() {
    el.undoLink.hidden = !undoStack.length;
    el.undoLink.textContent = undoStack.length > 1 ? 'Undo (' + undoStack.length + ')' : 'Undo';
  }
  // A notice with nothing to undo, e.g. "the plan already reaches the cap".
  function showNotice(text) {
    el.toastText.textContent = text;
    el.toastUndo.hidden = true;
    el.toast.hidden = false;
    startToastTimer(5000);
  }
  function startToastTimer(ms) {
    clearTimeout(toastTimer);
    toastTimer = setTimeout(hideToast, ms);
  }
  function runUndo() {
    var top = undoStack.pop();
    if (!top) return;
    top.restore();
    showTopUndo();
  }
  // The offer waits while you are reading it or about to press it.
  el.toast.addEventListener('mouseenter', function () { clearTimeout(toastTimer); });
  el.toast.addEventListener('focusin', function () { clearTimeout(toastTimer); });
  el.toast.addEventListener('mouseleave', function () { startToastTimer(4000); });
  el.toast.addEventListener('focusout', function () { startToastTimer(4000); });
  /* Cmd/Ctrl+Z takes the offer — unless you have typed since, in which case it
     belongs to the field and undoes your typing as usual. (After a delete, focus
     lands in a neighbouring field, so "in a field" alone is not the test.) */
  document.addEventListener('input', function () { typedSinceOffer = true; });
  document.addEventListener('keydown', function (ev) {
    if (!undoStack.length || ev.shiftKey || ev.altKey || !(ev.metaKey || ev.ctrlKey)) return;
    if (ev.key !== 'z' && ev.key !== 'Z') return;
    if (typedSinceOffer) return;
    ev.preventDefault();
    runUndo();
  });
  function hideToast() {
    clearTimeout(toastTimer);
    el.toast.hidden = true;
  }
  el.toastUndo.addEventListener('click', runUndo);
  el.undoLink.addEventListener('click', runUndo);

  el.windfallList.addEventListener('input', function (ev) {
    var li = ev.target.closest('.windfall');
    if (!li) return;
    var w = state.windfalls[Number(li.dataset.index)];
    if (ev.target.dataset.unit) {
      switchUnit(li, w, ev.target);
      save();
      return;
    }
    var input = ev.target.closest('[data-field]');
    if (!input) return;
    var field = input.dataset.field;

    if (field === 'repeat') {
      // The checkbox is a view of repeatEvery: 0 means "does not repeat".
      var everyInput = li.querySelector('[data-field="repeatEvery"]');
      w.repeatEvery = input.checked
        ? Math.max(1, timeFromInput(everyInput.value, unitOf(w.everyUnit, 12)) || 12)
        : 0;
      li.querySelector('.repeat-fields').hidden = !input.checked;
    } else if (field === 'repeatEvery') {
      w.repeatEvery = Math.max(1, timeFromInput(input.value, unitOf(w.everyUnit, w.repeatEvery)));
    } else if (field === 'repeatUntil') {
      // Empty means "to the end of the projection" — not month zero.
      w.repeatUntil = input.value === '' ? null : timeFromInput(input.value, unitOf(w.untilUnit, w.repeatUntil));
    } else if (field === 'name') {
      w.name = input.value;
    } else if (field === 'atMonth') {
      w.atMonth = timeFromInput(input.value, unitOf(w.atUnit, w.atMonth));
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

    if (btn.dataset.action !== 'delete') return;
    var removed = state.windfalls.splice(index, 1)[0];
    save();
    renderWindfalls();
    renderResults();
    if (state.windfalls.length) focusIn(el.windfallList, Math.min(index, state.windfalls.length - 1), '[data-field="name"]');
    else el.addWindfall.focus();
    offerUndo('\u201c' + (removed.name || 'Extra ' + (index + 1)) + '\u201d deleted', function () {
      state.windfalls.splice(index, 0, removed);
      save();
      renderWindfalls();
      renderResults();
      focusIn(el.windfallList, index, '[data-field="name"]');
    });
  });

  el.addWindfall.addEventListener('click', function () {
    state.windfalls.push(makeWindfall(state.windfalls.length));
    save();
    renderWindfalls();
    renderResults();
    // Straight to the amount: the extra does nothing until it has one.
    var added = el.windfallList.lastElementChild;
    if (added) added.querySelector('[data-field="amount"]').focus();
  });

  el.addPeriod.addEventListener('click', function () {
    // A season added past the 100-year cap would get no time at all; say so instead.
    if (Calc.horizonMonths(state.periods) >= Calc.MAX_TOTAL_MONTHS) {
      showNotice('The plan already reaches the ' + (Calc.MAX_TOTAL_MONTHS / 12) + '-year limit. Shorten a season first.');
      return;
    }
    var last = state.periods[state.periods.length - 1];
    var lastName = last ? seasonName(last, state.periods.length - 1) : '';
    state.periods.push(makePeriod(state.periods.length, last ? {
      months: last.months,
      monthlyContribution: last.monthlyContribution,
      annualRatePercent: last.annualRatePercent,
      compounding: last.compounding,
      flow: last.flow,
      lengthUnit: unitOf(last.lengthUnit, last.months),
      colorSlot: nextColorSlot()
    } : { colorSlot: nextColorSlot() }));
    save();
    renderPeriods();
    renderResults();
    // Centred, so the undo toast at the bottom never covers the card you are filling in.
    var added = el.periodList.lastElementChild;
    if (added) {
      added.querySelector('[data-field="name"]').focus({ preventScroll: true });
      added.scrollIntoView({ block: 'center' });
    }
    // A new season copies the last one's numbers; say so, and offer the way back.
    var at = state.periods.length - 1;
    offerUndo(last ? 'Copied \u201c' + lastName + '\u201d' : 'Season added', function () {
      state.periods.splice(at, 1);
      save();
      renderPeriods();
      renderResults();
      el.addPeriod.focus();
    });
  });

  el.reset.addEventListener('click', function () {
    var before = JSON.stringify(state);
    try { localStorage.removeItem(STORAGE_KEY); } catch (e) { /* ignore */ }
    state = defaultState();
    renderAll();
    offerUndo('Replaced with the example plan', function () {
      state = JSON.parse(before);
      renderAll();
    });
  });

  function renderAll() {
    el.startingAmount.value = formatMoneyInput(state.startingAmount);
    syncViewControls();
    save(true);
    renderPeriods();
    renderWindfalls();
    renderResults();
  }

  // ------------------------------------------------- money and baseline

  function syncViewControls() {
    el.moneyMode.querySelectorAll('[data-money]').forEach(function (b) {
      b.setAttribute('aria-pressed', String(b.dataset.money === state.view.money));
    });
    // Always shown: withdrawals rise with it, whichever money the page is in.
    el.inflationField.hidden = false;
    if (document.activeElement !== el.inflation) el.inflation.value = state.inflationPercent;
  }

  el.moneyMode.addEventListener('click', function (ev) {
    var btn = ev.target.closest('[data-money]');
    if (!btn) return;
    state.view.money = btn.dataset.money;
    syncViewControls();
    save(true);
    renderResults();
  });

  el.inflation.addEventListener('input', function () {
    // A cleared field is mid-typing, not 0%: keep the last rate until there is a number.
    if (this.value === '') return;
    var v = Number(this.value);
    state.inflationPercent = isFinite(v) ? Math.min(50, Math.max(0, v)) : DEFAULT_INFLATION;
    save();
    renderResults();
  });

  /* Keep the current plan as a baseline: its month-end balances, in nominal
     dollars, drawn as a ghost line until cleared or replaced. */
  el.inflation.addEventListener('blur', function () { this.value = state.inflationPercent; });

  el.keepBaseline.addEventListener('click', function () {
    var pts = Calc.project(state).points;
    if (pts.length < 2) return;
    var previous = state.baseline;
    state.baseline = { balances: pts.map(function (pt) { return Math.round(pt.balance * 100) / 100; }) };
    state.baselineSeen = true;
    save(true);
    renderResults();
    // Replacing a kept baseline loses it, so it gets the same way back as a delete.
    if (previous) {
      offerUndo('Baseline replaced', function () {
        state.baseline = previous;
        save(true);
        renderResults();
      });
    }
  });
  el.clearBaseline.addEventListener('click', function () {
    var kept = state.baseline;
    state.baseline = null;
    save(true);
    renderResults();
    el.keepBaseline.focus();
    offerUndo('Baseline cleared', function () {
      state.baseline = kept;
      save(true);
      renderResults();
    });
  });

  /* Narrow screens stack the plan above the results; a bar keeps the final
     amount in reach whenever the headline figure is scrolled out of view.
     CSS decides whether the bar can show at all; this only says when. */
  if (typeof IntersectionObserver === 'function') {
    new IntersectionObserver(function (entries) {
      el.resultBar.hidden = entries[0].isIntersecting;
    }).observe(el.hero);
  }

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
  el.startingAmount.value = formatMoneyInput(state.startingAmount);
  syncViewControls();
  el.exampleNote.hidden = !state.isExample;
  el.reset.hidden = !!state.isExample;
  repaintForTheme();
  announceReady = true;
})();
