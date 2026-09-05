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

  /* project(state) -> { points, perPeriod, totals }
     points[i] is month i, so points[m] can be indexed directly by month. */
  function project(state) {
    var starting = num(state && state.startingAmount);
    var periods = (state && state.periods) || [];

    var balance = starting;
    var points = [{ month: 0, balance: balance, periodIndex: -1 }];
    var perPeriod = [];
    var totalContributed = starting;
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

      for (var m = 0; m < months; m++) {
        // Contribution lands at month end (ordinary annuity).
        balance = balance * g + contribution;
        contributed += contribution;
        monthsUsed++;
        points.push({ month: monthsUsed, balance: balance, periodIndex: i });
      }

      totalContributed += contributed;
      perPeriod.push({
        index: i,
        startMonth: startMonth,
        endMonth: monthsUsed,
        months: months,
        truncated: months < want,
        startBalance: startBalance,
        endBalance: balance,
        contributed: contributed,
        growth: balance - startBalance - contributed,
        effectiveAnnualYield: effectiveAnnualYield(p.annualRatePercent, p.compounding)
      });
    }

    return {
      points: points,
      perPeriod: perPeriod,
      totals: {
        finalAmount: balance,
        startingAmount: starting,
        totalContributed: totalContributed,
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
    MAX_TOTAL_MONTHS: MAX_TOTAL_MONTHS,
    SAFE_WITHDRAWAL_PERCENT: SAFE_WITHDRAWAL_PERCENT,
    PER_YEAR: PER_YEAR
  };
})(window);
