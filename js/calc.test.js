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

  global.CalcTests = { results: results };
})(window);
