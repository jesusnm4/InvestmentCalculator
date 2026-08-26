/* chart.js — hand-rolled SVG line+area chart, segmented by period.
   Knows nothing about app state: you hand it a Calc.project() result. */
(function (global) {
  'use strict';

  /* Validated categorical palette (dataviz reference palette). The dark column
     is the same eight hues re-stepped for a dark surface, not a second palette.
     This is the single source of truth for series color — the swatch buttons and
     the legend read from here too, so CSS never hardcodes a series hex. */
  var PALETTE = {
    light: ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#4a3aa7', '#e34948'],
    dark:  ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#008300', '#9085e9', '#e66767']
  };
  var COLOR_NAMES = ['Blue', 'Orange', 'Aqua', 'Yellow', 'Magenta', 'Green', 'Violet', 'Red'];

  var INK = {
    light: { grid: '#e1e0d9', axis: '#c3c2b7', muted: '#898781', surface: '#fcfcfb' },
    dark:  { grid: '#2c2c2a', axis: '#383835', muted: '#898781', surface: '#1a1a19' }
  };

  var gradSeq = 0;

  // theme.js owns the decision and stamps it on <html>; just read it.
  function isDark() {
    return document.documentElement.dataset.theme === 'dark';
  }
  function colors() { return isDark() ? PALETTE.dark : PALETTE.light; }
  function ink() { return isDark() ? INK.dark : INK.light; }
  function colorFor(slot) {
    var c = colors();
    var n = Math.max(0, Math.floor(Number(slot) || 0));
    return c[n % c.length];
  }

  var money0 = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  var money2 = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 });
  var compact = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', notation: 'compact', maximumFractionDigits: 1 });

  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  // Round a range up to a friendly 1/2/5 x 10^n step.
  function niceStep(range, targetCount) {
    if (!(range > 0)) return 1;
    var raw = range / targetCount;
    var mag = Math.pow(10, Math.floor(Math.log(raw) / Math.LN10));
    var norm = raw / mag;
    var step = norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10;
    return step * mag;
  }

  function xTicks(maxMonth) {
    var ticks = [], m, y;
    if (maxMonth <= 0) return ticks;
    if (maxMonth <= 24) {
      var stepM = maxMonth <= 6 ? 1 : maxMonth <= 12 ? 3 : 6;
      for (m = 0; m <= maxMonth; m += stepM) ticks.push({ m: m, label: m + 'm' });
    } else {
      var years = maxMonth / 12;
      var candidates = [1, 2, 5, 10, 25, 50, 100];
      var stepY = candidates[candidates.length - 1];
      for (var i = 0; i < candidates.length; i++) {
        if (years / candidates[i] <= 8) { stepY = candidates[i]; break; }
      }
      for (y = 0; y * 12 <= maxMonth; y += stepY) ticks.push({ m: y * 12, label: y + 'y' });
    }
    return ticks;
  }

  function durationLabel(months) {
    var y = Math.floor(months / 12), m = months % 12;
    if (!y) return m + ' mo';
    if (!m) return y + (y === 1 ? ' yr' : ' yrs');
    return y + 'y ' + m + 'm';
  }

  /* render(container, projection, opts)
       opts.periods : [{ name, colorSlot }] — for tooltip labels and colors
       opts.height  : plot height in px (default 320) */
  function render(container, projection, opts) {
    opts = opts || {};
    var periods = opts.periods || [];
    var height = opts.height || 320;
    var width = Math.max(260, container.clientWidth || 640);

    var points = projection.points;
    var maxMonth = projection.totals.totalMonths;

    if (maxMonth <= 0) {
      container.innerHTML = '<div class="chart-empty">Add a period to see the projection.</div>';
      container.__chart = null;
      return;
    }

    var C = ink();
    var m = { t: 16, r: 18, b: 30, l: 68 };
    var plotW = width - m.l - m.r;
    var plotH = height - m.t - m.b;

    // --- y domain, snapped to whole ticks ---
    var lo = Infinity, hi = -Infinity;
    for (var i = 0; i < points.length; i++) {
      if (points[i].balance < lo) lo = points[i].balance;
      if (points[i].balance > hi) hi = points[i].balance;
    }
    var yMin = Math.min(0, lo);
    var yMax = Math.max(hi, yMin + 1);
    var step = niceStep(yMax - yMin, 5);
    yMin = Math.floor(yMin / step) * step;
    yMax = Math.ceil(yMax / step) * step;
    if (yMax === yMin) yMax = yMin + step;

    function x(month) { return m.l + (month / maxMonth) * plotW; }
    function y(v) { return m.t + plotH - ((v - yMin) / (yMax - yMin)) * plotH; }

    var yBase = y(Math.max(yMin, 0)); // baseline sits at zero when zero is in view

    // --- gridlines + y labels ---
    var svg = [];
    svg.push('<svg class="chart-svg" width="' + width + '" height="' + height +
             '" viewBox="0 0 ' + width + ' ' + height + '" role="img" aria-label="Projected balance over time">');

    var defs = ['<defs>'];
    var gradIds = [];
    for (var g = 0; g < periods.length; g++) {
      var id = 'seg-grad-' + (++gradSeq);
      gradIds.push(id);
      var col = colorFor(periods[g].colorSlot);
      defs.push(
        '<linearGradient id="' + id + '" x1="0" y1="0" x2="0" y2="1">' +
        '<stop offset="0%" stop-color="' + col + '" stop-opacity="0.32"/>' +
        '<stop offset="100%" stop-color="' + col + '" stop-opacity="0.04"/>' +
        '</linearGradient>'
      );
    }
    defs.push('</defs>');
    svg.push(defs.join(''));

    for (var v = yMin; v <= yMax + step / 2; v += step) {
      var gy = y(v);
      svg.push('<line x1="' + m.l + '" y1="' + gy + '" x2="' + (m.l + plotW) + '" y2="' + gy +
               '" stroke="' + C.grid + '" stroke-width="1"/>');
      svg.push('<text x="' + (m.l - 10) + '" y="' + (gy + 4) + '" text-anchor="end" ' +
               'fill="' + C.muted + '" font-size="11" style="font-variant-numeric:tabular-nums">' +
               esc(compact.format(v)) + '</text>');
    }

    // --- area + line, one segment per period ---
    var segs = projection.perPeriod;
    var lineParts = [];
    for (var s = 0; s < segs.length; s++) {
      var pp = segs[s];
      if (pp.months <= 0) continue;
      var color = colorFor((periods[pp.index] || {}).colorSlot);
      var d = [], a = [];
      for (var k = pp.startMonth; k <= pp.endMonth; k++) {
        var px = x(k).toFixed(2), py = y(points[k].balance).toFixed(2);
        d.push((k === pp.startMonth ? 'M' : 'L') + px + ' ' + py);
        a.push('L' + px + ' ' + py);
      }
      svg.push('<path d="M' + x(pp.startMonth).toFixed(2) + ' ' + yBase.toFixed(2) + a.join('') +
               'L' + x(pp.endMonth).toFixed(2) + ' ' + yBase.toFixed(2) + 'Z" fill="url(#' + gradIds[pp.index] + ')"/>');
      lineParts.push('<path d="' + d.join('') + '" fill="none" stroke="' + color +
                     '" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>');
    }

    // Surface-colored divider at each handoff: reads as the boundary and keeps
    // adjacent fills from bleeding together.
    for (var b = 1; b < segs.length; b++) {
      if (segs[b].months <= 0 && segs[b - 1].months <= 0) continue;
      var bx = x(segs[b].startMonth).toFixed(2);
      svg.push('<line x1="' + bx + '" y1="' + yBase.toFixed(2) + '" x2="' + bx + '" y2="' +
               y(points[segs[b].startMonth].balance).toFixed(2) +
               '" stroke="' + C.surface + '" stroke-width="2"/>');
    }

    svg.push(lineParts.join(''));

    // --- axes ---
    svg.push('<line x1="' + m.l + '" y1="' + yBase + '" x2="' + (m.l + plotW) + '" y2="' + yBase +
             '" stroke="' + C.axis + '" stroke-width="1"/>');

    var xt = xTicks(maxMonth);
    for (var t = 0; t < xt.length; t++) {
      svg.push('<text x="' + x(xt[t].m).toFixed(2) + '" y="' + (m.t + plotH + 18) +
               '" text-anchor="middle" fill="' + C.muted + '" font-size="11" ' +
               'style="font-variant-numeric:tabular-nums">' + esc(xt[t].label) + '</text>');
    }

    // --- hover layer ---
    svg.push('<line class="crosshair" x1="0" y1="' + m.t + '" x2="0" y2="' + (m.t + plotH) +
             '" stroke="' + C.axis + '" stroke-width="1" opacity="0"/>');
    svg.push('<circle class="hover-dot" r="5" fill="' + C.surface + '" stroke="#000" stroke-width="2" opacity="0"/>');
    svg.push('<rect class="hover-target" x="' + m.l + '" y="' + m.t + '" width="' + plotW +
             '" height="' + plotH + '" fill="transparent"/>');
    svg.push('</svg>');

    container.innerHTML = svg.join('') + '<div class="chart-tooltip" hidden></div>';
    container.__chart = { m: m, plotW: plotW, plotH: plotH, maxMonth: maxMonth, x: x, y: y,
                         points: points, periods: periods, width: width };
    attachHover(container);
  }

  function attachHover(container) {
    var ctx = container.__chart;
    var svg = container.querySelector('svg');
    var target = svg.querySelector('.hover-target');
    var cross = svg.querySelector('.crosshair');
    var dot = svg.querySelector('.hover-dot');
    var tip = container.querySelector('.chart-tooltip');

    function move(ev) {
      var rect = svg.getBoundingClientRect();
      var scale = rect.width ? ctx.width / rect.width : 1;
      var px = (ev.clientX - rect.left) * scale;
      var frac = (px - ctx.m.l) / ctx.plotW;
      var month = Math.round(Math.min(1, Math.max(0, frac)) * ctx.maxMonth);
      var pt = ctx.points[month];
      if (!pt) return;

      var cx = ctx.x(month), cy = ctx.y(pt.balance);
      var period = pt.periodIndex >= 0 ? ctx.periods[pt.periodIndex] : null;
      var color = period ? colorFor(period.colorSlot) : ink().muted;

      cross.setAttribute('x1', cx); cross.setAttribute('x2', cx); cross.setAttribute('opacity', '1');
      dot.setAttribute('cx', cx); dot.setAttribute('cy', cy);
      dot.setAttribute('stroke', color); dot.setAttribute('opacity', '1');

      tip.innerHTML =
        '<div class="tip-head">' + esc(durationLabel(month)) + ' <span class="tip-month">· month ' + month + '</span></div>' +
        '<div class="tip-value">' + esc(money2.format(pt.balance)) + '</div>' +
        (period
          ? '<div class="tip-period"><span class="tip-dot" style="background:' + color + '"></span>' + esc(period.name || ('Period ' + (pt.periodIndex + 1))) + '</div>'
          : '<div class="tip-period"><span class="tip-dot" style="background:' + color + '"></span>Starting amount</div>');
      tip.hidden = false;

      // Flip to the left of the crosshair when it would overflow the container.
      var tw = tip.offsetWidth;
      var left = cx + 14;
      if (left + tw > ctx.width - 4) left = cx - tw - 14;
      tip.style.left = Math.max(4, left) + 'px';
      tip.style.top = Math.max(4, Math.min(cy - 24, ctx.m.t + ctx.plotH - tip.offsetHeight)) + 'px';
    }

    function leave() {
      cross.setAttribute('opacity', '0');
      dot.setAttribute('opacity', '0');
      tip.hidden = true;
    }

    target.addEventListener('pointermove', move);
    target.addEventListener('pointerdown', move);
    target.addEventListener('pointerleave', leave);
  }

  global.Chart = {
    render: render,
    colors: colors,
    colorFor: colorFor,
    colorNames: COLOR_NAMES,
    slotCount: PALETTE.light.length,
    isDark: isDark,
    durationLabel: durationLabel,
    money0: money0,
    money2: money2,
    compact: compact
  };
})(window);
