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

  /* Withdrawing seasons take money out in one of two ways, both in today's
     dollars and both rising with inflation so their buying power stays put:
       'dollars' — a fixed monthly amount of today's money;
       'percent' — the 4% rule: that percent of what the season starts with, in
                   its first year, then raised with inflation each year.
     A negative amount on a saving season (older saved plans) still means a
     fixed withdrawal. Saving seasons add a flat amount each month. */
  function isWithdrawing(p) {
    if (!p) return false;
    if (p.flow === 'withdraw') {
      return p.withdrawUnit === 'percent' ? num(p.withdrawPercent) > 0 : num(p.monthlyContribution) !== 0;
    }
    return num(p.monthlyContribution) < 0;
  }

  /* The signed amount for one month. `month` is the absolute month that ends
     (1-based); `start` and `startBalance` describe the season it belongs to. */
  function flowAt(p, month, start, startBalance, inflationPercent) {
    var rise = 1 + num(inflationPercent) / 100;
    if (p.flow === 'withdraw' && p.withdrawUnit === 'percent') {
      var first = Math.max(0, startBalance) * num(p.withdrawPercent) / 100 / 12;
      return -first * Math.pow(rise, (month - start - 1) / 12);
    }
    var amount = num(p.monthlyContribution);
    if (p.flow === 'withdraw' || amount < 0) {
      // Today's dollars, spent in month `month`: the same buying power every month.
      return -Math.abs(amount) * Math.pow(rise, month / 12);
    }
    return amount;
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
    // An Until before At stops the repeats, not the first payment: that lands like a one-off.
    if (stop < at && at <= horizon) return [at];

    var months = [];
    for (var mth = at; mth <= stop; mth += every) months.push(mth);
    return months;
  }

  /* Fold the extras into a month -> amount map, summing anything landing in the
     same month. Built once so the monthly loop below stays O(1). */
  function windfallsByMonth(list, horizon, inflationPercent) {
    var map = {};
    var arr = list || [];
    for (var i = 0; i < arr.length; i++) {
      var months = windfallMonths(arr[i], horizon);
      for (var j = 0; j < months.length; j++) {
        map[months[j]] = (map[months[j]] || 0) + extraAt(arr[i], months[j], inflationPercent);
      }
    }
    return map;
  }

  /* What an extra pays in the dollars of month m. Typed in today's dollars, it
     rises with inflation like a withdrawal (a pension keeps its value); `fixed`
     keeps the typed figure as is (a known bill, or a plan saved before this). */
  function extraAt(w, month, inflationPercent) {
    var amount = num(w.amount);
    return w.fixed ? amount : amount * deflator(month, inflationPercent);
  }

  /* project(state) -> { points, perPeriod, totals }
     points[i] is month i, so points[m] can be indexed directly by month. */
  function project(state) {
    var starting = num(state && state.startingAmount);
    var periods = (state && state.periods) || [];
    var windfallList = (state && state.windfalls) || [];
    var windfalls = windfallsByMonth(windfallList, horizonMonths(periods), state && state.inflationPercent);

    /* A one-off at month 0 is money you already have: it behaves exactly like a
       bigger starting amount, and grows from the first month on. */
    var atZero = windfalls[0] || 0;
    var balance = starting + atZero;
    // Each point records the money that came in that month, split into regular
    // contributions and extras, so a today's-dollars view can discount every flow
    // by when it happened (see inTodaysDollars).
    var points = [{ month: 0, balance: balance, periodIndex: -1, contribution: starting, extra: atZero }];
    var perPeriod = [];
    var totalContributed = starting + atZero;
    var totalWindfalls = atZero;
    var totalWithdrawn = 0;
    var totalShortfall = 0;
    var monthsUsed = 0;
    var dippedAt = null;

    for (var i = 0; i < periods.length; i++) {
      var p = periods[i];
      var want = Math.max(0, Math.floor(num(p.months)));
      var months = Math.min(want, MAX_TOTAL_MONTHS - monthsUsed);
      var inflation = state && state.inflationPercent;
      var g = monthlyGrowthFactor(p.annualRatePercent, p.compounding);

      var startMonth = monthsUsed;
      var startBalance = balance;
      var contributed = 0;
      var withdrawn = 0;
      var shortfall = 0;
      var windfalled = 0;

      var firstWithdrawal = 0;

      for (var m = 0; m < months; m++) {
        var contribution = flowAt(p, monthsUsed + 1, startMonth, startBalance, inflation);
        if (m === 0 && contribution < 0) firstWithdrawal = -contribution;
        // Contribution lands at month end (ordinary annuity).
        balance = balance * g;
        /* A withdrawal can only take what is there. Once the money runs out the
           unpaid part is a shortfall, not a growing debt: "withdrawn" counts only
           money that was actually paid out. */
        var short = 0;
        if (contribution < 0) {
          var paid = Math.min(-contribution, Math.max(0, balance));
          short = -contribution - paid;
          contribution = -paid;
          shortfall += short;
        }
        balance += contribution;
        if (contribution >= 0) contributed += contribution; else withdrawn -= contribution;
        monthsUsed++;
        // A one-off lands at month end too, so it grows from the next month on.
        // A planned expense must be paid, so it can still take the balance below zero.
        var extra = windfalls[monthsUsed] || 0;
        if (extra) { balance += extra; windfalled += extra; }
        points.push({ month: monthsUsed, balance: balance, periodIndex: i, contribution: contribution, extra: extra, short: short });
        // The first month the plan falls short at all (it may recover).
        if (dippedAt === null && (balance < 0 || short > 0)) dippedAt = monthsUsed;
      }

      totalContributed += contributed + windfalled;
      totalWithdrawn += withdrawn;
      totalShortfall += shortfall;
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
        withdrawn: withdrawn,
        // What it asked to withdraw but could not, because the money had run out.
        shortfall: shortfall,
        // The season's first monthly withdrawal in today's dollars, for its card.
        firstWithdrawal: firstWithdrawal / deflator(startMonth + 1, inflation),
        windfalls: windfalled,
        growth: balance - startBalance - contributed + withdrawn - windfalled,
        effectiveAnnualYield: effectiveAnnualYield(p.annualRatePercent, p.compounding)
      });
    }

    /* The money has run out only if the plan ends short: depletedAt is where
       that final stretch below zero begins. A dip that later recovers (say a
       big expense paid back by later saving) is dippedAt, not a run-out. */
    /* Run out = the first month a withdrawal could not be paid in full. That
       stands even if money comes back later (a pension extra refilling an empty
       account does not undo the months that went unpaid). Without any unpaid
       withdrawal, a plan still runs out if a planned expense leaves it below
       zero for good: the start of that final stretch. */
    function falling(pt) { return pt.balance < 0 || pt.short > 0; }
    var depletedAt = null;
    for (var f = 1; f < points.length; f++) if (points[f].short > 0) { depletedAt = f; break; }
    if (depletedAt === null && points.length > 1 && points[points.length - 1].balance < 0) {
      depletedAt = points.length - 1;
      while (depletedAt > 1 && falling(points[depletedAt - 1])) depletedAt--;
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
        totalWithdrawn: totalWithdrawn,
        totalShortfall: totalShortfall,
        totalGrowth: balance - totalContributed + totalWithdrawn,
        totalMonths: monthsUsed,
        depletedAt: depletedAt,
        dippedAt: dippedAt,
        lowestBalance: belowZero(points).lowest,
        monthsBelowZero: belowZero(points).months
      }
    };
  }

  /* How deep and how long the balance goes below zero (a planned expense paid
     with money the plan did not have: in effect borrowed against it). */
  function belowZero(points) {
    var lowest = 0, months = 0;
    for (var i = 1; i < points.length; i++) {
      if (points[i].balance < 0) { months++; if (points[i].balance < lowest) lowest = points[i].balance; }
    }
    return { lowest: lowest, months: months };
  }

  /* How many of today's dollars a dollar at month m is worth, at a constant
     yearly inflation rate. Month 0 is today. */
  function deflator(month, inflationPercent) {
    return Math.pow(1 + num(inflationPercent) / 100, num(month) / 12);
  }

  /* The same projection restated in today's dollars. Every flow is discounted by
     the month it happened in, so the accounting still reconciles:
     growth = end - start - contributed - windfalls, per period and in total.
     Growth here is REAL growth — what the plan earned beyond inflation — and can
     be negative even when the nominal balance rises. */
  function inTodaysDollars(projection, inflationPercent) {
    if (!num(inflationPercent)) return projection;
    var pts = projection.points;
    var points = [];
    var realIn = [], realOut = [], realExtra = [];
    for (var m = 0; m < pts.length; m++) {
      var d = deflator(m, inflationPercent);
      points.push({ month: m, balance: pts[m].balance / d, periodIndex: pts[m].periodIndex,
                    contribution: pts[m].contribution / d, extra: pts[m].extra / d, short: (pts[m].short || 0) / d });
      var c = num(pts[m].contribution);
      realIn.push(Math.max(0, c) / d);
      realOut.push(Math.max(0, -c) / d);
      realExtra.push(num(pts[m].extra) / d);
    }
    function sum(arr, from, to) { var t = 0; for (var k = from; k <= to; k++) t += arr[k]; return t; }

    var perPeriod = projection.perPeriod.map(function (pp) {
      var start = points[pp.startMonth].balance, end = points[pp.endMonth].balance;
      var contributed = pp.months ? sum(realIn, pp.startMonth + 1, pp.endMonth) : 0;
      var windfalls = pp.months ? sum(realExtra, pp.startMonth + 1, pp.endMonth) : 0;
      var withdrawn = pp.months ? sum(realOut, pp.startMonth + 1, pp.endMonth) : 0;
      var shortfall = 0;
      for (var q = pp.startMonth + 1; pp.months && q <= pp.endMonth; q++) shortfall += points[q].short;
      var out = {};
      for (var k in pp) if (Object.prototype.hasOwnProperty.call(pp, k)) out[k] = pp[k];
      out.startBalance = start; out.endBalance = end;
      out.contributed = contributed; out.withdrawn = withdrawn; out.windfalls = windfalls; out.shortfall = shortfall;
      out.growth = end - start - contributed + withdrawn - windfalls;
      return out;
    });

    var t = projection.totals;
    var last = points.length - 1;
    var totalWindfalls = sum(realExtra, 0, last);
    var totalContributed = sum(realIn, 0, last) + totalWindfalls;
    var totalWithdrawn = sum(realOut, 0, last);
    return {
      points: points,
      perPeriod: perPeriod,
      unappliedWindfalls: projection.unappliedWindfalls,
      totals: {
        finalAmount: points[last].balance,
        startingAmount: t.startingAmount,
        totalContributed: totalContributed,
        totalWindfalls: totalWindfalls,
        totalWithdrawn: totalWithdrawn,
        totalShortfall: points.reduce(function (a, pt) { return a + pt.short; }, 0),
        totalGrowth: points[last].balance - totalContributed + totalWithdrawn,
        totalMonths: t.totalMonths,
        depletedAt: t.depletedAt,
        dippedAt: t.dippedAt,
        lowestBalance: belowZero(points).lowest,
        monthsBelowZero: t.monthsBelowZero
      }
    };
  }

  // ------------------------------------------------- what would last

  function hasWithdrawals(state) {
    return ((state && state.periods) || []).some(isWithdrawing);
  }

  // The plan with every withdrawal multiplied by k (savings untouched).
  function withScaledWithdrawals(state, k) {
    var copy = {};
    for (var key in state) if (Object.prototype.hasOwnProperty.call(state, key)) copy[key] = state[key];
    copy.periods = (state.periods || []).map(function (p) {
      if (!isWithdrawing(p)) return p;
      var q = {};
      for (var k2 in p) if (Object.prototype.hasOwnProperty.call(p, k2)) q[k2] = p[k2];
      q.flow = 'withdraw';
      if (p.flow === 'withdraw' && p.withdrawUnit === 'percent') q.withdrawPercent = num(p.withdrawPercent) * k;
      else q.monthlyContribution = Math.abs(num(p.monthlyContribution)) * k;
      return q;
    });
    return copy;
  }

  // Strict, for the levers: never short and never below zero, not even briefly.
  function lasts(state) {
    var t = project(state).totals;
    return t.depletedAt === null && t.dippedAt === null;
  }

  /* The largest multiple of today's withdrawals the plan can sustain to the end:
     0.8 means "withdraw 20% less", 1.5 means "you could withdraw half again".
     Infinity when it would last even at 20x; null when nothing is withdrawn.
     Monotonic (more withdrawal never helps), so a bisection is exact enough. */
  function withdrawalScale(state) {
    if (!hasWithdrawals(state)) return null;
    var ok = function (k) { return lasts(withScaledWithdrawals(state, k)); };
    var lo, hi;
    if (ok(1)) {
      if (ok(20)) return Infinity;
      lo = 1; hi = 20;
    } else {
      if (!ok(0)) return 0; // runs out even with no withdrawals (a big negative extra)
      lo = 0; hi = 1;
    }
    for (var i = 0; i < 40; i++) {
      var mid = (lo + hi) / 2;
      if (ok(mid)) lo = mid; else hi = mid;
    }
    return lo;
  }

  /* How much more starting money would carry the plan to the end without
     running out. 0 when it already lasts. */
  function extraStartNeeded(state) {
    if (lasts(state)) return 0;
    var base = num(state.startingAmount);
    var ok = function (extra) {
      var copy = {};
      for (var key in state) if (Object.prototype.hasOwnProperty.call(state, key)) copy[key] = state[key];
      copy.startingAmount = base + extra;
      return lasts(copy);
    };
    var hi = 1000;
    while (!ok(hi)) { hi *= 2; if (hi > 1e13) return Infinity; }
    var lo = 0;
    for (var i = 0; i < 50; i++) {
      var mid = (lo + hi) / 2;
      if (ok(mid)) hi = mid; else lo = mid;
    }
    return hi;
  }

  /* The largest share of extra `index` (a planned expense) the plan can absorb
     and still last: 0.6 means "an expense 40% smaller would make it". */
  function extraScale(state, index) {
    var ok = function (k) {
      var copy = {};
      for (var key in state) if (Object.prototype.hasOwnProperty.call(state, key)) copy[key] = state[key];
      copy.windfalls = state.windfalls.map(function (w, i) {
        if (i !== index) return w;
        var q = {};
        for (var k2 in w) if (Object.prototype.hasOwnProperty.call(w, k2)) q[k2] = w[k2];
        q.amount = num(w.amount) * k;
        return q;
      });
      return lasts(copy);
    };
    if (ok(1)) return 1;
    if (!ok(0)) return 0;
    var lo = 0, hi = 1;
    for (var i = 0; i < 40; i++) { var mid = (lo + hi) / 2; if (ok(mid)) lo = mid; else hi = mid; }
    return lo;
  }

  /* How much more the plan ends with if every saving season puts in `more`
     extra dollars a month: the answer to "what if I saved a bit more?". */
  function savingMoreAdds(state, more) {
    var copy = {};
    for (var key in state) if (Object.prototype.hasOwnProperty.call(state, key)) copy[key] = state[key];
    copy.periods = (state.periods || []).map(function (p) {
      if (isWithdrawing(p) || p.flow === 'withdraw') return p;
      var q = {};
      for (var k2 in p) if (Object.prototype.hasOwnProperty.call(p, k2)) q[k2] = p[k2];
      q.monthlyContribution = num(p.monthlyContribution) + more;
      return q;
    });
    return project(copy);
  }

  global.Calc = {
    extraScale: extraScale,
    savingMoreAdds: savingMoreAdds,
    isWithdrawing: isWithdrawing,
    hasWithdrawals: hasWithdrawals,
    withdrawalScale: withdrawalScale,
    extraStartNeeded: extraStartNeeded,
    inTodaysDollars: inTodaysDollars,
    deflator: deflator,
    project: project,
    monthlyGrowthFactor: monthlyGrowthFactor,
    effectiveAnnualYield: effectiveAnnualYield,
    safeWithdrawal: safeWithdrawal,
    windfallMonths: windfallMonths,
    extraAt: extraAt,
    horizonMonths: horizonMonths,
    MAX_TOTAL_MONTHS: MAX_TOTAL_MONTHS,
    SAFE_WITHDRAWAL_PERCENT: SAFE_WITHDRAWAL_PERCENT,
    PER_YEAR: PER_YEAR
  };
})(window);
