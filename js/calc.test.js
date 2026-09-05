/* calc.test.js — assertions for calc.js, run by tests.html in the browser.
   No test framework: there is no node on this machine and none is needed. */
(function (global) {
  'use strict';

  var results = [];

  function test(name, fn) {
    try {
      fn();
      results.push({ name: name, pass: true, detail: '' });
    } catch (err) {
      results.push({ name: name, pass: false, detail: err.message });
    }
  }

  function close(actual, expected, tol, what) {
    var t = tol === undefined ? 0.01 : tol;
    if (!(Math.abs(actual - expected) <= t)) {
      throw new Error((what || 'value') + ': expected ' + expected + ', got ' + actual);
    }
  }

  function ok(cond, msg) {
    if (!cond) throw new Error(msg);
  }

  function period(over) {
    var p = { months: 12, monthlyContribution: 0, annualRatePercent: 0, compounding: 'monthly' };
    for (var k in over) if (Object.prototype.hasOwnProperty.call(over, k)) p[k] = over[k];
    return p;
  }

  // --- no periods -------------------------------------------------------
  test('no periods returns just the starting point', function () {
    var r = Calc.project({ startingAmount: 5000, periods: [] });
    close(r.totals.finalAmount, 5000, 0, 'final');
    ok(r.points.length === 1, 'expected 1 point, got ' + r.points.length);
    close(r.points[0].balance, 5000, 0, 'point 0');
    close(r.totals.totalGrowth, 0, 0, 'growth');
  });

  // --- zero growth is pure contribution ---------------------------------
  test('0% growth is starting amount plus contributions', function () {
    var r = Calc.project({
      startingAmount: 1000,
      periods: [period({ months: 12, monthlyContribution: 100, annualRatePercent: 0 })]
    });
    close(r.totals.finalAmount, 2200, 0.000001, 'final');
    close(r.totals.totalContributed, 2200, 0.000001, 'contributed');
    close(r.totals.totalGrowth, 0, 0.000001, 'growth');
  });

  // --- hand-computed future values --------------------------------------
  test('yearly compounding: 10% on 1000 for 12 months = 1100', function () {
    var r = Calc.project({
      startingAmount: 1000,
      periods: [period({ months: 12, annualRatePercent: 10, compounding: 'yearly' })]
    });
    close(r.totals.finalAmount, 1100, 0.0001, 'final');
  });

  test('monthly compounding: 12% on 1000 for 12 months = 1000 * 1.01^12', function () {
    var r = Calc.project({
      startingAmount: 1000,
      periods: [period({ months: 12, annualRatePercent: 12, compounding: 'monthly' })]
    });
    close(r.totals.finalAmount, 1000 * Math.pow(1.01, 12), 0.0001, 'final');
  });

  test('daily compounding: 5% on 1000 for 12 months = 1000 * (1+.05/365)^365', function () {
    var r = Calc.project({
      startingAmount: 1000,
      periods: [period({ months: 12, annualRatePercent: 5, compounding: 'daily' })]
    });
    close(r.totals.finalAmount, 1000 * Math.pow(1 + 0.05 / 365, 365), 0.0001, 'final');
  });

  test('contributions compound too (ordinary annuity, 12% monthly)', function () {
    var r = Calc.project({
      startingAmount: 0,
      periods: [period({ months: 12, monthlyContribution: 100, annualRatePercent: 12 })]
    });
    // FV of an ordinary annuity: PMT * ((1+i)^n - 1) / i
    var expected = 100 * (Math.pow(1.01, 12) - 1) / 0.01;
    close(r.totals.finalAmount, expected, 0.0001, 'final');
  });

  // --- compounding ordering ---------------------------------------------
  test('for a positive rate: daily > monthly > yearly', function () {
    function run(c) {
      return Calc.project({
        startingAmount: 10000,
        periods: [period({ months: 60, annualRatePercent: 8, compounding: c })]
      }).totals.finalAmount;
    }
    var d = run('daily'), m = run('monthly'), y = run('yearly');
    ok(d > m, 'daily (' + d + ') should beat monthly (' + m + ')');
    ok(m > y, 'monthly (' + m + ') should beat yearly (' + y + ')');
  });

  test('effective annual yield matches the compounding setting', function () {
    close(Calc.effectiveAnnualYield(12, 'monthly'), Math.pow(1.01, 12) - 1, 1e-12, 'monthly APY');
    close(Calc.effectiveAnnualYield(10, 'yearly'), 0.10, 1e-12, 'yearly APY');
    close(Calc.effectiveAnnualYield(5, 'daily'), Math.pow(1 + 0.05 / 365, 365) - 1, 1e-12, 'daily APY');
  });

  // --- periods chain ----------------------------------------------------
  test('periods run back to back, carrying the balance forward', function () {
    var r = Calc.project({
      startingAmount: 10000,
      periods: [
        period({ months: 24, monthlyContribution: 500, annualRatePercent: 8 }),
        period({ months: 36, monthlyContribution: 1000, annualRatePercent: 5 })
      ]
    });
    var p1 = r.perPeriod[0], p2 = r.perPeriod[1];
    close(p2.startBalance, p1.endBalance, 1e-9, 'period 2 start');
    ok(p1.endMonth === 24 && p2.startMonth === 24, 'boundary should sit at month 24');
    close(r.totals.finalAmount, p2.endBalance, 1e-9, 'final == last period end');
    close(r.totals.totalMonths, 60, 0, 'total months');

    // Running the two periods separately must give the same answer.
    var a = Calc.project({ startingAmount: 10000, periods: [period({ months: 24, monthlyContribution: 500, annualRatePercent: 8 })] });
    var b = Calc.project({ startingAmount: a.totals.finalAmount, periods: [period({ months: 36, monthlyContribution: 1000, annualRatePercent: 5 })] });
    close(r.totals.finalAmount, b.totals.finalAmount, 1e-6, 'split run');
  });

  // --- points shape -----------------------------------------------------
  test('points are indexed by month and tagged with their period', function () {
    var r = Calc.project({
      startingAmount: 100,
      periods: [period({ months: 3 }), period({ months: 2 })]
    });
    ok(r.points.length === 6, 'expected 6 points, got ' + r.points.length);
    for (var i = 0; i < r.points.length; i++) {
      ok(r.points[i].month === i, 'point ' + i + ' has month ' + r.points[i].month);
    }
    ok(r.points[0].periodIndex === -1, 'month 0 belongs to no period');
    ok(r.points[3].periodIndex === 0, 'month 3 should close period 0');
    ok(r.points[4].periodIndex === 1, 'month 4 should open period 1');
  });

  // --- edge cases -------------------------------------------------------
  test('negative rate shrinks the balance', function () {
    var r = Calc.project({
      startingAmount: 10000,
      periods: [period({ months: 12, annualRatePercent: -20 })]
    });
    ok(r.totals.finalAmount < 10000, 'expected a loss, got ' + r.totals.finalAmount);
    ok(r.totals.totalGrowth < 0, 'growth should be negative');
  });

  test('a zero-month period is a no-op but still reports a row', function () {
    var r = Calc.project({
      startingAmount: 2000,
      periods: [period({ months: 0, monthlyContribution: 900, annualRatePercent: 50 })]
    });
    close(r.totals.finalAmount, 2000, 0, 'final');
    ok(r.perPeriod.length === 1, 'expected 1 period row');
    close(r.perPeriod[0].contributed, 0, 0, 'contributed');
  });

  test('total months are capped at 1200', function () {
    var r = Calc.project({
      startingAmount: 1000,
      periods: [period({ months: 1000 }), period({ months: 1000 })]
    });
    close(r.totals.totalMonths, Calc.MAX_TOTAL_MONTHS, 0, 'total months');
    ok(r.perPeriod[1].truncated === true, 'second period should report truncation');
  });

  test('junk input is treated as zero, not NaN', function () {
    var r = Calc.project({
      startingAmount: '',
      periods: [{ months: '', monthlyContribution: null, annualRatePercent: undefined, compounding: 'nope' }]
    });
    ok(isFinite(r.totals.finalAmount), 'final should be finite, got ' + r.totals.finalAmount);
    close(r.totals.finalAmount, 0, 0, 'final');
  });

  test('growth equals final minus everything paid in', function () {
    var r = Calc.project({
      startingAmount: 7500,
      periods: [
        period({ months: 18, monthlyContribution: 250, annualRatePercent: 6, compounding: 'daily' }),
        period({ months: 24, monthlyContribution: 0, annualRatePercent: 9, compounding: 'yearly' })
      ]
    });
    close(r.totals.totalContributed, 7500 + 18 * 250, 1e-9, 'contributed');
    close(r.totals.totalGrowth, r.totals.finalAmount - r.totals.totalContributed, 1e-9, 'growth');
    var sum = r.perPeriod.reduce(function (a, p) { return a + p.growth; }, 0);
    close(sum, r.totals.totalGrowth, 1e-6, 'per-period growth sums to total');
  });

  // --- 4% rule ----------------------------------------------------------
  test('4% rule: 1,000,000 supports 40,000 a year', function () {
    var w = Calc.safeWithdrawal(1000000);
    close(w.perYear, 40000, 1e-9, 'per year');
    close(w.perMonth, 40000 / 12, 1e-9, 'per month');
  });

  test('4% rule: the rate is overridable', function () {
    close(Calc.safeWithdrawal(1000000, 3.5).perYear, 35000, 1e-9, 'per year at 3.5%');
    close(Calc.safeWithdrawal(1000000, 0).perYear, 0, 0, 'per year at 0%');
  });

  test('4% rule: junk amounts are zero, not NaN', function () {
    close(Calc.safeWithdrawal(undefined).perYear, 0, 0, 'undefined amount');
    close(Calc.safeWithdrawal('abc').perMonth, 0, 0, 'string amount');
    close(Calc.safeWithdrawal(1000, 'abc').perYear, 0, 0, 'junk rate');
  });

  test('4% rule reads the projected final amount', function () {
    var r = Calc.project({
      startingAmount: 100000,
      periods: [period({ months: 12, monthlyContribution: 0, annualRatePercent: 0 })]
    });
    close(Calc.safeWithdrawal(r.totals.finalAmount).perYear, 4000, 1e-9, 'per year');
  });

  // --- one-off lump sums -------------------------------------------------
  test('a one-off lands at its month and compounds after', function () {
    var withOne = Calc.project({
      startingAmount: 0,
      windfalls: [{ atMonth: 12, amount: 1000 }],
      periods: [period({ months: 24, annualRatePercent: 12, compounding: 'monthly' })]
    });
    // Lands at the end of month 12, so it grows for the remaining 12 months.
    close(withOne.totals.finalAmount, 1000 * Math.pow(1.01, 12), 1e-6, 'final');
  });

  test('a one-off at month 0 equals a bigger starting amount', function () {
    var base = { periods: [period({ months: 36, monthlyContribution: 100, annualRatePercent: 6 })] };
    var viaWindfall = Calc.project({
      startingAmount: 1000, windfalls: [{ atMonth: 0, amount: 5000 }], periods: base.periods
    });
    var viaStarting = Calc.project({ startingAmount: 6000, periods: base.periods });
    close(viaWindfall.totals.finalAmount, viaStarting.totals.finalAmount, 1e-9, 'final');
    close(viaWindfall.totals.totalContributed, viaStarting.totals.totalContributed, 1e-9, 'contributed');
  });

  test('one-offs in the same month sum', function () {
    var r = Calc.project({
      startingAmount: 0,
      windfalls: [{ atMonth: 6, amount: 300 }, { atMonth: 6, amount: 200 }],
      periods: [period({ months: 6, annualRatePercent: 0 })]
    });
    close(r.totals.finalAmount, 500, 1e-9, 'final');
  });

  test('a negative one-off is a planned expense', function () {
    var r = Calc.project({
      startingAmount: 10000,
      windfalls: [{ atMonth: 5, amount: -4000 }],
      periods: [period({ months: 10, annualRatePercent: 0 })]
    });
    close(r.totals.finalAmount, 6000, 1e-9, 'final');
    close(r.totals.totalWindfalls, -4000, 1e-9, 'total one-offs');
  });

  test('a one-off past the end never lands and is reported', function () {
    var r = Calc.project({
      startingAmount: 1000,
      windfalls: [{ atMonth: 999, amount: 50000 }],
      periods: [period({ months: 12, annualRatePercent: 0 })]
    });
    close(r.totals.finalAmount, 1000, 1e-9, 'final');
    close(r.totals.totalWindfalls, 0, 0, 'total one-offs');
    ok(r.unappliedWindfalls.length === 1 && r.unappliedWindfalls[0] === 0,
       'expected index 0 unapplied, got ' + JSON.stringify(r.unappliedWindfalls));
  });

  test('a one-off at the very last month still lands', function () {
    var r = Calc.project({
      startingAmount: 0,
      windfalls: [{ atMonth: 12, amount: 500 }],
      periods: [period({ months: 12, annualRatePercent: 0 })]
    });
    close(r.totals.finalAmount, 500, 1e-9, 'final');
    ok(r.unappliedWindfalls.length === 0, 'should be applied');
  });

  test('a one-off counts as paid in, not as growth', function () {
    var r = Calc.project({
      startingAmount: 1000,
      windfalls: [{ atMonth: 6, amount: 5000 }],
      periods: [period({ months: 12, monthlyContribution: 100, annualRatePercent: 0 })]
    });
    close(r.totals.totalContributed, 1000 + 1200 + 5000, 1e-9, 'contributed');
    close(r.totals.totalGrowth, 0, 1e-9, 'growth must not absorb the one-off');
  });

  test('per-period growth still sums to the total with one-offs', function () {
    var r = Calc.project({
      startingAmount: 7500,
      windfalls: [{ atMonth: 6, amount: 20000 }, { atMonth: 30, amount: -5000 }],
      periods: [
        period({ months: 18, monthlyContribution: 250, annualRatePercent: 6, compounding: 'daily' }),
        period({ months: 24, monthlyContribution: 0, annualRatePercent: 9, compounding: 'yearly' })
      ]
    });
    close(r.totals.totalGrowth, r.totals.finalAmount - r.totals.totalContributed, 1e-9, 'growth');
    var sum = r.perPeriod.reduce(function (a, p) { return a + p.growth; }, 0);
    close(sum, r.totals.totalGrowth, 1e-6, 'per-period growth sums to total');
    var paid = r.perPeriod.reduce(function (a, p) { return a + p.contributed + p.windfalls; }, 0);
    close(paid, r.totals.totalContributed - 7500, 1e-6, 'per-period paid in sums to total');
  });

  test('a one-off is attributed to the period covering its month', function () {
    var r = Calc.project({
      startingAmount: 0,
      windfalls: [{ atMonth: 18, amount: 1000 }],
      periods: [period({ months: 12 }), period({ months: 12 })]
    });
    close(r.perPeriod[0].windfalls, 0, 0, 'first period');
    close(r.perPeriod[1].windfalls, 1000, 0, 'second period');
  });

  test('junk one-offs are ignored, not NaN', function () {
    var r = Calc.project({
      startingAmount: 1000,
      windfalls: [{ atMonth: 'abc', amount: 'xyz' }, { atMonth: -5, amount: null }],
      periods: [period({ months: 12, annualRatePercent: 0 })]
    });
    ok(isFinite(r.totals.finalAmount), 'final should be finite, got ' + r.totals.finalAmount);
    close(r.totals.finalAmount, 1000, 1e-9, 'final');
  });

  // --- recurring extras --------------------------------------------------
  test('horizonMonths mirrors the loop, cap included', function () {
    close(Calc.horizonMonths([{ months: 120 }, { months: 60 }]), 180, 0, 'sum');
    close(Calc.horizonMonths([{ months: 1000 }, { months: 1000 }]), Calc.MAX_TOTAL_MONTHS, 0, 'capped');
  });

  test('windfallMonths: no repeat is a single month', function () {
    var m = Calc.windfallMonths({ atMonth: 12 }, 240);
    ok(m.length === 1 && m[0] === 12, 'got ' + JSON.stringify(m));
  });

  test('windfallMonths: open-ended repeat runs to the horizon', function () {
    var m = Calc.windfallMonths({ atMonth: 12, repeatEvery: 12 }, 60);
    ok(m.join(',') === '12,24,36,48,60', 'got ' + JSON.stringify(m));
  });

  test('windfallMonths: repeatUntil stops it early', function () {
    var m = Calc.windfallMonths({ atMonth: 12, repeatEvery: 6, repeatUntil: 30 }, 240);
    ok(m.join(',') === '12,18,24,30', 'got ' + JSON.stringify(m));
  });

  test('windfallMonths: repeatUntil past the horizon is clamped', function () {
    var m = Calc.windfallMonths({ atMonth: 0, repeatEvery: 12, repeatUntil: 9999 }, 24);
    ok(m.join(',') === '0,12,24', 'got ' + JSON.stringify(m));
  });

  test('windfallMonths: a repeat starting past the end yields nothing', function () {
    var m = Calc.windfallMonths({ atMonth: 500, repeatEvery: 12 }, 240);
    ok(m.length === 0, 'got ' + JSON.stringify(m));
  });

  test('a recurring extra lands every interval', function () {
    var r = Calc.project({
      startingAmount: 0,
      windfalls: [{ atMonth: 12, amount: 1000, repeatEvery: 12 }],
      periods: [period({ months: 60, annualRatePercent: 0 })]
    });
    // Months 12, 24, 36, 48, 60 -> five payments.
    close(r.totals.finalAmount, 5000, 1e-9, 'final');
    close(r.totals.totalWindfalls, 5000, 1e-9, 'total extras');
  });

  test('a recurring extra respects repeatUntil', function () {
    var r = Calc.project({
      startingAmount: 0,
      windfalls: [{ atMonth: 12, amount: 1000, repeatEvery: 12, repeatUntil: 36 }],
      periods: [period({ months: 120, annualRatePercent: 0 })]
    });
    close(r.totals.finalAmount, 3000, 1e-9, 'final');  // 12, 24, 36
  });

  test('repeatEvery 0 is still a plain one-off', function () {
    var r = Calc.project({
      startingAmount: 0,
      windfalls: [{ atMonth: 12, amount: 1000, repeatEvery: 0, repeatUntil: null }],
      periods: [period({ months: 60, annualRatePercent: 0 })]
    });
    close(r.totals.finalAmount, 1000, 1e-9, 'final');
  });

  test('a recurring extra starting past the end is reported unapplied', function () {
    var r = Calc.project({
      startingAmount: 1000,
      windfalls: [{ atMonth: 500, amount: 9000, repeatEvery: 6 }],
      periods: [period({ months: 60, annualRatePercent: 0 })]
    });
    close(r.totals.finalAmount, 1000, 1e-9, 'final');
    ok(r.unappliedWindfalls.length === 1, 'expected 1 unapplied');
  });

  test('recurring extras compound and stay out of growth', function () {
    var r = Calc.project({
      startingAmount: 0,
      windfalls: [{ atMonth: 12, amount: 1000, repeatEvery: 12 }],
      periods: [period({ months: 36, annualRatePercent: 12, compounding: 'monthly' })]
    });
    // Three payments; the first two compound at 1%/mo for 24 and 12 months.
    var expected = 1000 * Math.pow(1.01, 24) + 1000 * Math.pow(1.01, 12) + 1000;
    close(r.totals.finalAmount, expected, 1e-6, 'final');
    close(r.totals.totalContributed, 3000, 1e-9, 'contributed');
    close(r.totals.totalGrowth, expected - 3000, 1e-6, 'growth');
  });

  test('a recurring extra is split across the periods it spans', function () {
    var r = Calc.project({
      startingAmount: 0,
      windfalls: [{ atMonth: 6, amount: 100, repeatEvery: 6 }],
      periods: [period({ months: 12 }), period({ months: 12 })]
    });
    close(r.perPeriod[0].windfalls, 200, 0, 'first period (months 6, 12)');
    close(r.perPeriod[1].windfalls, 200, 0, 'second period (months 18, 24)');
  });

  global.CalcTests = { results: results };
})(window);
