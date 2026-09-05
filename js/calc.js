/* calc.js — pure projection math. No DOM, no app state.
   Exposes window.Calc so the file works over file:// without ES modules. */
(function (global) {
  'use strict';

  // Compounding periods per year.
  var PER_YEAR = { daily: 365, monthly: 12, yearly: 1 };

  // 100 years. Keeps the point count and the arithmetic sane.
  var MAX_TOTAL_MONTHS = 1200;

  // The "4% rule" — the conventional first-year safe withdrawal rate.
  var SAFE_WITHDRAWAL_PERCENT = 4;

  function num(v) {
    var n = Number(v);
    return isFinite(n) ? n : 0;
  }

  /* The rate is a NOMINAL annual rate (APR); the compounding setting says how
     many times a year it is credited. f=12 gives exactly (1 + r/12) a month.
     f=1 spreads the annual factor geometrically over the 12 months instead of
     crediting it in one lump — same value at every year boundary, smooth curve. */
  function monthlyGrowthFactor(annualRatePercent, compounding) {
    var r = num(annualRatePercent) / 100;
    var f = PER_YEAR[compounding] || PER_YEAR.monthly;
    var base = 1 + r / f;
    if (base <= 0) return 0; // rate negative enough to wipe the balance
    return Math.pow(base, f / 12);
  }

  // What the nominal rate actually earns over a year, once compounding applies.
  function effectiveAnnualYield(annualRatePercent, compounding) {
    return Math.pow(monthlyGrowthFactor(annualRatePercent, compounding), 12) - 1;
  }

  /* What a balance supports under the 4% rule: 4% of it in the first year,
     split evenly across the months. Not a projection — a rule of thumb applied
     to one number, so it takes an amount rather than the whole state. */
  function safeWithdrawal(amount, ratePercent) {
    var rate = (ratePercent === undefined ? SAFE_WITHDRAWAL_PERCENT : num(ratePercent)) / 100;
    var perYear = num(amount) * rate;
    return { perYear: perYear, perMonth: perYear / 12 };
  }

  /* How long the projection runs, mirroring the truncation the loop applies.
     Needed up front because an open-ended repeat runs to the end of the timeline. */
  function horizonMonths(periods) {
    var used = 0;
    var list = periods || [];
    for (var i = 0; i < list.length; i++) {
      used += Math.min(Math.max(0, Math.floor(num(list[i].months))), MAX_TOTAL_MONTHS - used);
    }
    return used;
  }

  /* Every month an extra lands on. A one-off is the degenerate case: one month.
     A repeat runs from atMonth in repeatEvery steps, stopping at repeatUntil, or
     at the end of the timeline when that is left empty. Single source of truth
     for occurrences — the math and the chart markers both read it. */
  function windfallMonths(w, horizon) {
    var at = Math.max(0, Math.floor(num(w && w.atMonth)));
    var every = Math.max(0, Math.floor(num(w && w.repeatEvery)));
    if (!every) return [at];

    var until = w.repeatUntil;
    var stop = (until === null || until === undefined || until === '')
      ? horizon
      : Math.floor(num(until));
    if (stop > horizon) stop = horizon;

    var months = [];
    for (var mth = at; mth <= stop; mth += every) months.push(mth);
    return months;
  }

  /* Fold the extras into a month -> amount map, summing anything landing in the
     same month. Built once so the monthly loop below stays O(1). */
  function windfallsByMonth(list, horizon) {
    var map = {};
    var arr = list || [];
    for (var i = 0; i < arr.length; i++) {
      var amount = num(arr[i].amount);
      var months = windfallMonths(arr[i], horizon);
      for (var j = 0; j < months.length; j++) {
        map[months[j]] = (map[months[j]] || 0) + amount;
      }
    }
    return map;
  }

  /* project(state) -> { points, perPeriod, totals }
     points[i] is month i, so points[m] can be indexed directly by month. */
  function project(state) {
    var starting = num(state && state.startingAmount);
    var periods = (state && state.periods) || [];
    var windfallList = (state && state.windfalls) || [];
    var windfalls = windfallsByMonth(windfallList, horizonMonths(periods));

    /* A one-off at month 0 is money you already have: it behaves exactly like a
       bigger starting amount, and grows from the first month on. */
    var atZero = windfalls[0] || 0;
    var balance = starting + atZero;
    var points = [{ month: 0, balance: balance, periodIndex: -1 }];
    var perPeriod = [];
    var totalContributed = starting + atZero;
    var totalWindfalls = atZero;
    var monthsUsed = 0;

    for (var i = 0; i < periods.length; i++) {
      var p = periods[i];
      var want = Math.max(0, Math.floor(num(p.months)));
      var months = Math.min(want, MAX_TOTAL_MONTHS - monthsUsed);
      var contribution = num(p.monthlyContribution);
      var g = monthlyGrowthFactor(p.annualRatePercent, p.compounding);

      var startMonth = monthsUsed;
      var startBalance = balance;
      var contributed = 0;
      var windfalled = 0;

      for (var m = 0; m < months; m++) {
        // Contribution lands at month end (ordinary annuity).
        balance = balance * g + contribution;
        contributed += contribution;
        monthsUsed++;
        // A one-off lands at month end too, so it grows from the next month on.
        var extra = windfalls[monthsUsed] || 0;
        if (extra) { balance += extra; windfalled += extra; }
        points.push({ month: monthsUsed, balance: balance, periodIndex: i });
      }

      totalContributed += contributed + windfalled;
      totalWindfalls += windfalled;
      perPeriod.push({
        index: i,
        startMonth: startMonth,
        endMonth: monthsUsed,
        months: months,
        truncated: months < want,
        startBalance: startBalance,
        endBalance: balance,
        contributed: contributed,
        windfalls: windfalled,
        growth: balance - startBalance - contributed - windfalled,
        effectiveAnnualYield: effectiveAnnualYield(p.annualRatePercent, p.compounding)
      });
    }

    /* An extra whose FIRST occurrence is past the end never lands at all. Later
       occurrences falling off the end are expected, not an error. */
    var unapplied = [];
    for (var w = 0; w < windfallList.length; w++) {
      if (Math.max(0, Math.floor(num(windfallList[w].atMonth))) > monthsUsed) unapplied.push(w);
    }

    return {
      points: points,
      perPeriod: perPeriod,
      unappliedWindfalls: unapplied,
      totals: {
        finalAmount: balance,
        startingAmount: starting,
        totalContributed: totalContributed,
        totalWindfalls: totalWindfalls,
        totalGrowth: balance - totalContributed,
        totalMonths: monthsUsed
      }
    };
  }

  global.Calc = {
    project: project,
    monthlyGrowthFactor: monthlyGrowthFactor,
    effectiveAnnualYield: effectiveAnnualYield,
    safeWithdrawal: safeWithdrawal,
    windfallMonths: windfallMonths,
    horizonMonths: horizonMonths,
    MAX_TOTAL_MONTHS: MAX_TOTAL_MONTHS,
    SAFE_WITHDRAWAL_PERCENT: SAFE_WITHDRAWAL_PERCENT,
    PER_YEAR: PER_YEAR
  };
})(window);
