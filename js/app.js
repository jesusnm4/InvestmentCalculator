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
    sharedNote:     document.getElementById('shared-note'),
    sharedNoteText: document.getElementById('shared-note-text'),
    sharedBack:     document.getElementById('shared-back'),
    sharedForget:   document.getElementById('shared-forget'),
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
    kpiSum:         document.getElementById('kpi-sum'),
    kpiSumWrap:     document.getElementById('kpi-sum-wrap'),
    paidLabel:      document.getElementById('kpi-paid-label'),
    moneyNote:      document.getElementById('money-note'),
    shareLink:      document.getElementById('share-link'),
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

  /* Every season but the one being edited collapses to a single summary row,
     at every width, so the answer is not three screens away. View state, like openOptions. */
  var expanded = null;

  var state = load() || defaultState();

  /* A shared link carries a whole plan in its #hash (nothing is uploaded: the
     hash never reaches a server). Opening one shows it without saving anything:
     your own plan stays in storage until you edit the shared one. The first edit
     makes it yours, keeps your old plan aside (OWN_KEY), and clears the hash so a
     reload shows your edits; "Back to your own plan" restores it either way. */
  var OWN_KEY = STORAGE_KEY + '-own';
  function clearPlanHash() {
    if (location.hash.indexOf(PLAN_HASH) !== 0) return;
    try { history.replaceState(null, '', location.pathname + location.search); } catch (e) { /* file:// in some browsers */ }
  }
  var PLAN_HASH = '#plan=';
  function encodePlan() {
    var json = JSON.stringify({ startingAmount: state.startingAmount, inflationPercent: state.inflationPercent,
                                periods: state.periods, windfalls: state.windfalls });
    return btoa(unescape(encodeURIComponent(json))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  var badLink = false;
  function readSharedPlan() {
    if (location.hash.indexOf(PLAN_HASH) !== 0) return null;
    var code = location.hash.slice(PLAN_HASH.length).replace(/-/g, '+').replace(/_/g, '/');
    var plan = null;
    try {
      while (code.length % 4) code += '=';
      plan = sanitize(JSON.parse(decodeURIComponent(escape(atob(code)))));
    } catch (e) { plan = null; }
    // A link that can't be read changes nothing, but says so (and leaves the address bar clean).
    if (!plan) { badLink = true; clearPlanHash(); }
    return plan;
  }
  var ownPlan = null, sharedMode = false;
  var shared = readSharedPlan();
  if (shared) {
    ownPlan = state;
    sharedMode = true;
    // The plan comes from the link; how you view it (money, baseline) stays yours, minus a baseline from another plan.
    shared.view = state.view;
    shared.baseline = null;
    shared.baselineSeen = state.baselineSeen;
    shared.isExample = false;
    state = shared;
  }

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
      atUnit: 'years', everyUnit: 'years', untilUnit: 'years',
      // In today's dollars, rising with prices like a withdrawal; "Stays the same" keeps it as typed.
      fixed: false,
      // Measured from the plan start (null) or from the start of a season (its id), plus an offset.
      // Until is measured from the same season start as At (untilOffset; null: to the end).
      anchor: null, anchorOffset: 0, untilOffset: null, untilSeason: false
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
  function newPeriodId() { return 's' + Math.random().toString(36).slice(2, 9); }

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
      colorSlot: at % Chart.slotCount,
      // Stable across reorders and renames, so an extra can be anchored to it.
      id: newPeriodId()
    };
    for (var k in over) if (Object.prototype.hasOwnProperty.call(over, k)) p[k] = over[k];
    return p;
  }

  /* Time fields are typed in years or months, but state always holds months —
     the unit is only how a field displays. UNIT_KEY names the property that
     remembers each field's unit. */
  var UNIT_KEY = { months: 'lengthUnit', atMonth: 'atUnit', repeatEvery: 'everyUnit', repeatUntil: 'untilUnit' };

  // An unknown unit (older saved state) shows years when that reads cleanly.
  /* Under a year, shown in years, reads "0.08 years": structural renders move
     such a field to months (never while typing, which would reread the number). */
  function wholeUnit(obj, key, months) {
    var m = Number(months) || 0;
    if (obj[key] === 'years' && m > 0 && m < 12) obj[key] = 'months';
  }
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
    // An anchored extra's "At" shows its offset into the season.
    input.value = timeDisplay(field === 'atMonth' && item.anchor ? item.anchorOffset
      : field === 'repeatUntil' ? untilShown(item) : item[field], unit);
    input.step = unit === 'years' ? 'any' : '1';
    input.inputMode = unit === 'years' ? 'decimal' : 'numeric';
  }

  /* Every edit to the plan ends the example. View changes (money mode, baseline)
     pass keepExample, since they do not change the plan itself. */
  function save(keepExample) {
    // Anchored extras are stored with the month they land on now, not the one before this edit.
    syncAnchors();
    if (sharedMode) {
      // Just looking (a view change): nothing is written, so your own saved plan is untouched.
      if (keepExample) { syncSharedNote(); return; }
      keepOwnAside();
    }
    if (!keepExample) state.isExample = false;
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (e) { /* private mode */ }
    el.exampleNote.hidden = !state.isExample;
    el.reset.hidden = !!state.isExample;
    syncSharedNote();
  }

  // The first real change to a shared plan makes it yours; your old one is kept aside (the oldest, if several).
  function keepOwnAside() {
    try { if (!localStorage.getItem(OWN_KEY)) localStorage.setItem(OWN_KEY, JSON.stringify(ownPlan)); } catch (e) { /* private mode */ }
    sharedMode = false;
    clearPlanHash();
  }

  function keptAside() {
    try { return localStorage.getItem(OWN_KEY); } catch (e) { return null; }
  }
  // The persistent line in the plan's head while a shared plan is on screen or your own is kept aside.
  function syncSharedNote() {
    var aside = keptAside();
    el.sharedNote.hidden = !sharedMode && !aside;
    el.sharedNoteText.textContent = sharedMode
      ? 'You\u2019re looking at a shared plan. Your own plan is untouched unless you edit this one.'
      : 'This plan came from a shared link. Your own is kept aside.';
    el.sharedForget.hidden = sharedMode || !aside;
  }
  function showPlan(next) {
    state = next;
    el.startingAmount.value = formatMoneyInput(state.startingAmount);
    syncViewControls();
    renderPeriods();
    renderWindfalls();
    renderResults();
  }

  function load() {
    var raw;
    try { raw = localStorage.getItem(STORAGE_KEY); } catch (e) { return null; }
    if (!raw) return null;
    var parsed;
    try { parsed = JSON.parse(raw); } catch (e) { return null; }
    return sanitize(parsed);
  }

  /* Re-validates a plan from storage or from a shared link: anything not
     understood falls back or is dropped, so a hand-edited link can't break the page. */
  function sanitize(parsed) {
    try {
      if (!parsed || !Array.isArray(parsed.periods)) return null;
      // A link is typed by no one but could be edited by anyone: keep it to plan-sized plans.
      parsed.periods = parsed.periods.filter(function (p) { return p && typeof p === 'object'; }).slice(0, 40);
      parsed.startingAmount = Math.max(0, Number(parsed.startingAmount) || 0);
      parsed.periods.forEach(function (p) {
        p.name = String(p.name === undefined || p.name === null ? '' : p.name).slice(0, 80);
        p.months = Math.max(0, Math.floor(Number(p.months) || 0));
        p.monthlyContribution = Number(p.monthlyContribution) || 0;
        p.annualRatePercent = isFinite(Number(p.annualRatePercent)) ? Number(p.annualRatePercent) : 0;
        // Absent before extras could be anchored to a season.
        if (typeof p.id !== 'string' || !p.id) p.id = newPeriodId();
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
      parsed.windfalls = parsed.windfalls.filter(function (w) { return w && typeof w === 'object'; }).slice(0, 40);
      parsed.windfalls.forEach(function (w) {
        w.name = String(w.name === undefined || w.name === null ? '' : w.name).slice(0, 80);
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
        // Absent before extras rose with inflation: those were fixed amounts, and keep meaning that.
        w.fixed = w.fixed === undefined ? true : w.fixed === true;
        // Absent before extras could be anchored: measured from the plan start.
        w.anchor = typeof w.anchor === 'string' && w.anchor ? w.anchor : null;
        w.anchorOffset = Math.max(0, Math.floor(Number(w.anchorOffset) || 0));
        w.untilSeason = w.untilSeason === true;
        // Left undefined when absent: syncAnchors derives it from the stored absolute month.
        if (w.untilOffset !== null) w.untilOffset = isFinite(Number(w.untilOffset)) && w.untilOffset !== undefined && w.untilOffset !== ''
          ? Math.max(0, Math.floor(Number(w.untilOffset))) : undefined;
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
        ? { balances: b.balances, depletedAt: typeof b.depletedAt === 'number' ? b.depletedAt : null } : null;
      return parsed;
    } catch (e) { return null; }
  }

  // ------------------------------------------------------------ rendering

  function periodMeta() {
    return state.periods.map(function (p, i) {
      // A ninth season shares a hue; the chart and legend draw it dashed / hollow.
      var reused = state.periods.slice(0, i).some(function (q) { return q.colorSlot % Chart.slotCount === p.colorSlot % Chart.slotCount; });
      return { name: seasonName(p, i), colorSlot: p.colorSlot, reused: reused };
    });
  }

  /* One marker per occurrence — a repeat contributes several. Skips extras that
     never land and zero amounts, which would mark the chart for nothing. */
  function windfallMeta(projection, ranOutAt) {
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
      // Monthly or quarterly repeats are dense: a dozen markers is plenty to show the rhythm.
      var maxMarks = Number(w.repeatEvery) && Number(w.repeatEvery) < 12 ? 12 : 24;
      var step = months.length > maxMarks ? Math.ceil(months.length / maxMarks) : 1;
      months.forEach(function (mth, k) {
        if (k % step && k !== months.length - 1) return;
        // Past a run-out the money only passes through; markers along $0 in the wash are noise (the key counts them).
        if (ranOutAt !== null && ranOutAt !== undefined && mth > ranOutAt) return;
        out.push({ name: w.name || ('Extra ' + (i + 1)), atMonth: mth, amount: viewMoney(Calc.extraAt(w, mth, state.inflationPercent), mth),
                   shapeSlot: w.shapeSlot, repeat: months.length > 1 });
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
  // In a display headline or chart label a long name is cut, so the answer stays one or two lines.
  function shortName(name) {
    if (name.length <= 24) return name;
    var cut = name.slice(0, 23), space = cut.lastIndexOf(' ');
    return (space > 12 ? cut.slice(0, space) : cut).replace(/[\s,.;:]+$/, '') + '\u2026';
  }

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
      wholeUnit(p, 'lengthUnit', p.months);
      var li = document.createElement('li');
      li.className = 'period';
      li.dataset.index = i;
      li.style.setProperty('--period-color', Chart.colorFor(p.colorSlot));
      setNodeColors(li, p.colorSlot);
      /* Eight hues, and a ninth season shares one: its node turns hollow so the
         two never read as the same season. */
      var reused = state.periods.slice(0, i).some(function (q) { return q.colorSlot % Chart.slotCount === p.colorSlot % Chart.slotCount; });
      li.classList.toggle('color-reused', reused);
      li.classList.toggle('collapsed', expanded !== p);

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
        // A collapsed season is this one row; tap it to edit.
        // Named by its visible text (label-in-name), with "Edit season n:" for screen readers.
        '<button type="button" class="card-summary" data-action="expand" aria-expanded="false">' +
          '<span class="sr-only">Edit season ' + n + ': </span>' +
          '<span class="card-summary-name" data-role="sum-name"></span>' +
          '<span class="sr-only">, </span>' +
          '<span class="card-summary-meta" data-role="sum-meta"></span>' +
        '</button>' +
        '<div class="period-head">' +
          '<input type="text" data-field="name" value="' + escapeAttr(p.name) + '" aria-label="Season ' + n + ' name">' +
          '<button type="button" class="icon-btn" data-action="up" title="Move up" aria-label="Move season ' + n + ' up"' + (i === 0 ? ' disabled' : '') + '>' + ICON.up + '</button>' +
          '<button type="button" class="icon-btn" data-action="down" title="Move down" aria-label="Move season ' + n + ' down"' + (i === state.periods.length - 1 ? ' disabled' : '') + '>' + ICON.down + '</button>' +
          // Inside the head so phones can put it on the same row as the buttons.
          '<p class="period-range" data-role="range"></p>' +
          // Closes the card back to its one-line row (Escape does the same).
          '<button type="button" class="link-btn done-btn" data-action="collapse" aria-expanded="true" aria-label="Done with season ' + n + '">Done</button>' +
        '</div>' +
        '<div class="period-grid">' +
          '<div class="field">' +
            '<span class="field-label">Length</span>' +
            timeField('months', p.months, unitOf(p.lengthUnit, p.months), 'Length, season ' + n) +
            '<span class="months-note" data-role="months-note"></span>' +
          '</div>' +
          '<label class="field">' +
            '<span class="field-label">Expected yearly return</span>' +
            '<span class="pct"><span class="affix">%</span>' +
              '<input type="number" step="0.1" data-field="annualRatePercent" aria-label="Expected yearly return, season ' + n + '" aria-describedby="rate-note-' + n + '" value="' + escapeAttr(p.annualRatePercent) + '">' +
            '</span>' +
            '<span class="field-note rate-note" data-role="rate-note" id="rate-note-' + n + '" hidden></span>' +
            // Said once, on the first card, where the question first comes up.
          '</label>' +
          '<div class="field wide">' +
            '<span class="field-label" id="flow-label-' + n + '">Each month</span>' +
            '<div class="flow-row">' +
              // One visible choice: what the season does with money, and for withdrawals how.
              '<div class="segmented" role="group" aria-label="Each month, season ' + n + '">' +
                flowButton(p, 'save', 'Save') +
                flowButton(p, 'percent', 'Withdraw&nbsp;<span class="flow-unit">%</span>') +
                flowButton(p, 'dollars', 'Withdraw&nbsp;<span class="flow-unit">$</span>') +
              '</div>' +
              amountField(p, n) +
            '</div>' +
            '<p class="field-note" data-role="flow-note" id="flow-note-' + n + '"></p>' +
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
              '<span class="select-wrap"><select data-field="compounding">' + compOptions + '</select></span>' +
            '</label>' +
            '<p class="apy-note" data-role="apy"></p>' +
            '<div class="field">' +
              '<span class="field-label" id="color-label-' + n + '">Color on the chart</span>' +
              '<div class="swatches" role="group" aria-labelledby="color-label-' + n + '">' + swatches + '</div>' +
            '</div>' +
          '</div>' +
        '</details>' +
        '<p class="warn-note" data-role="warn" hidden></p>' +
        /* The foot: Delete well away from Done (never the next Tab stop or a thumb-slip
           from it), and a second Done so a thumb need not travel back up a tall card. */
        '<div class="card-foot">' +
          '<button type="button" class="link-btn danger-link" data-action="delete" aria-label="Delete season ' + n + '">Delete season</button>' +
          '<button type="button" class="link-btn done-btn done-foot" data-action="collapse" aria-label="Done with season ' + n + '">Done</button>' +
        '</div>';

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
        // The note under the choice says what this comes to; a screen reader hears it with the field.
        ' aria-describedby="flow-note-' + n + '"' +
        ' value="' + escapeAttr(p.withdrawPercent) + '"></span>';
    }
    return '<span class="money"><span class="affix">$</span>' +
      '<input type="number" min="0" step="50" data-field="monthlyContribution" aria-label="' +
        (mode === 'save' ? 'Amount saved each month' : 'Amount withdrawn each month, in today’s dollars') + ', season ' + n + '"' +
      ' aria-describedby="flow-note-' + n + '"' +
      ' value="' + escapeAttr(Math.abs(Number(p.monthlyContribution) || 0)) + '"></span>';
  }

  // Non-structural bits that change as you type.
  // A return outside what markets have ever done over long stretches (a likely typo).
  function rateFlagged(p) {
    var r = Number(p.annualRatePercent) || 0;
    return r < -50 || r > 30;
  }

  function refreshCardNotes(li, p) {
    // A typo like -150% is accepted (downturns are real), but said out loud.
    var rate = Number(p.annualRatePercent) || 0, rateNote = li.querySelector('[data-role="rate-note"]');
    if (rateNote) {
      rateNote.hidden = !rateFlagged(p);
      rateNote.textContent = rate < -50 ? 'A loss of more than half every year: is that a typo?'
        : 'Far above what markets have returned over long stretches: is that a typo?';
    }
    var months = Math.max(0, Math.floor(Number(p.months) || 0));
    // The note gives the other unit, so the conversion is always visible.
    li.querySelector('[data-role="months-note"]').textContent = !months ? ''
      : unitOf(p.lengthUnit, p.months) === 'years'
        // In years, also give the plain length when it isn't whole years ("= 1,100 months, 91y 8m").
        ? '= ' + months.toLocaleString('en-US') + (months === 1 ? ' month' : ' months') + (months % 12 ? ', ' + Chart.durationLabel(months) : '')
        : '= ' + Chart.durationLabel(months);
    li.querySelector('[data-role="apy"]').textContent = apyText(p);
    var comp = COMPOUNDING.filter(function (c) { return c.value === p.compounding; })[0];
    li.querySelector('[data-role="more-sum"]').textContent =
      '· ' + (comp ? comp.label.toLowerCase() : 'monthly') + ' compounding, ' +
      Chart.colorNames[p.colorSlot % Chart.slotCount].toLowerCase();
    // The collapsed row: name, then length · what it does each month · return.
    var mode = flowMode(p);
    var each = mode === 'save'
      ? (Number(p.monthlyContribution) ? Chart.money0.format(Number(p.monthlyContribution)) + '/mo saved' : 'no saving')
      : mode === 'percent' ? (Number(p.withdrawPercent) || 0) + '% withdrawn'
      : Chart.money0.format(Math.abs(Number(p.monthlyContribution) || 0)) + '/mo withdrawn';
    li.querySelector('[data-role="sum-name"]').textContent = p.name || 'Untitled season';
    var rateOdd = rateFlagged(p);
    li.querySelector('[data-role="sum-meta"]').textContent =
      (months ? Chart.durationLabel(months) : 'no length') + ' \u00b7 ' + each + ' \u00b7 ' + (Number(p.annualRatePercent) || 0) + '% return' +
      // Collapsed, the card's "is that a typo?" note is hidden: the row says it instead.
      (rateOdd ? ' \u00b7 is that a typo?' : '');
    li.classList.toggle('rate-odd', rateOdd);
  }

  // How many times an extra lands within the plan, and their sum in the page's money: one source for the note and the toast.
  function extraTally(w, horizon) {
    var months = Calc.windfallMonths(w, horizon).filter(function (mth) { return mth <= horizon; });
    return {
      count: months.length,
      total: months.reduce(function (sum, mth) { return sum + viewMoney(Calc.extraAt(w, mth, state.inflationPercent), mth); }, 0)
    };
  }

  // "the plan start" or "the start of <season>", for the At field's anchor.
  function anchorOptions(w) {
    // The first season starts with the plan: its entry is the plan-start clock, named for the season.
    var first = state.periods.length ? escapeHtml(shortName(seasonName(state.periods[0], 0))) : 'The plan start';
    return '<option value=""' + (w.anchor ? '' : ' selected') + '>' + first + '</option>' +
      state.periods.slice(1).map(function (p, k) {
        return '<option value="' + escapeAttr(p.id) + '"' + (w.anchor === p.id ? ' selected' : '') + '>' +
          escapeHtml(shortName(seasonName(p, k + 1))) + '</option>';
      }).join('');
  }

  /* Structural render: rebuilds every row. Add / delete only — same rule as the
     period cards, since rebuilding mid-input would destroy the caret. */
  function renderWindfalls() {
    el.windfallList.innerHTML = '';
    el.windfallEmpty.hidden = state.windfalls.length > 0;

    state.windfalls.forEach(function (w, i) {
      wholeUnit(w, 'everyUnit', w.repeatEvery);
      wholeUnit(w, 'atUnit', w.atMonth);
      wholeUnit(w, 'untilUnit', w.repeatUntil);
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
              '<input type="number" step="1000" data-field="amount" placeholder="0" aria-label="Amount, extra ' + (i + 1) + '" aria-describedby="at-note-' + i + '" value="' + (Number(w.amount) ? escapeAttr(w.amount) : '') + '">' +
            '</span>' +
          '</label>' +
          '<div class="field wide">' +
            // The label says what the season choice means, so the options are just names (never cut mid-word).
            '<span class="field-label">At, counted from the start of</span>' +
            // Measured from the plan start or from a season's start, so "when I retire" stays put.
            '<div class="anchor-row">' +
              '<span class="select-wrap"><select data-field="anchor" aria-label="At, measured from, extra ' + (i + 1) + '">' + anchorOptions(w) + '</select></span>' +
              timeField('atMonth', w.anchor ? w.anchorOffset : w.atMonth, unitOf(w.atUnit, w.anchor ? w.anchorOffset : w.atMonth), 'At, extra ' + (i + 1),
                ' data-from="' + escapeAttr(w.anchor || '') + '"') +
            '</div>' +
          '</div>' +
        '</div>' +
        // A choice, not an opt-out: does the amount keep pace with prices or stay as typed?
        // It belongs to the amount, so it comes before Repeat and the fields Repeat reveals.
        '<div class="extra-choice" role="radiogroup" aria-label="Amount over time, extra ' + (i + 1) + '">' +
          '<label class="repeat-toggle"><input type="radio" name="fixed-' + i + '" data-field="fixed" value="no"' + (w.fixed ? '' : ' checked') + '> Rises with prices</label>' +
          '<label class="repeat-toggle"><input type="radio" name="fixed-' + i + '" data-field="fixed" value="yes"' + (w.fixed ? ' checked' : '') + '> Stays the same</label>' +
        '</div>' +
        '<div class="extra-toggles">' +
          '<label class="repeat-toggle">' +
            '<input type="checkbox" data-field="repeat"' + (repeats ? ' checked' : '') + '> Repeat' +
          '</label>' +
        '</div>' +
        '<div class="repeat-fields"' + (repeats ? '' : ' hidden') + '>' +
          '<div class="field">' +
            '<span class="field-label">Every</span>' +
            timeField('repeatEvery', w.repeatEvery || 12, unitOf(w.everyUnit, w.repeatEvery || 12), 'Every') +
          '</div>' +
          '<div class="field">' +
            '<span class="field-label">Until <span class="field-aside">(blank: to the end of the plan)</span></span>' +
            timeField('repeatUntil', untilShown(w), unitOf(w.untilUnit, untilShown(w) || 0), 'Until', ' data-from="' + escapeAttr(w.anchor || '') + '"') +
          '</div>' +
        '</div>' +
        '<p class="months-note" data-role="at-note" id="at-note-' + i + '"></p>' +
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
      // Seasons renamed, added or reordered: the anchor list follows (never while it is open).
      var anchorSel = li.querySelector('[data-field="anchor"]');
      var opts = anchorOptions(w);
      if (anchorSel && document.activeElement !== anchorSel && anchorSel.dataset.opts !== opts) { anchorSel.innerHTML = opts; anchorSel.dataset.opts = opts; }
      // Its season was deleted: the field now shows months from the plan start.
      var atInput = li.querySelector('[data-field="atMonth"]');
      if (atInput && atInput.dataset.from !== (w.anchor || '') && document.activeElement !== atInput) {
        atInput.dataset.from = w.anchor || '';
        var shownAt = w.anchor ? w.anchorOffset : w.atMonth;
        w.atUnit = unitOf(null, shownAt);
        atInput.value = timeDisplay(shownAt, w.atUnit);
        atInput.closest('.unit-field').querySelector('select').value = w.atUnit;
      }
      // Following its season's end: show the month it now stops at.
      var untilInput = li.querySelector('[data-field="repeatUntil"]');
      if (untilInput && document.activeElement !== untilInput && (w.untilSeason || untilInput.dataset.from !== (w.anchor || ''))) {
        untilInput.dataset.from = w.anchor || '';
        var u = untilShown(w);
        untilInput.value = u === null ? '' : timeDisplay(u, unitOf(w.untilUnit, u));
      }

      var months = Calc.windfallMonths(w, horizon).filter(function (mth) { return mth <= horizon; });
      var at = Math.max(0, Math.floor(Number(w.atMonth) || 0));
      var every = Math.max(0, Math.floor(Number(w.repeatEvery) || 0));
      var within = periodAt(projection, at);
      var anchorIdx = w.anchor ? state.periods.map(function (p) { return p.id; }).indexOf(w.anchor) : -1;
      var lands = anchorIdx >= 0
        // Said in the season's own terms, the way it was set.
        ? 'Lands ' + (w.anchorOffset ? Chart.durationLabel(w.anchorOffset) + ' into ' : 'in the first month of ') +
          shortName(seasonName(state.periods[anchorIdx], anchorIdx)) + ' (' + Chart.durationLabel(at) + ' into the plan)'
        : at
        ? 'Lands at ' + Chart.durationLabel(at) + (within ? ', during ' + within : '')
        : 'Lands at the start';
      var amount = Number(w.amount) || 0;
      var rising = !w.fixed && amount && Number(state.inflationPercent) > 0;
      if (every && months.length > 1) {
        // The total in the page's money, the same sum the results use.
        var total = extraTally(w, horizon).total;
        // Until, said in the same season's terms as At.
        var untilWords = w.repeatUntil === null ? '' : w.untilSeason && anchorIdx >= 0
          ? ' until the end of ' + shortName(seasonName(state.periods[anchorIdx], anchorIdx))
          : anchorIdx >= 0 ? ' until ' + Chart.durationLabel(untilShown(w)) + ' into ' + shortName(seasonName(state.periods[anchorIdx], anchorIdx)) : '';
        lands += ', then every ' + Chart.durationLabel(every) + untilWords + ' \u2014 ' + months.length + ' payments' +
                 (amount ? ', ' + Chart.money0.format(total) + ' in total' +
                   (state.view.money === 'today' && Number(state.inflationPercent) > 0 ? ' in today\u2019s dollars' : '') : '');
      }
      if (rising) lands += '. Rises with prices';
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

  /* Extras anchored to a season keep their place in it: their absolute month is
     re-derived from the season's start whenever lengths or order change. An
     anchored offset of 0 is the season's first month. "Until the end of its
     season" (set when Repeat is ticked) follows that season's end the same way. */
  function seasonStarts() {
    var at = 0;
    return state.periods.map(function (p) {
      var start = at;
      at = Math.min(Calc.MAX_TOTAL_MONTHS, at + Math.max(0, Math.floor(Number(p.months) || 0)));
      return { id: p.id, start: start, end: at };
    });
  }
  // Where an extra's At and Until are counted from: its season's start, or the plan start.
  function anchorStart(w) {
    var span = w.anchor ? seasonStarts().filter(function (sp) { return sp.id === w.anchor; })[0] : null;
    return span ? span.start : 0;
  }
  // The Until field's number: months after that start, or '' for "to the end".
  function untilShown(w) {
    return w.repeatUntil === null || w.repeatUntil === undefined ? null : Math.max(0, w.repeatUntil - anchorStart(w));
  }
  function syncAnchors() {
    var spans = seasonStarts();
    state.windfalls.forEach(function (w) {
      if (w.anchor) {
        var span = spans.filter(function (sp) { return sp.id === w.anchor; })[0];
        // Its season was deleted, or became the first (whose start is the plan start):
        // keep the month it last had, measured from the plan start.
        if (!span || span === spans[0]) { w.anchor = null; }
        else {
          w.atMonth = span.start + 1 + w.anchorOffset;
          // Until counts from the same season start ("until 10 yrs" = 10 yrs into it).
          if (w.untilOffset === undefined) w.untilOffset = w.repeatUntil === null ? null : Math.max(0, w.repeatUntil - span.start);
          if (!w.untilSeason) w.repeatUntil = w.untilOffset === null ? null : span.start + w.untilOffset;
        }
      }
      if (w.untilSeason && Number(w.repeatEvery) > 0) {
        var home = spans.filter(function (sp, k) {
          return w.anchor ? sp.id === w.anchor : w.atMonth > sp.start && w.atMonth <= sp.end;
        })[0];
        var last = spans[spans.length - 1];
        w.repeatUntil = home && home !== last ? home.end : null;
        if (w.repeatUntil !== null) w.untilUnit = unitOf(null, w.repeatUntil);
      }
    });
  }

  function renderResults() {
    syncAnchors();
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
    var drawMonthsAll = drawing.reduce(function (sum, pp) { return sum + pp.months; }, 0);
    // A withdrawing season pushed past the 100-year cap: say so rather than quietly switching questions.
    var cappedDraw = !drawdown && nominal.perPeriod.filter(function (pp, i) {
      return !pp.months && pp.truncated && Calc.isWithdrawing(state.periods[i]);
    })[0];
    // Which money the page is in lives by its switch, not in every sub-line.
    el.moneyNote.textContent = today ? 'at ' + state.inflationPercent + '% inflation' : 'as they\u2019ll be';
    var seasons = state.periods.length + (state.periods.length === 1 ? ' season' : ' seasons');
    // How far into its season the money runs out: "7y 6m into Retirement".
    /* Which planned expense (negative extra), if any, lands in the month the
       money runs out: then it is the cause, and the page names it. */
    var culprit = -1;
    if (depleted) {
      // The latest expense landing in the run-out's season, at or before it.
      var inOut = seasonAt(projection, t.depletedAt);
      var from = inOut ? inOut.pp.startMonth + 1 : 1, latest = -1;
      state.windfalls.forEach(function (w, wi) {
        if (!(Number(w.amount) < 0)) return;
        Calc.windfallMonths(w, t.totalMonths).forEach(function (mth) {
          if (mth >= from && mth <= t.depletedAt && mth > latest) { latest = mth; culprit = wi; }
        });
      });
    }
    // One way of saying when, everywhere: "6y 6m into Retirement", with the plan year beside it.
    var outWhen = depleted ? inSeasonText(projection, t.depletedAt) : '';
    var runsOut = depleted
      ? 'Runs out ' + outWhen + (culprit >= 0 ? ', after ' + (state.windfalls[culprit].name || 'Extra ' + (culprit + 1)) : '')
      : '';
    var planYear = depleted ? 'year ' + (Math.floor((t.depletedAt - 1) / 12) + 1) + ' of the plan' : '';
    // The bar's short form names the season, not a dangling "in": "Runs out in Retirement".
    var outSpot = depleted ? seasonAt(projection, t.depletedAt) : null;
    var outSeason = outSpot ? shortName(outSpot.name) : depleted ? 'year ' + (Math.floor((t.depletedAt - 1) / 12) + 1) : '';
    /* Nothing "runs out" without a withdrawal: a saving plan that a planned
       expense leaves below zero ends in debt, said like a dip. "Runs out" is
       kept for withdrawals that could not be paid. */
    var endsBelow = depleted && !drawdown;
    var belowCause = endsBelow && culprit >= 0 ? state.windfalls[culprit].name || 'Extra ' + (culprit + 1) : '';
    if (endsBelow) depleted = false;

    if (drawdown) {
      el.finalLabel.textContent = 'Will it last?';
      // "Lasts through Retirement", not "lasts all 45 yrs": the saving years are not the question.
      var lastDraw = drawing[drawing.length - 1];
      var drawMonths = drawing.reduce(function (sum, pp) { return sum + pp.months; }, 0);
      var shortBy = t.totalShortfall + Math.max(0, -t.finalAmount);
      /* A lifetime shortfall is a number nobody can picture; per month, over how long, is.
         The total stays in "How it adds up" and the table. */
      var shortMonths = projection.points.filter(function (pt) { return pt.short > 0; }).length;
      var shortText = shortMonths && t.totalShortfall >= 1
        ? 'About ' + Chart.money0.format(Math.round(t.totalShortfall / shortMonths / 10) * 10) + ' a month unpaid for ' + Chart.durationLabel(shortMonths)
        : 'Short by ' + Chart.money0.format(shortBy);
      var through = 'Lasts through ' + shortName(seasonName(state.periods[lastDraw.index], lastDraw.index));
      // A withdrawing season the 100-year cap cut short does not get to say "lasts through" plainly.
      var trimmed = drawing.filter(function (pp) { return pp.truncated; })[0];
      el.finalAmount.textContent = depleted ? runsOut
        : through;
      // One line: where it ends, then the frame (withdrawal years). The cap caveat lives here, not in the headline.
      el.finalSub.textContent = (!depleted && trimmed ? shortName(seasonName(state.periods[trimmed.index], trimmed.index)) + ' cut to ' +
          Chart.durationLabel(trimmed.months) + ' by the ' + (Calc.MAX_TOTAL_MONTHS / 12) + '-year limit \u00b7 ' : '') + (depleted
        ? shortText + ' \u00b7 ' + planYear
        : Chart.money0.format(t.finalAmount) + ' left at the end') +
        (!depleted ? ' \u00b7 ' + Chart.durationLabel(drawMonths) + ' of withdrawals' : '');
      // The bar gets the short form, so it stays on one line on a phone.
      el.resultBarValue.textContent = depleted ? 'Runs out in ' + outSeason : 'Lasts \u00b7 ' + Chart.money0.format(t.finalAmount) + ' left';
    } else if (cappedDraw) {
      el.finalLabel.textContent = 'Will it last?';
      el.finalAmount.textContent = seasonName(state.periods[cappedDraw.index], cappedDraw.index) + ' gets no time';
      el.finalSub.textContent = 'The plan already reaches the ' + (Calc.MAX_TOTAL_MONTHS / 12) +
        '-year limit. Shorten an earlier season. \u00b7 ' + Chart.money0.format(t.finalAmount) + ' at the end';
      el.resultBarValue.textContent = 'Gets no time';
    } else if (endsBelow) {
      el.finalLabel.textContent = 'Final amount';
      el.finalAmount.textContent = 'Ends ' + Chart.money0.format(-t.finalAmount) + ' below zero' + (belowCause ? ', after ' + belowCause : '');
      el.finalSub.textContent = 'Borrowed against the plan from ' + inSeasonText(projection, t.depletedAt) + ' \u00b7 ' +
        Chart.durationLabel(t.totalMonths) + ', ' + seasons;
      el.resultBarValue.textContent = Chart.money0.format(t.finalAmount);
    } else {
      el.finalLabel.textContent = short ? 'Shortfall at the end' : 'Final amount';
      el.finalAmount.textContent = Chart.money0.format(t.finalAmount);
      el.finalSub.textContent = t.totalMonths
        ? Chart.durationLabel(t.totalMonths) + ', ' + seasons
        : 'No seasons yet: this is just the starting amount.';
      el.resultBarValue.textContent = Chart.money0.format(t.finalAmount);
    }
    el.finalAmount.classList.toggle('short', depleted || short);
    el.finalAmount.classList.toggle('doubt', state.periods.some(rateFlagged));
    // The pinned bar says a run-out in the same Loss Red as the headline.
    el.resultBar.classList.toggle('short', depleted || short);
    el.finalAmount.classList.toggle('answer', drawdown || !!cappedDraw || endsBelow);
    document.querySelector('.result-bar-label').textContent = drawdown || cappedDraw ? 'Will it last?' : 'Final amount';

    /* Running out without any withdrawals (a big negative extra) still needs
       saying; with withdrawals the headline already says it. */
    // A real below-zero stretch caused by a planned expense; nothing else earns this warning.
    var dipOnly = !depleted && !endsBelow && t.lowestBalance < 0 && t.monthsBelowZero > 0 &&
      state.windfalls.some(function (w) { return Number(w.amount) < 0; });
    // The headline already states a run-out or a below-zero ending; the warning line is for a dip that recovers.
    el.depletionWarn.hidden = !dipOnly;
    if (!el.depletionWarn.hidden) {
      var at = dipOnly ? t.dippedAt : t.depletedAt;
      var during = periodAt(projection, at);
      // A recovered dip is still worth saying: for those months the money was not there.
      // A recovered dip is borrowing against the plan: say how deep and for how long.
      el.depletionWarn.textContent = dipOnly
        ? 'A planned expense takes the balance ' + Chart.money0.format(-t.lowestBalance) + ' below zero ' +
          inSeasonText(projection, at) + ', for ' + Chart.durationLabel(t.monthsBelowZero) +
          ' (money borrowed against the plan), then it recovers.'
        : 'The balance goes below zero ' + inSeasonText(projection, at) + '. After that the plan is short.';
    }
    // The expense behind a recovered dip, for its own lever.
    var dipCulprit = -1;
    if (dipOnly) {
      var latestDip = -1;
      state.windfalls.forEach(function (w, wi) {
        if (!(Number(w.amount) < 0)) return;
        Calc.windfallMonths(w, t.totalMonths).forEach(function (mth) {
          if (mth <= t.dippedAt && mth > latestDip) { latestDip = mth; dipCulprit = wi; }
        });
      });
    }
    // Ending below zero gets the dip's lever: the expense size that would keep it above zero.
    renderLever(depleted, drawdown, culprit, today, endsBelow ? culprit : dipCulprit);
    // A season the 100-year cap cut short only "lasts" because it ends early: no "you could withdraw more".
    if (drawdown && !depleted && trimmed) el.leverNote.hidden = true;

    /* Paid in counts money going in. A negative extra (a planned expense) is
       money out, so it is reported beside it rather than netted into it. In
       today's dollars, the as-typed sum is shown too, so it matches your maths. */
    function expenses(proj) {
      return proj.points.reduce(function (sum, pt) { return sum + Math.min(0, Number(pt.extra) || 0); }, 0);
    }
    /* Paid in is the starting amount plus savings, the same as the table's
       column; extras (a pension, a gift) are their own line, so they are never
       mistaken for "you put in". */
    var paidIn = t.totalContributed - t.totalWindfalls;
    var paidTyped = nominal.totals.totalContributed - nominal.totals.totalWindfalls;
    var spent = -expenses(projection);
    var gotExtras = t.totalWindfalls + spent;
    // What you typed leads: your own sum. Its worth today, and planned expenses, are notes beneath.
    // Lead in the page's money, like every other figure; what you typed is the note beneath.
    el.contributed.textContent = Chart.money0.format(paidIn);
    el.contributedNote.innerHTML = (today && Math.abs(paidTyped - paidIn) >= 1
      ? 'you put in ' + Chart.money0.format(paidTyped)
      : !t.totalMonths ? 'starting amount'
      : 'starting amount' + (nominal.perPeriod.some(function (pp) { return pp.contributed > 0; }) ? ' + savings' : '')) +
      (gotExtras >= 1 ? '<br>plus ' + Chart.money0.format(gotExtras) + ' from extras' : '') +
      (spent >= 1 ? '<br>' + Chart.money0.format(spent) + ' of planned expenses taken out' : '');
    /* The row added up, in the page's money, behind a "How it adds up" toggle
       so it is there for whoever checks without crowding the answer. */
    var eq = [Chart.money0.format(paidIn) + ' paid in', Chart.money0.format(Math.abs(t.totalGrowth)) + (t.totalGrowth < 0 ? ' lost' : ' growth')];
    var sum = el.kpiSum;
    if (t.totalMonths) {
      sum.textContent = eq[0] +
        (gotExtras >= 1 ? ' + ' + Chart.money0.format(gotExtras) + ' extras' : '') +
        (t.totalGrowth < 0 ? ' \u2212 ' : ' + ') + eq[1] +
        (t.totalWithdrawn >= 1 ? ' \u2212 ' + Chart.money0.format(t.totalWithdrawn) + ' withdrawn' : '') +
        (spent >= 1 ? ' \u2212 ' + Chart.money0.format(spent) + ' expenses' : '') +
        ' = ' + Chart.money0.format(t.finalAmount) + (t.finalAmount < 0 ? '' : ' left') + '.' +
        (t.totalShortfall >= 1 ? ' Then ' + Chart.money0.format(t.totalShortfall) + ' of withdrawals it couldn\u2019t pay.' : '');
      el.kpiSumWrap.hidden = false;
    } else { el.kpiSumWrap.hidden = true; }
    // Say which money the figure is in, so "you put in $70,000" beneath it reads as the same sum, restated.
    el.paidLabel.textContent = today ? 'Paid in, in today\u2019s dollars' : 'Total paid in';
    el.growthLabel.textContent = today ? 'Growth after inflation' : 'Total growth';
    el.growth.textContent = Chart.money0.format(t.totalGrowth);
    // Once the money has run out, "growth" mixes gains with a shrinking debt: no green.
    // Ending in debt is no more a win than running out: no green either way.
    el.growth.className = 'kpi-value ' + (depleted || endsBelow ? '' : t.totalGrowth > 0 ? 'up' : t.totalGrowth < 0 ? 'down' : '');
    el.growthNote.textContent = t.lowestBalance < 0 && !depleted
      ? 'after interest on the borrowed amount'
      : depleted
      ? 'while there was money to grow'
      : t.totalMonths && paidIn + Math.max(0, gotExtras) > 0
        ? growthNote(t.totalGrowth / (paidIn + Math.max(0, gotExtras)))
        : '\u00a0';
    // The third figure: what a saving plan could pay out, or what a drawdown plan took out.
    if (drawdown) {
      el.thirdLabel.textContent = 'Withdrawn';
      el.income.textContent = Chart.money0.format(t.totalWithdrawn);
      // With one withdrawing season, say what it is per month (today's dollars, constant).
      var outs = state.periods.map(function (p, i) { return Calc.isWithdrawing(p) ? i : -1; }).filter(function (i) { return i >= 0; });
      // Several withdrawing seasons: the first one's monthly amount, named, so there is always a per-month figure.
      var firstOut = outs.filter(function (i) { return nominal.perPeriod[i] && nominal.perPeriod[i].firstWithdrawal > 0; })[0];
      var monthly = firstOut !== undefined ? nominal.perPeriod[firstOut].firstWithdrawal : 0;
      var inFirst = outs.length > 1 && firstOut !== undefined ? ' in ' + shortName(seasonName(state.periods[firstOut], firstOut)) : '';
      // In the money the page is in: today's (constant), or future dollars at the start, rising.
      var startOf = firstOut !== undefined ? nominal.perPeriod[firstOut] : null;
      // The shortfall is said once, in the sub-line; here, how much of the withdrawing time it paid for.
      var paidMonths = depleted ? drawing.reduce(function (sum, pp) {
        return sum + Math.max(0, Math.min(pp.endMonth, t.depletedAt) - pp.startMonth);
      }, 0) : 0;
      el.incomeNote.textContent = depleted
        ? (paidMonths ? 'fully paid for the first ' + Chart.durationLabel(paidMonths) + ' of ' + Chart.durationLabel(drawMonthsAll) : 'none of it fully paid')
        : !(monthly > 0) ? 'taken out over the withdrawing seasons'
        : today ? Chart.money0.format(monthly) + '/month' + inFirst + ' in today\u2019s dollars'
        : Chart.money0.format(monthly * Calc.deflator(startOf.startMonth + 1, state.inflationPercent)) +
          (Number(state.inflationPercent) > 0 ? '/month' + inFirst + ' to start, rising with inflation' : '/month' + inFirst);
    } else if (endsBelow) {
      // Ending in debt there is no income to show: say what is owed instead of a dead $0.
      el.thirdLabel.textContent = 'Owed at the end';
      el.income.textContent = Chart.money0.format(-t.finalAmount);
      el.incomeNote.textContent = 'borrowed against the plan';
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
      // Collapsed, a capped season would look normal; say so in its row.
      var sumMeta = li.querySelector('[data-role="sum-meta"]');
      if (!pp.months && pp.truncated) sumMeta.textContent = 'Past the ' + (Calc.MAX_TOTAL_MONTHS / 12) + '-year limit: gets no time';
      // Cut short by the cap: the row shows the length it really gets.
      else if (pp.truncated) sumMeta.textContent = sumMeta.textContent.replace(/^[^\u00b7]+/, Chart.durationLabel(pp.months) + ' (cut by the limit) ');
      // Long form, plus a compact one ("20–45 yrs") phones use beside the buttons.
      var rangeEl = li.querySelector('[data-role="range"]');
      rangeEl.innerHTML = pp.months
        ? '<span class="range-long">' + (pp.startMonth ? 'From ' + Chart.durationLabel(pp.startMonth) : 'From the start') +
          ' to ' + Chart.durationLabel(pp.endMonth) + '</span><span class="range-short">' +
          (pp.startMonth ? Chart.durationLabel(pp.startMonth).replace(/ yrs?$/, '') : '0') + '\u2013' +
          Chart.durationLabel(pp.endMonth) + '</span>'
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
    // Spoken with the same words as the headline, so what is heard matches what is shown.
    var summary = !t.totalMonths ? 'No seasons yet.'
      : drawdown
        ? (depleted ? el.finalAmount.textContent + '.'
                    : 'The money lasts all ' + Chart.durationLabel(t.totalMonths) + ', ending with ' +
                      Chart.money0.format(t.finalAmount) + (today ? ' in today’s dollars.' : '.'))
        : 'Final amount ' + Chart.money0.format(t.finalAmount) + (today ? ' in today’s dollars' : '') +
          ' after ' + Chart.durationLabel(t.totalMonths) + ', of which ' + Chart.money0.format(t.totalGrowth) + ' is growth.' +
          (endsBelow ? ' It ends below zero, money borrowed against the plan.' : '');
    // The container's reserved height follows the chart's, or a shorter chart would not shrink the column.
    el.chart.style.minHeight = chartHeight + 'px';
    Chart.render(el.chart, projection, {
      periods: periodMeta(), windfalls: windfallMeta(projection, depleted ? t.depletedAt : null),
      baseline: baseline, depletedAt: depleted ? t.depletedAt : null,
      depletedLabel: depleted ? 'Runs out \u00b7 ' + outWhen : null,
      belowZero: dipRanges(projection, endsBelow), belowZeroLabel: endsBelow ? 'Below zero from here'
        : dipOnly ? Chart.money0.format(-t.lowestBalance) + ' below zero' : null,
      label: 'Projected balance. ' + summary,
      height: chartHeight
    });
    lastChartWidth = el.chart.clientWidth;
    fitPin();
    // After the chart: the legend repeats season names only when the chart could not fit them.
    renderLegend(projection, baseline, !!(el.chart.__chart && el.chart.__chart.allLabels));
    announce(summary + (el.leverNote.hidden ? '' : ' ' + el.leverNote.textContent) +
      (el.baselineDelta.hidden ? '' : ' ' + el.baselineDelta.textContent + '.'));
  }

  /* One sentence on what would change the outcome. Short: how much less to
     withdraw, or how much more to start with. Lasting: how much more could be
     withdrawn. Withdrawal amounts are the ones typed into the cards (dollars of
     the day they are spent), so they are not restated in today's money. */
  function renderLever(depleted, drawdown, culprit, today, dipCulprit) {
    var text = '';
    /* A return that looks like a typo makes every figure suspect: say that instead
       of advising on it, and mute the headline (renderResults). */
    var oddAt = state.periods.map(function (p, i) { return rateFlagged(p) ? i : -1; }).filter(function (i) { return i >= 0; })[0];
    if (oddAt !== undefined) {
      var oddP = state.periods[oddAt];
      el.leverNote.textContent = '\u201c' + shortName(seasonName(oddP, oddAt)) + '\u201d has a ' + String(Number(oddP.annualRatePercent) || 0).replace('-', '\u2212') +
        '% yearly return: is that a typo? The answer above assumes it.';
      el.leverNote.hidden = false;
      return;
    }
    var withdrawing = state.periods.filter(Calc.isWithdrawing);
    var scale = drawdown ? Calc.withdrawalScale(state) : null;
    var only = withdrawing.length === 1 ? withdrawing[0] : null;
    var asPct = only && only.flow === 'withdraw' && only.withdrawUnit === 'percent';
    var one = only ? (asPct ? Number(only.withdrawPercent) : Math.abs(Number(only.monthlyContribution) || 0)) : 0;
    function roundDown(v) { return Math.floor(v / 10) * 10; }
    // Say a withdrawal the way it was typed: a percent, or today's dollars a month.
    // In Future $ mode, typed dollar amounts are still today's: say so once, at the end.
    /* In Future $, a monthly amount is said in the dollars of its season's first
       month (like the Withdrawn note), never as today's dollars mixed in. */
    var future = state.view.money === 'future' && Number(state.inflationPercent) > 0;
    var starts = seasonStarts();
    function inFuture(p, v) {
      if (!future) return v;
      var sp = starts.filter(function (x) { return x.id === p.id; })[0];
      return v * Calc.deflator((sp ? sp.start : 0) + 1, state.inflationPercent);
    }
    var tagFuture = future && !asPct;
    function amount(v, down) {
      if (asPct) return (Math.floor(v * 10) / 10) + '%';
      var f = only ? inFuture(only, v) : v;
      return Chart.money0.format(down ? roundDown(f) : f) + '/month';
    }
    /* Several withdrawing seasons: say each one's own figure ("9.3% in Early and
       $1,240/month in Late") rather than a percent of a percent. Past three, too long to say. */
    function perSeason(k) {
      var items = state.periods.map(function (p, i) { return { p: p, i: i }; }).filter(function (x) { return Calc.isWithdrawing(x.p); });
      if (items.length < 2 || items.length > 3) return '';
      var said = items.map(function (x) {
        var pct = x.p.flow === 'withdraw' && x.p.withdrawUnit === 'percent';
        var v = pct ? Number(x.p.withdrawPercent) * k : Math.abs(Number(x.p.monthlyContribution) || 0) * k;
        return (pct ? (Math.floor(v * 10) / 10) + '%' : Chart.money0.format(roundDown(inFuture(x.p, v))) + '/month') + ' in ' + shortName(seasonName(x.p, x.i));
      });
      return said.slice(0, -1).join(', ') + ' and ' + said[said.length - 1];
    }
    if (depleted) {
      var parts = [];
      // An expense caused it: the first lever is a smaller expense.
      if (culprit >= 0) {
        var k = Calc.extraScale(state, culprit);
        if (k > 0 && k < 1) {
          parts.push('An expense of ' + expenseAmount(culprit, k) + ' would make it last');
        }
      }
      if (scale !== null && scale > 0 && scale < 1) {
        parts.push(one
          ? 'Withdrawing ' + amount(one * scale, true) + ' instead of ' + amount(one) + ' would make it last'
          : perSeason(scale) ? 'Withdrawing ' + perSeason(scale) + ' would make it last'
          : 'Withdrawing about ' + Math.ceil((1 - scale) * 100) + '% less in each withdrawing season would make it last');
      }
      var more = Calc.extraStartNeeded(state);
      // Past $100M it is not advice, just arithmetic on an impossible plan (a -150% return): leave it out.
      if (isFinite(more) && more > 0 && more < 1e8) {
        var startMore = Chart.money0.format(Math.ceil(more / 1000) * 1000);
        parts.push(parts.length ? 'starting with ' + startMore + ' more would' : 'Starting with ' + startMore + ' more would make it last');
      }
      /* "A would make it last." then "So would b, or c." — later options are
         phrases, so "would make it last" is said once. */
      var tail = parts.slice(1).map(function (x) {
        return (x.charAt(0).toLowerCase() + x.slice(1)).replace(/ (would make it last|more would|would)$/, function (m) {
          return m === ' more would' ? ' more' : '';
        });
      });
      text = !parts.length ? ''
        : parts[0] + '.' + (tail.length ? ' So would ' + (tail.length > 1 ? tail.slice(0, -1).join(', ') + ', or ' : '') + tail[tail.length - 1] + '.' : '');
    } else if (drawdown && scale !== null && scale > 1.05) {
      // Past 5x the precise figure stops meaning anything; say it plainly.
      text = scale >= 5
        ? 'It lasts comfortably: you could withdraw more than 5\u00d7 as much and it would still last.'
        : one
          ? 'You could withdraw up to about ' + amount(one * scale, true) + ' and it would still last.'
          : perSeason(scale) ? 'You could withdraw up to ' + perSeason(scale) + ' and it would still last.'
          : scale >= 2
            ? 'You could withdraw about ' + (Math.floor(scale * 10) / 10) + '\u00d7 as much in each withdrawing season' + leverExample(withdrawing[0], scale) + ' and it would still last.'
            : 'You could withdraw about ' + Math.floor((scale - 1) * 100) + '% more in each withdrawing season' + leverExample(withdrawing[0], scale) + ' and it would still last.';
    }
    // Lasting with less than 5% to spare still deserves a sentence, not silence.
    if (!text && drawdown && !depleted && scale !== null && scale >= 1 && scale <= 1.05) {
      text = 'It only just lasts: there is little room to withdraw more.';
    }
    // A dip that recovers: how small the expense would need to be to never go below zero.
    if (!text && dipCulprit >= 0) {
      var kd = Calc.extraScale(state, dipCulprit);
      if (kd > 0 && kd < 1) text = 'An expense of ' + expenseAmount(dipCulprit, kd) + ' would keep it above zero.';
    }
    /* A plan that only saves still gets a lever: what a little more each month
       would add, in the money the page is in. */
    if (!text && !drawdown && !depleted) {
      var savers = state.periods.filter(function (p) { return !Calc.isWithdrawing(p) && Number(p.months) > 0; });
      if (savers.length) {
        var base = Calc.project(state), bumped = Calc.savingMoreAdds(state, 100);
        if (today) {
          base = Calc.inTodaysDollars(base, state.inflationPercent);
          bumped = Calc.inTodaysDollars(bumped, state.inflationPercent);
        }
        var gain = bumped.totals.finalAmount - base.totals.finalAmount;
        // A plan losing money gets no "save more" pitch: the return is the thing to look at.
        // Nor when a return looks like a typo, or the plan is already at the 100-year limit.
        var odd = state.periods.some(rateFlagged), capped = base.perPeriod.some(function (pp) { return pp.truncated; });
        if (gain >= 1 && base.totals.totalGrowth >= 0 && !odd && !capped) text = 'Saving $100 more a month would add about ' + Chart.money0.format(Math.round(gain / 100) * 100) + ' by the end.';
      }
    }
    // The tag sits right after the $/month figure it qualifies, not at the end of the sentence.
    // Say once which dollars those are: the season's first year, rising with prices after.
    // Right after the last $/month figure, so it never lands on another clause ("starting with $90,000 more").
    if (tagFuture && text) text = text.replace(/(\$[\d,]+\/month)(?![\s\S]*\$[\d,]+\/month)/, '$1 (first-year dollars, rising with prices)');
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
        // One kind of dollar in the sentence; the future-dollar figures sit behind a toggle.
        var future = Number(infl) > 0
          ? ' <details class="hint-more"><summary>In future dollars</summary>\u2248' +
            Chart.money0.format(monthly * Calc.deflator(pp.startMonth + 1, infl)) + '/month when this season starts, ' +
            Chart.money0.format(monthly * Calc.deflator(pp.endMonth, infl)) + ' by its end.</details>'
          : '';
        html = '<strong>' + Chart.money0.format(monthly) + ' a month</strong> in today\u2019s dollars' +
          (Number(infl) > 0 ? ', rising with prices. ' : ', the same every month (inflation is 0%). ');
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
        html += future;
      }
    }
    note.innerHTML = html;
    note.hidden = !html;
  }

  /* An expense scaled by k, in the money the page is in (a future-dollar expense
     is restated at the month it lands), so it matches the figures above. */
  // "(e.g. 4% \u2192 5.8%)": a concrete case, since "45% more" of a percent is ambiguous.
  function leverExample(p, scale) {
    if (!p) return '';
    if (p.flow === 'withdraw' && p.withdrawUnit === 'percent') {
      var pct = Number(p.withdrawPercent) || 0;
      return ' (e.g. ' + pct + '% \u2192 ' + (Math.floor(pct * scale * 10) / 10) + '%)';
    }
    var amt = Math.abs(Number(p.monthlyContribution) || 0);
    return ' (e.g. ' + Chart.money0.format(amt) + ' \u2192 ' + Chart.money0.format(Math.floor(amt * scale / 10) * 10) + '/month)';
  }

  /* An expense scaled by k, said the way it was typed. In today's dollars that
     is one number; a fixed amount (the dollars of the year it lands) also gets
     its worth today in brackets. */
  function expenseAmount(index, k) {
    var w = state.windfalls[index];
    var v = Math.floor(Math.abs(Number(w.amount)) * k / 100) * 100;
    if (!w.fixed) return Chart.money0.format(v) + ' or less' +
      (state.view.money === 'future' && Number(state.inflationPercent) > 0 ? ' (in today\u2019s dollars)' : '');
    var at = Math.max(0, Math.floor(Number(w.atMonth) || 0));
    var todayV = v / Calc.deflator(at, state.inflationPercent);
    // "$44,600 or less as typed (≈$21,200 today)": the bound stays next to the figure it qualifies.
    return Chart.money0.format(v) + ' or less' + (state.view.money === 'today' && Number(state.inflationPercent) > 0 && at > 0
      ? ' as typed (\u2248' + Chart.money0.format(Math.floor(todayV / 100) * 100) + ' today)' : '');
  }

  // "6y 6m into Retirement" for an absolute month, or "at 26y 6m" outside any season.
  function inSeasonText(projection, m) {
    var where = seasonAt(projection, m);
    return where ? Chart.durationLabel(m - where.pp.startMonth) + ' into ' + shortName(where.name) : 'at ' + Chart.durationLabel(m);
  }

  // The stretches where a planned expense took the balance below zero (before any run-out).
  // Below-zero stretches before any run-out (all of them when the plan simply ends below zero).
  function dipRanges(projection, toEnd) {
    var pts = projection.points, out = [], start = null, stop = toEnd ? null : projection.totals.depletedAt;
    for (var k = 1; k < pts.length; k++) {
      var under = pts[k].balance < 0 && (stop === null || k < stop);
      if (under && start === null) start = k - 1;
      if (!under && start !== null) { out.push([start, k]); start = null; }
    }
    if (start !== null) out.push([start, pts.length - 1]);
    return out;
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
    // Past 1,000% a percent stops meaning anything: say how many times over.
    if (pct >= 1000) return Math.round(ratio + 1).toLocaleString('en-US') + '\u00d7 what you paid in';
    return pct >= 0 ? '+' + pct + '% on top of what you paid in' : Math.abs(pct) + '% less than you paid in';
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
    var thenOut = state.baseline.depletedAt;
    if (thenOut === undefined) {
      // Older kept baselines have no run-out stored; fall back to the first month below zero.
      thenOut = null;
      for (var bm = 1; bm < baseline.length; bm++) if (baseline[bm] < 0) { thenOut = bm; break; }
    }
    if (Calc.hasWithdrawals(state) && (nowOut !== null || thenOut !== null)) {
      el.baselineDelta.className = 'baseline-delta';
      var nowEnd = nowOut === null ? projection.totals.totalMonths : nowOut;
      var thenEnd = thenOut === null ? baseline.length - 1 : thenOut;
      var gap = nowEnd - thenEnd;
      var same = gap === 0 && Math.round(projection.totals.finalAmount - then) === 0;
      // Nothing changed since keeping it: there is nothing to keep instead.
      if (same) el.keepBaseline.hidden = true;
      el.baselineDelta.innerHTML = same ? 'Kept. The dashed line is your kept plan; change anything to compare.'
        : gap === 0 ? 'Lasts as long as the baseline'
        // Longer, but still running out, is not a win to colour green.
        : '<span class="' + (gap > 0 ? (nowOut === null ? 'up' : '') : 'down') + '">Lasts ' + Chart.durationLabel(Math.abs(gap)) +
          (gap > 0 ? ' longer' : ' shorter') + '</span> than the baseline';
      return;
    }
    var rounded = Math.round(projection.totals.finalAmount - then);
    if (!rounded) el.keepBaseline.hidden = true;
    el.baselineDelta.className = 'baseline-delta';
    el.baselineDelta.innerHTML = rounded
      ? '<span class="' + (rounded > 0 ? 'up' : 'down') + '">' + (rounded > 0 ? '+' : '−') +
        Chart.money0.format(Math.abs(rounded)) + '</span> vs baseline ending at ' + Chart.money0.format(then)
      : 'Kept. The dashed line is your kept plan; change anything to compare.';
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
      'If a withdrawal can\u2019t be paid in full, the money has run out, and the page says when. A planned expense ' +
      'can take the balance below zero for a while: that is money borrowed against the plan, and it costs interest.</p>' +
      '<p><strong>Baseline.</strong> Keep as baseline saves the plan as it is now and draws it as a dashed line, ' +
      'so you can see what each change does.</p>' +
      '<p><strong>Sharing.</strong> Copy link puts the whole plan inside the link itself, so nothing is uploaded ' +
      'or stored anywhere but your browser. Opening a shared link shows that plan without saving it; your own plan stays put unless you edit the shared one, ' +
      'and is kept aside even then, with Back to your own plan at the top.</p>' +
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
        '<span class="legend-dot' + (periodMeta()[i].reused ? ' hollow' : '') + '" style="background:' + Chart.colorFor(p.colorSlot) + ';color:' + Chart.colorFor(p.colorSlot) + '"></span>' +
        escapeHtml(seasonName(p, i)) +
        '<span class="legend-meta">\u00b7 ' + (pp && pp.months ? Chart.durationLabel(pp.months) : 'no time left') + '</span>' +
        '</span>';
    }).join('');
    el.legend.innerHTML = seasons + (baseline
      ? '<span class="legend-item"><svg class="legend-dash" width="18" height="10" aria-hidden="true">' +
        '<line x1="1" y1="5" x2="17" y2="5" stroke="currentColor" stroke-width="1.5" stroke-dasharray="5 4"/></svg>Dashed: your kept plan</span>'
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
          '<span class="extra-meta">' + Chart.money0.format(amount) + (every && months.length > 1 ? ' each' : '') + ' &middot; ' + when + '</span>' +
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
      // Dash-only cells are marked, so the stacked phone table can skip them.
      var blank = k && c.html === '&mdash;';
      return '<td' + (k ? ' class="num' + (c.cls ? ' ' + c.cls : '') + (blank ? ' blank' : '') + '"' : '') +
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
        (typed && Math.abs(asTyped - view) >= 1 ? '<span class="typed">of ' + Chart.money0.format(asTyped) + ' put in</span>' : '');
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
      // Past the 100-year cap a season has no numbers: one honest cell, not a row of zeros.
      if (!pp.months && pp.truncated) {
        return row('capped-row', [{ html: escapeHtml(seasonName(p, i)) }, { html: 'Past the ' + (Calc.MAX_TOTAL_MONTHS / 12) + '-year limit' }]
          .concat(cols.slice(2).map(function () { return { html: '&mdash;' }; })));
      }
      return row('', [
        { html: '<span class="swatch-dot' + (periodMeta()[i].reused ? ' hollow' : '') + '" style="background:' + Chart.colorFor(p.colorSlot) +
            ';color:' + Chart.colorFor(p.colorSlot) + '"></span>' + escapeHtml(seasonName(p, i)) },
        { html: Chart.durationLabel(pp.months) },
        { html: (Number(p.annualRatePercent) || 0) + '%<span class="unit"> / yr</span>' },
        { html: paid(pp.contributed, typed && typed.perPeriod[i].contributed) }
      ].concat(out(pp.withdrawn), [
        { html: extraText(pp.windfalls) },
        { html: Chart.money0.format(pp.growth), cls: growthCls(pp.growth, pp.endBalance) },
        { html: Chart.money0.format(pp.endBalance) +
            (pp.shortfall >= 1 ? '<span class="typed short">short ' + Chart.money0.format(pp.shortfall) + '</span>' : ''),
          cls: pp.endBalance < 0 ? 'neg' : '' }
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
      { html: Chart.money0.format(t.finalAmount) +
          (t.totalShortfall >= 1 ? '<span class="typed short">short ' + Chart.money0.format(t.totalShortfall) + '</span>' : ''),
        cls: t.finalAmount < 0 ? 'neg' : '' }
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
    dropStale(p);

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

    if (action === 'collapse') { collapseCard(li); return; }
    // Open this season, close the one that was open.
    if (action === 'expand') {
      expanded = state.periods[index];
      Array.prototype.forEach.call(el.periodList.children, function (c, k) {
        c.classList.toggle('collapsed', state.periods[k] !== expanded);
      });
      var nameInput = li.querySelector('[data-field="name"]');
      // On touch, focus the card: putting the cursor in the name would raise the keyboard.
      if (touch()) { li.tabIndex = -1; li.focus({ preventScroll: true }); }
      else if (nameInput) nameInput.focus({ preventScroll: true });
      li.scrollIntoView({ block: 'nearest' });
      return;
    }

    var focusAt = index, focusSel = '[data-field="name"]';
    if (action === 'delete') {
      var removed = state.periods.splice(index, 1)[0];
      focusAt = Math.min(index, state.periods.length - 1);
      // Every card is collapsed after a delete: focus lands on the next one's row, not a hidden field.
      focusSel = '.card-summary';
      offerUndo('\u201c' + seasonName(removed, index) + '\u201d deleted', function () {
        state.periods.splice(index, 0, removed);
        expanded = removed;
        save();
        renderPeriods();
        renderResults();
        focusIn(el.periodList, index, '[data-field="name"]');
      }, null, '\u201c' + seasonName(removed, index) + '\u201d is back');
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
      // Focus without the browser's jump, then bring the row into view: you stay where you were.
      // Instant (a smooth scroll is cancelled by the re-render) and centred, clear of the top toast.
      if (next) { next.tabIndex = -1; next.focus({ preventScroll: true }); next.scrollIntoView({ block: 'center', behavior: 'instant' }); }
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
          note = 'Now a fixed ' + Chart.money0.format(p.monthlyContribution) + '/month (about ' +
            (Number(p.withdrawPercent) || 0) + '%)';
        }
      } else if (!(Number(p.withdrawPercent) > 0)) {
        p.withdrawPercent = Calc.SAFE_WITHDRAWAL_PERCENT;
      }
    }
    save();
    renderPeriods();
    renderResults();
    focusIn(el.periodList, index, '[data-flow="' + mode + '"]');
    offerUndo(note || (seasonName(p, index) + (mode === 'save' ? ' now saves ' + Chart.money0.format(Math.abs(Number(p.monthlyContribution) || 0)) + ' a month'
        : mode === 'percent' ? ' now withdraws ' + (Number(p.withdrawPercent) || 0) + '% (the 4% rule)' : ' now withdraws a fixed amount')), function () {
      state.periods[index] = JSON.parse(before);
      // The restored season is a new object: keep it the open card, so undo does not lose your place.
      expanded = state.periods[index];
      save();
      renderPeriods();
      renderResults();
      focusIn(el.periodList, index, '[data-flow]');
    }, p);
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
  // Shorter on phones, where the toast sits over the content; the Undo link stays either way.
  var UNDO_MS = touch() ? 6000 : 10000, UNDO_DEPTH = 10;
  var undoStack = [], toastTimer = null, typedSinceOffer = false;
  /* The results column is pinned only while it fits the window: an opened
     "About these numbers" would otherwise run off the bottom, unreachable. */
  /* On a desktop the chart gives up height (down to 220px) so the column still
     fits a laptop window and stays pinned; only past that does it scroll. */
  var chartHeight = 320, fitting = false;
  function fitPin() {
    // Looked up here: the first render runs before this part of the file.
    var resultsPanel = document.getElementById('results');
    resultsPanel.classList.remove('unpinned');
    var room = window.innerHeight - 32;
    // Below the masthead on first load: size the chart so the whole column shows before any scroll.
    var pageTop = resultsPanel.getBoundingClientRect().top + window.scrollY;
    var fold = Math.min(room, window.innerHeight - pageTop - 16);
    if (!fitting && window.innerWidth > 900) {
      var rest = resultsPanel.offsetHeight - chartHeight;
      var want = Math.max(220, Math.min(320, Math.floor(fold - rest)));
      if (want !== chartHeight) {
        chartHeight = want;
        fitting = true;
        renderResults();
        fitting = false;
        return;
      }
    } else if (!fitting && chartHeight !== 320) {
      chartHeight = 320; fitting = true; renderResults(); fitting = false; return;
    }
    if (resultsPanel.offsetHeight > room) resultsPanel.classList.add('unpinned');
  }
  // `toggle` does not bubble, so listen in the capture phase for every disclosure in the column.
  document.getElementById('results').addEventListener('toggle', fitPin, true);
  window.addEventListener('resize', fitPin);

  // Back to the one-line row, with focus on it so the keyboard user is not lost.
  function collapseCard(li) {
    expanded = null;
    li.classList.add('collapsed');
    var row = li.querySelector('.card-summary');
    if (row) row.focus({ preventScroll: true });
    // A tall card just shrank to one row: bring that row back under the eye (and thumb).
    // Centred on touch, clear of the undo toast at the top of a phone screen.
    li.scrollIntoView({ block: touch() ? 'center' : 'nearest', behavior: 'instant' });
  }
  el.periodList.addEventListener('keydown', function (ev) {
    if (ev.key !== 'Escape') return;
    var li = ev.target.closest('.period');
    if (li && !li.classList.contains('collapsed')) { ev.preventDefault(); collapseCard(li); }
  });

  /* `ref` is the season an entry would rewrite: once that season is edited by
     hand, undoing the older entry would silently throw the edit away, so it goes. */
  // `undone` says what the undo did, when "Undone: <text>" would read backwards ("Undone: now repeats").
  function offerUndo(text, restore, ref, undone) {
    undoStack.push({ text: text, restore: restore, ref: ref || null, undone: undone || null });
    if (undoStack.length > UNDO_DEPTH) undoStack.shift();
    typedSinceOffer = false;
    showTopUndo();
  }
  function showTopUndo() {
    var top = undoStack[undoStack.length - 1];
    syncUndoLink();
    if (!top) { hideToast(); return; }
    // The count is for the eye; a screen reader hears just what happened.
    el.toastText.textContent = top.text;
    if (undoStack.length > 1) {
      var count = document.createElement('span');
      count.setAttribute('aria-hidden', 'true');
      count.textContent = ' (' + undoStack.length + ' to undo)';
      el.toastText.appendChild(count);
    }
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
  /* Desktop: the toast floats over the results column. If that would cover the
     chart's keys or the breakdown title, it lifts to sit just above them (over the
     plot, which is a picture, not text). Re-checked as the page scrolls. */
  /* Desktop: the toast floats over the results column, in the lowest spot where
     it covers no text (chart labels and keys, figures, the breakdown title, the
     floating result card). If there is no such spot, it keeps its default place. */
  var TOAST_AVOID = '.chart-svg text, #legend, #extras-legend, .details-title, .breakdown th, .kpi, .lever, .why summary, .back-link, .result-bar:not([hidden])';
  function placeToast() {
    el.toast.style.bottom = '';
    if (el.toast.hidden || window.innerWidth <= 900) return;
    var t = el.toast.getBoundingClientRect(), vh = window.innerHeight;
    var boxes = Array.prototype.map.call(document.querySelectorAll(TOAST_AVOID), function (e) { return e.getBoundingClientRect(); })
      .filter(function (r) { return r.width && r.height && r.bottom > 0 && r.top < vh && r.left < t.right && r.right > t.left; });
    for (var b = 20; b < vh * 0.6; b += 4) {
      var top = vh - b - t.height, bottom = vh - b;
      var clear = boxes.every(function (r) { return r.bottom <= top - 4 || r.top >= bottom + 4; });
      if (clear) { el.toast.style.bottom = b + 'px'; return; }
    }
  }
  window.addEventListener('scroll', function () { if (!el.toast.hidden) placeToast(); }, { passive: true });

  function startToastTimer(ms) {
    placeToast();
    clearTimeout(toastTimer);
    toastTimer = setTimeout(hideToast, ms);
  }
  function dropStale(ref) {
    var before = undoStack.length;
    undoStack = undoStack.filter(function (e) { return e.ref !== ref; });
    if (undoStack.length !== before) syncUndoLink();
  }
  /* After an undo the toast says what was undone, with no button: re-offering an
     older entry there would describe something you are no longer looking at.
     The rest of the history stays on the Undo link and Cmd/Ctrl+Z. */
  function runUndo() {
    var top = undoStack.pop();
    if (!top) return;
    top.restore();
    syncUndoLink();
    showNotice(top.undone || 'Undone: ' + top.text.charAt(0).toLowerCase() + top.text.slice(1));
  }
  // The offer waits while you are reading it or about to press it.
  el.toast.addEventListener('mouseenter', function () { clearTimeout(toastTimer); });
  el.toast.addEventListener('focusin', function () { clearTimeout(toastTimer); });
  el.toast.addEventListener('mouseleave', function () { startToastTimer(4000); });
  el.toast.addEventListener('focusout', function () { startToastTimer(4000); });
  /* Cmd/Ctrl+Z takes the offer — unless you have typed since, in which case it
     belongs to the field and undoes your typing as usual. (After a delete, focus
     lands in a neighbouring field, so "in a field" alone is not the test.) */
  // The next edit makes the toast's message stale: hide it (the Undo link keeps the history).
  // Capture phase: runs before the field's own handler, so an edit that raises a new toast keeps it.
  document.addEventListener('input', function () { typedSinceOffer = true; if (!el.toast.hidden) hideToast(); }, true);
  el.resultBar.addEventListener('click', function () { if (!el.toast.hidden) hideToast(); });
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

  // Copy a link that opens this plan; where the clipboard is off limits, the address bar holds it instead.
  el.shareLink.addEventListener('click', function () {
    var url = location.href.split('#')[0] + PLAN_HASH + encodePlan();
    function inAddressBar() {
      try { history.replaceState(null, '', url); } catch (e) { /* ignore */ }
      showNotice('The address bar now holds a link to this plan: copy it from there to share.');
    }
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(url).then(function () {
        showNotice('Link copied. Whoever opens it gets their own copy of this plan; nothing is uploaded.');
      }, inAddressBar);
    } else inAddressBar();
  });
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
      var wasEvery = w.repeatEvery, wasUntil = w.repeatUntil;
      // Repeating to the end of the whole plan is rarely meant: stop with the season it lands in.
      var wasUntilSeason = w.untilSeason;
      if (input.checked && (w.repeatUntil === null || w.repeatUntil === undefined)) w.untilSeason = true;
      w.repeatEvery = input.checked
        ? Math.max(1, timeFromInput(everyInput.value, unitOf(w.everyUnit, 12)) || 12)
        : 0;
      li.querySelector('.repeat-fields').hidden = !input.checked;
      // Repeating multiplies the extra; say by how much (the same count and sum as its note), and offer the way back.
      syncAnchors();
      var tally = extraTally(w, Calc.project(state).totals.totalMonths);
      var wi = Number(li.dataset.index);
      offerUndo(input.checked
        ? '\u201c' + (w.name || 'Extra ' + (wi + 1)) + '\u201d now repeats every ' + Chart.durationLabel(w.repeatEvery) + ': ' + tally.count +
          ' payments' + (Number(w.amount) ? ', ' + Chart.money0.format(tally.total) + ' in total' : '')
        : '\u201c' + (w.name || 'Extra ' + (wi + 1)) + '\u201d no longer repeats', function () {
        state.windfalls[wi].repeatEvery = wasEvery;
        state.windfalls[wi].repeatUntil = wasUntil;
        state.windfalls[wi].untilSeason = wasUntilSeason;
        save();
        renderWindfalls();
        renderResults();
      }, null, '\u201c' + (w.name || 'Extra ' + (wi + 1)) + '\u201d ' + (input.checked ? 'lands once again' : 'repeats again'));

    } else if (field === 'fixed') {
      w.fixed = input.value === 'yes';
    } else if (field === 'repeatEvery') {
      w.repeatEvery = Math.max(1, timeFromInput(input.value, unitOf(w.everyUnit, w.repeatEvery)));
    } else if (field === 'repeatUntil') {
      // Empty means "to the end of the projection" — not month zero.
      var untilTyped = input.value === '' ? null : timeFromInput(input.value, unitOf(w.untilUnit, untilShown(w)));
      // Anchored, it is months into the season; otherwise months from the plan start.
      if (w.anchor) w.untilOffset = untilTyped;
      w.repeatUntil = untilTyped === null ? null : anchorStart(w) + untilTyped;
      // Typed by hand: no longer follows its season's end.
      w.untilSeason = false;
    } else if (field === 'name') {
      w.name = input.value;
    } else if (field === 'atMonth') {
      // Anchored, the field is the offset into the season; otherwise months from the plan start.
      if (w.anchor) w.anchorOffset = timeFromInput(input.value, unitOf(w.atUnit, w.anchorOffset));
      else w.atMonth = timeFromInput(input.value, unitOf(w.atUnit, w.atMonth));
    } else if (field === 'anchor') {
      /* Re-expressed, not moved: switching what it is measured from keeps the
         month it lands on (a season start later than it moves it to that start). */
      var spans = seasonStarts();
      var span = spans.filter(function (sp) { return sp.id === input.value; })[0];
      w.anchor = span ? span.id : null;
      if (span) {
        w.anchorOffset = Math.max(0, w.atMonth - span.start - 1);
        w.untilOffset = w.repeatUntil === null ? null : Math.max(0, w.repeatUntil - span.start);
      }
      var untilField = li.querySelector('[data-field="repeatUntil"]');
      var shownUntil = untilShown(w);
      if (shownUntil !== null) w.untilUnit = unitOf(null, shownUntil);
      untilField.value = shownUntil === null ? '' : timeDisplay(shownUntil, w.untilUnit);
      untilField.closest('.unit-field').querySelector('select').value = w.untilUnit;
      var atField = li.querySelector('[data-field="atMonth"]');
      atField.dataset.from = w.anchor || '';
      var shown = w.anchor ? w.anchorOffset : w.atMonth;
      w.atUnit = unitOf(null, shown);
      atField.value = timeDisplay(shown, w.atUnit);
      atField.closest('.unit-field').querySelector('select').value = w.atUnit;
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
    /* After a saving season, copy it. After a withdrawing one, start a plain
       saving season at $0: a second retirement is rarely what someone means. */
    var copying = last && !Calc.isWithdrawing(last) && last.flow !== 'withdraw';
    state.periods.push(makePeriod(state.periods.length, last ? {
      // After a withdrawing season, a plain 10 years rather than another retirement's length.
      months: copying ? last.months : 120,
      monthlyContribution: copying ? last.monthlyContribution : 0,
      annualRatePercent: last.annualRatePercent,
      compounding: last.compounding,
      flow: 'save',
      lengthUnit: copying ? unitOf(last.lengthUnit, last.months) : 'years',
      colorSlot: nextColorSlot()
    } : { colorSlot: nextColorSlot() }));
    expanded = state.periods[state.periods.length - 1];
    save();
    renderPeriods();
    renderResults();
    // Centred, so the undo toast at the bottom never covers the card you are filling in.
    var added = el.periodList.lastElementChild;
    if (added) {
      // On touch, focus the card: the name field would raise the keyboard.
      if (touch()) { added.tabIndex = -1; added.focus({ preventScroll: true }); }
      else added.querySelector('[data-field="name"]').focus({ preventScroll: true });
      added.scrollIntoView({ block: 'center' });
    }
    // A new season copies the last one's numbers; say so, and offer the way back.
    var at = state.periods.length - 1;
    offerUndo(copying ? 'Copied \u201c' + lastName + '\u201d' : 'Season added, saving $0 a month', function () {
      state.periods.splice(at, 1);
      save();
      renderPeriods();
      renderResults();
      el.addPeriod.focus();
    });
  });

  el.reset.addEventListener('click', function () {
    var before = JSON.stringify(state);
    // Starting over from a shared plan is a change like any edit: keep your own plan aside first.
    if (sharedMode) keepOwnAside();
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
    /* When it ran out is stored with it: withdrawals stop at $0, so the balances
       alone never show a run-out (they bottom out at zero, not below). */
    var kept = Calc.project(state);
    state.baseline = {
      balances: pts.map(function (pt) { return Math.round(pt.balance * 100) / 100; }),
      depletedAt: kept.totals.depletedAt
    };
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
     amount in reach whenever no part of the results is in view (no "See
     results" while you are already looking at them).
     CSS decides whether the bar can show at all; this only says when. */
  if (typeof IntersectionObserver === 'function') {
    new IntersectionObserver(function (entries) {
      el.resultBar.hidden = entries[0].isIntersecting;
    }).observe(document.getElementById('results'));
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
  syncSharedNote();
  if (badLink) showNotice('That link didn\u2019t contain a plan this page can read, so nothing changed.');
  el.sharedBack.addEventListener('click', function () {
    if (sharedMode) {
      // Nothing was saved while looking: your plan is still in storage, and in memory.
      sharedMode = false;
      clearPlanHash();
      showPlan(ownPlan);
      save(true);
    } else {
      var aside = sanitize((function () { try { return JSON.parse(keptAside()); } catch (e) { return null; } })());
      try { localStorage.removeItem(OWN_KEY); } catch (e) { /* private mode */ }
      if (aside) { showPlan(aside); save(true); }
    }
    syncSharedNote();
    showNotice('Back to your own plan');
    // The note just hid itself: focus moves to the plan, never to <body> or a hidden button.
    (el.reset.hidden ? el.startingAmount : el.reset).focus();
  });
  el.sharedForget.addEventListener('click', function () {
    try { localStorage.removeItem(OWN_KEY); } catch (e) { /* private mode */ }
    syncSharedNote();
    showNotice('Your old plan is gone; this one is yours.');
  });
  // A link pasted into this same tab only changes the hash: open it like a fresh visit.
  window.addEventListener('hashchange', function () { if (location.hash.indexOf(PLAN_HASH) === 0) location.reload(); });
})();
