/* chart.js — hand-rolled SVG line+area chart, segmented by period.
   Knows nothing about app state: you hand it a Calc.project() result. */
(function (global) {
  'use strict';

  /* Categorical palette: eight hues, each tuned in OKLCh (hue within a few degrees,
     chroma kept) so every pair stays apart under protanopia, deuteranopia and
     tritanopia (simulated ΔE ≥ 5 in OKLab) and every line clears 3:1 on its card.
     tests/e2e.py (series_tellable_apart_in_every_vision) holds it to that. The
     dark column is the same hues re-stepped for a dark surface, not a second palette.
     This is the single source of truth for series color — the swatch buttons and
     the legend read from here too, so CSS never hardcodes a series hex. */
  var PALETTE = {
    light: ['#3a78d2', '#e27041', '#029d70', '#ab5800', '#d07496', '#037e26', '#4a3aa7', '#e5263e'],
    dark:  ['#2775e7', '#d84700', '#33b186', '#df9b00', '#ba3373', '#00871d', '#9996f8', '#ff747e']
  };
  var COLOR_NAMES = ['Blue', 'Orange', 'Aqua', 'Yellow', 'Magenta', 'Green', 'Violet', 'Red'];

  var INK = {
    light: { grid: '#e1e0d9', axis: '#c3c2b7', muted: '#6e6c66', surface: '#fcfcfb', bad: '#d03b3b' },
    dark:  { grid: '#2c2c2a', axis: '#383835', muted: '#898781', surface: '#1a1a19', bad: '#e66767' }
  };

  /* Extras are events, not series, so they must not borrow the period palette —
     hue already means "which period". Shape is the conventional second channel
     when hue is taken, and it survives both themes and greyscale. Four is the
     practical limit at marker size; past that they stop being tellable apart. */
  var SHAPE_NAMES = ['Circle', 'Square', 'Triangle', 'Diamond'];

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

  /* Ink for a figure set on a series fill (the period number on its timeline
     node). Several hues are too light for white text, so pick whichever of
     white or near-black reads better — per slot, per theme. */
  function luminance(hex) {
    var ch = [1, 3, 5].map(function (i) {
      var v = parseInt(hex.slice(i, i + 2), 16) / 255;
      return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
  }
  function contrast(a, b) {
    var la = luminance(a), lb = luminance(b);
    return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
  }
  function mixBlack(hex, keep) {
    return '#' + [1, 3, 5].map(function (i) {
      var v = Math.round(parseInt(hex.slice(i, i + 2), 16) * keep);
      return (v < 16 ? '0' : '') + v.toString(16);
    }).join('');
  }
  /* Fill and ink for a figure set on a series color (the timeline node number).
     Most hues take white or graphite; a mid-tone like the light-theme blue clears
     4.5:1 with neither, so its fill steps darker, a shade at a time, until white
     does. The hue stays recognisably the period's. */
  function nodeColors(slot) {
    var fill = colorFor(slot);
    var white = contrast(fill, '#ffffff'), ink = contrast(fill, '#0b0b0b');
    if (Math.max(white, ink) >= 4.5) return { fill: fill, ink: white >= ink ? '#ffffff' : '#0b0b0b' };
    for (var keep = 0.96; keep > 0.5; keep -= 0.04) {
      var deeper = mixBlack(fill, keep);
      if (contrast(deeper, '#ffffff') >= 4.5) return { fill: deeper, ink: '#ffffff' };
    }
    return { fill: fill, ink: '#ffffff' };
  }

  /* One marker glyph, centred on (cx, cy). Radii are tuned so the four read as
     the same visual weight rather than the same bounding box. */
  function shapeMark(slot, cx, cy, r, fill, stroke, sw) {
    var n = Math.max(0, Math.floor(Number(slot) || 0)) % SHAPE_NAMES.length;
    var attrs = ' fill="' + fill + '" stroke="' + stroke + '" stroke-width="' + sw +
                '" stroke-linejoin="round"';
    if (n === 1) {
      var h = r * 0.9;
      return '<rect x="' + (cx - h).toFixed(2) + '" y="' + (cy - h).toFixed(2) +
             '" width="' + (h * 2).toFixed(2) + '" height="' + (h * 2).toFixed(2) + '"' + attrs + '/>';
    }
    if (n === 2) {
      var t = r * 1.25;
      return '<polygon points="' + cx.toFixed(2) + ',' + (cy - t).toFixed(2) + ' ' +
             (cx + t * 0.92).toFixed(2) + ',' + (cy + t * 0.72).toFixed(2) + ' ' +
             (cx - t * 0.92).toFixed(2) + ',' + (cy + t * 0.72).toFixed(2) + '"' + attrs + '/>';
    }
    if (n === 3) {
      var d = r * 1.3;
      return '<polygon points="' + cx.toFixed(2) + ',' + (cy - d).toFixed(2) + ' ' +
             (cx + d).toFixed(2) + ',' + cy.toFixed(2) + ' ' +
             cx.toFixed(2) + ',' + (cy + d).toFixed(2) + ' ' +
             (cx - d).toFixed(2) + ',' + cy.toFixed(2) + '"' + attrs + '/>';
    }
    return '<circle cx="' + cx.toFixed(2) + '" cy="' + cy.toFixed(2) + '" r="' + r.toFixed(2) + '"' + attrs + '/>';
  }

  // The same glyph standalone, for the legend key.
  function shapeGlyph(slot, size) {
    var C = ink();
    var s = size || 11, c = s / 2;
    return '<svg class="extra-glyph" width="' + s + '" height="' + s +
           '" viewBox="0 0 ' + s + ' ' + s + '" aria-hidden="true">' +
           shapeMark(slot, c, c, s * 0.27, C.surface, C.muted, 1.6) + '</svg>';
  }

  /* Money formats share one typographic minus (−), not the hyphen Intl emits,
     so every negative figure on the page reads the same. */
  function withMinus(nf) {
    return { format: function (v) { return nf.format(v).replace('-', '\u2212'); } };
  }
  var money0 = withMinus(new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }));
  var money2 = withMinus(new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 }));
  var compact = withMinus(new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', notation: 'compact', maximumFractionDigits: 1 }));

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
      // The end gets its own tick when the last round one falls well short of it (45 yrs, not just 40y).
      var lastTick = ticks[ticks.length - 1].m;
      if (maxMonth - lastTick >= stepY * 12 * 0.4) {
        ticks.push({ m: maxMonth, label: Math.floor(maxMonth / 12) + 'y' + (maxMonth % 12 ? ' ' + (maxMonth % 12) + 'm' : ''), end: true });
      }
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
       opts.periods   : [{ name, colorSlot }] — for tooltip labels and colors
       opts.windfalls : [{ name, atMonth, amount }] — one marker per occurrence
       opts.height    : plot height in px (default 320) */
  function render(container, projection, opts) {
    opts = opts || {};
    var periods = opts.periods || [];
    var height = opts.height || 320;
    // Drawn at the box's own width (down to a 320px phone's 250), so chart text is never scaled.
    var width = Math.max(200, container.clientWidth || 640);

    var points = projection.points;
    var planEnd = projection.totals.totalMonths;
    // A kept baseline on a longer timeline widens the axis, so its line stays in view.
    var maxMonth = Math.max(planEnd, opts.baseline && planEnd > 0 ? opts.baseline.length - 1 : 0);

    if (maxMonth <= 0) {
      container.innerHTML = '<div class="chart-empty">Add a season to see the projection.</div>';
      container.__chart = null;
      return;
    }

    var C = ink();
    var m = { t: 30, r: 18, b: 30, l: 68 };
    var plotW = width - m.l - m.r;
    var plotH = height - m.t - m.b;

    /* Once the money runs out there is no balance left to plot: the line stops
       at $0 and the rest of the timeline is shaded instead of charting debt that
       cannot exist. The table and the hero still report the shortfall. */
    var dep = (opts.depletedAt === null || opts.depletedAt === undefined) ? null : opts.depletedAt;
    /* Withdrawals never go below zero (they stop at what is there), so a negative
       balance is a planned expense's debt: plotted, so the chart shows how deep it goes. */
    // After a run-out the line rests at $0, except debt a planned expense already ran up: that stays plotted.
    function val(k) { return dep !== null && k >= dep ? Math.min(0, points[k].balance) : points[k].balance; }
    var baseline = opts.baseline ? opts.baseline.map(function (b) { return Math.max(0, b); }) : null;

    // --- y domain, snapped to whole ticks ---
    var lo = Infinity, hi = -Infinity;
    for (var i = 0; i < points.length; i++) {
      if (val(i) < lo) lo = val(i);
      if (val(i) > hi) hi = val(i);
    }
    if (baseline) {
      for (var bi = 0; bi < baseline.length; bi++) {
        if (baseline[bi] < lo) lo = baseline[bi];
        if (baseline[bi] > hi) hi = baseline[bi];
      }
    }
    var yMin = Math.min(0, lo);
    var yMax = Math.max(hi, yMin + 1);
    // Try a few tick counts and keep the one that wastes the least headroom.
    var step = 0, best = Infinity;
    for (var tc = 4; tc <= 6; tc++) {
      var st = niceStep(yMax - yMin, tc);
      var span = Math.ceil(yMax / st) * st - Math.floor(yMin / st) * st;
      if (span < best - 1e-9) { best = span; step = st; }
    }
    yMin = Math.floor(yMin / step) * step;
    yMax = Math.ceil(yMax / step) * step;
    if (yMax === yMin) yMax = yMin + step;

    function x(month) { return m.l + (month / maxMonth) * plotW; }
    function y(v) { return m.t + plotH - ((v - yMin) / (yMax - yMin)) * plotH; }

    var yBase = y(Math.max(yMin, 0)); // baseline sits at zero when zero is in view

    // --- gridlines + y labels ---
    var svg = [];
    svg.push('<svg class="chart-svg" width="' + width + '" height="' + height +
             '" viewBox="0 0 ' + width + ' ' + height + '" role="img" aria-label="' +
             esc(opts.label || 'Projected balance over time') + '">');

    var defs = ['<defs>'];
    var gradIds = [];
    for (var g = 0; g < periods.length; g++) {
      var id = 'seg-grad-' + (++gradSeq);
      gradIds.push(id);
      var col = colorFor(periods[g].colorSlot);
      defs.push(
        '<linearGradient id="' + id + '" x1="0" y1="0" x2="0" y2="1">' +
        // Dark: a lighter wash, or warm hues go muddy against the near-black page.
        '<stop offset="0%" stop-color="' + col + '" stop-opacity="' + (isDark() ? 0.22 : 0.32) + '"/>' +
        '<stop offset="100%" stop-color="' + col + '" stop-opacity="' + (isDark() ? 0.02 : 0.04) + '"/>' +
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
               'fill="' + C.muted + '" font-size="12" style="font-variant-numeric:tabular-nums">' +
               esc(compact.format(v)) + '</text>');
    }

    // --- area + line, one segment per period ---
    var segs = projection.perPeriod;
    var lineParts = [];
    var debtAfter = false;
    for (var dk = dep === null ? points.length : dep; dk < points.length; dk++) if (points[dk].balance < 0) { debtAfter = true; break; }
    for (var s = 0; s < segs.length; s++) {
      var pp = segs[s];
      if (pp.months <= 0) continue;
      // Seasons drawn only up to the month the money runs out, unless a debt is still running there.
      var segEnd = dep !== null ? Math.min(pp.endMonth, dep) : pp.endMonth;
      var color = colorFor((periods[pp.index] || {}).colorSlot);
      // A season wholly after the run-out still shows where it sits: a dashed line at $0
      // (dashed, not faded, so it keeps its 3:1).
      if (segEnd <= pp.startMonth) {
        if (dep !== null && pp.startMonth >= dep) {
          svg.push('<line x1="' + x(pp.startMonth).toFixed(2) + '" y1="' + yBase.toFixed(2) + '" x2="' + x(pp.endMonth).toFixed(2) +
                   '" y2="' + yBase.toFixed(2) + '" stroke="' + color + '" stroke-width="2.5" stroke-dasharray="6 5"/>');
        }
        continue;
      }
      var d = [], a = [];
      for (var k = pp.startMonth; k <= segEnd; k++) {
        var px = x(k).toFixed(2), py = y(val(k)).toFixed(2);
        d.push((k === pp.startMonth ? 'M' : 'L') + px + ' ' + py);
        // The season's fill stays above $0: below it is debt, which the Loss Red wash shows.
        a.push('L' + px + ' ' + y(Math.max(0, val(k))).toFixed(2));
      }
      svg.push('<path d="M' + x(pp.startMonth).toFixed(2) + ' ' + yBase.toFixed(2) + a.join('') +
               'L' + x(segEnd).toFixed(2) + ' ' + yBase.toFixed(2) + 'Z" fill="url(#' + gradIds[pp.index] + ')"/>');
      // A season sharing an earlier season's hue (past eight) is drawn dashed.
      lineParts.push('<path d="' + d.join('') + '" fill="none" stroke="' + color +
                     '" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"' +
                     ((periods[pp.index] || {}).reused ? ' stroke-dasharray="6 3"' : '') + '/>');
    }

    /* Extra markers, one per occurrence. Neutral ink, never the series palette —
       a swatch color would read as "another period". The stem sits under the
       balance line, the dot on top of it.

       A repeat can produce dozens of occurrences, and that many stems would bury
       the curve, so past STEM_LIMIT the markers drop to bare dots. */
    var wf = opts.windfalls || [];
    var STEM_LIMIT = 12;
    var stems = wf.length <= STEM_LIMIT;
    // Shape needs size to read at all; the dense case gives up some of it.
    var markR = stems ? 4.5 : 3.2;
    var wfDots = [];
    for (var wi = 0; wi < wf.length; wi++) {
      var wm = Math.max(0, Math.min(planEnd, Math.floor(Number(wf[wi].atMonth) || 0)));
      if (!points[wm]) continue;
      var wx = x(wm), wy = y(val(wm));
      // A repeat's occurrences get no stems: a row of drop lines reads as a picket fence.
      if (stems && !wf[wi].repeat) {
        svg.push('<line x1="' + wx.toFixed(2) + '" y1="' + yBase.toFixed(2) + '" x2="' + wx.toFixed(2) +
                 '" y2="' + wy.toFixed(2) + '" stroke="' + C.muted + '" stroke-width="1" stroke-dasharray="3 3"/>');
      }
      wfDots.push('<g data-month="' + wm + '">' + shapeMark(wf[wi].shapeSlot, wx, wy, markR, C.surface, C.muted, 2) + '</g>');
    }

    // Surface-colored divider at each handoff: reads as the boundary and keeps
    // adjacent fills from bleeding together. Above the curve a dashed ruled line
    // carries the boundary up to the label band, so the plan reads as a sequence
    // (in muted ink: the axis grey is too faint, at 1.8:1, to be the only mark).
    for (var b = 1; b < segs.length; b++) {
      if (segs[b].months <= 0 && segs[b - 1].months <= 0) continue;
      var bx = x(segs[b].startMonth).toFixed(2);
      var by = y(val(segs[b].startMonth)).toFixed(2);
      svg.push('<line x1="' + bx + '" y1="' + yBase.toFixed(2) + '" x2="' + bx + '" y2="' + by +
               '" stroke="' + C.surface + '" stroke-width="2"/>');
      svg.push('<line x1="' + bx + '" y1="' + (m.t - 14) + '" x2="' + bx + '" y2="' + by +
               '" stroke="' + C.muted + '" stroke-width="1" stroke-dasharray="2 3"/>');
    }

    /* Period names in the band above the plot, one per stretch of the curve.
       A name that would not fit its stretch is left out rather than clipped —
       the legend and tooltip still carry it. */
    /* All or nothing: a band missing some names looks broken, so if any name
       will not fit its stretch the band stays empty and the legend names them. */
    var labels = [];
    var allLabels = true;
    for (var lb = 0; lb < segs.length; lb++) {
      var seg = segs[lb];
      if (seg.months <= 0) continue;
      var meta0 = periods[seg.index] || {};
      var label0 = meta0.name || ('Season ' + (seg.index + 1));
      if (label0.length * 6.8 + 14 > x(seg.endMonth) - x(seg.startMonth) - 12) { allLabels = false; break; }
      labels.push({ seg: seg, meta: meta0, label: label0 });
    }
    if (!allLabels) labels = [];
    for (var li2 = 0; li2 < labels.length; li2++) {
      var meta = labels[li2].meta, label = labels[li2].label;
      var lx = x(labels[li2].seg.startMonth) + 6;
      svg.push('<rect x="' + lx.toFixed(2) + '" y="' + (m.t - 21) + '" width="8" height="8" rx="2" fill="' +
               colorFor(meta.colorSlot) + '"/>');
      svg.push('<text x="' + (lx + 13).toFixed(2) + '" y="' + (m.t - 13) + '" fill="' + C.muted +
               '" font-size="12">' + esc(label) + '</text>');
    }

    /* The baseline: a kept earlier version of the plan, drawn as a dashed pencil
       line under the live curve. Neutral ink — it is not a period. */
    if (baseline && baseline.length > 1) {
      var bd = [];
      var bMax = Math.min(baseline.length - 1, maxMonth);
      for (var bm = 0; bm <= bMax; bm++) {
        bd.push((bm ? 'L' : 'M') + x(bm).toFixed(2) + ' ' + y(baseline[bm]).toFixed(2));
      }
      svg.push('<path class="baseline" d="' + bd.join('') + '" fill="none" stroke="' + C.muted +
               '" stroke-width="1.5" stroke-dasharray="5 4" stroke-linejoin="round" opacity="0.9"/>');
    }

    /* Debt a planned expense runs up after the run-out is a loss, not the season:
       a Loss Red line and wash from the run-out on, never the season's colour. */
    if (debtAfter) {
      var dd = [], da = [];
      for (var dm = dep; dm <= planEnd; dm++) {
        var dpx = x(dm).toFixed(2), dpy = y(val(dm)).toFixed(2);
        dd.push((dm === dep ? 'M' : 'L') + dpx + ' ' + dpy);
        da.push('L' + dpx + ' ' + dpy);
      }
      svg.push('<path d="M' + x(dep).toFixed(2) + ' ' + yBase.toFixed(2) + da.join('') + 'L' + x(planEnd).toFixed(2) + ' ' +
               yBase.toFixed(2) + 'Z" fill="' + C.bad + '" opacity="0.1"/>');
      lineParts.push('<path d="' + dd.join('') + '" fill="none" stroke="' + C.bad +
                     '" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>');
    }
    svg.push(lineParts.join(''));
    svg.push(wfDots.join(''));

    /* The month the money runs out: a loss-red rule down to the axis and a label
       at the zero line. Semantic color, not a series color. */
    /* A planned expense that takes the balance below zero for a while: the line
       rests on $0, but the stretch is washed in Loss Red and labelled with how
       deep it went, so the borrowed years are not invisible. */
    // Wash labels are drawn last, so no grid or season line runs through them.
    var labels = [];
    // On a narrow chart the label drops clear of the top gridline and its tick.
    var labelY = plotW < 520 ? 26 : 14;
    var below = opts.belowZero || [];
    for (var bz = 0; bz < below.length; bz++) {
      var bx0 = x(below[bz][0]), bx1 = x(below[bz][1]);
      svg.push('<rect x="' + bx0.toFixed(2) + '" y="' + m.t + '" width="' + Math.max(1, bx1 - bx0).toFixed(2) +
               '" height="' + plotH + '" fill="' + C.bad + '" opacity="0.07"/>');
      svg.push('<line x1="' + bx0.toFixed(2) + '" y1="' + yBase.toFixed(2) + '" x2="' + bx1.toFixed(2) + '" y2="' + yBase.toFixed(2) +
               '" stroke="' + C.bad + '" stroke-width="2" stroke-dasharray="2 3"/>');
      if (bz === 0 && opts.belowZeroLabel) {
        var lright = bx0 < m.l + plotW - 160;
        labels.push('<text x="' + (lright ? bx0 + 6 : bx0 - 6).toFixed(2) + '" y="' + (m.t + labelY) + '" text-anchor="' + (lright ? 'start' : 'end') +
                 '" fill="' + C.bad + '" font-size="12" font-weight="600" stroke="' + C.surface + '" stroke-width="4" paint-order="stroke">' +
                 esc(opts.belowZeroLabel) + '</text>');
      }
    }

    if (dep !== null && dep <= planEnd) {
      var dx = x(dep);
      // The stretch with no money left: a quiet wash, and a flat pencil line at $0.
      svg.push('<rect x="' + dx.toFixed(2) + '" y="' + m.t + '" width="' + (x(planEnd) - dx).toFixed(2) +
               '" height="' + plotH + '" fill="' + C.muted + '" opacity="0.08"/>');
      svg.push('<line x1="' + dx.toFixed(2) + '" y1="' + yBase.toFixed(2) + '" x2="' + x(planEnd).toFixed(2) +
               '" y2="' + yBase.toFixed(2) + '" stroke="' + C.muted + '" stroke-width="2" stroke-dasharray="2 4"/>');
      svg.push('<line x1="' + dx.toFixed(2) + '" y1="' + m.t + '" x2="' + dx.toFixed(2) + '" y2="' + (m.t + plotH) +
               '" stroke="' + C.bad + '" stroke-width="1.5" stroke-dasharray="4 3"/>');
      // Label at the top of the plot, where the tooltip (which follows the curve near $0) will not cover it.
      /* Into the empty wash on the right, where the curve has ended. If the full
         label won't fit there (a narrow chart), the short one does; only if neither
         fits does it go left, over the curve. ~6.6px a character at 12px/600. */
      var full = opts.depletedLabel || 'Runs out \u00b7 ' + durationLabel(dep);
      var room = x(planEnd) - dx - 10;
      var fits = function (t) { return t.length * 6.6 <= room; };
      var said = fits(full) ? full : opts.depletedLabelShort && fits(opts.depletedLabelShort) ? opts.depletedLabelShort : full;
      var right = fits(said);
      labels.push('<text x="' + (right ? dx + 6 : dx - 6).toFixed(2) + '" y="' + (m.t + labelY) +
               '" text-anchor="' + (right ? 'start' : 'end') + '" fill="' + C.bad + '" font-size="12" font-weight="600"' +
               ' stroke="' + C.surface + '" stroke-width="4" paint-order="stroke">' +
               esc(said) + '</text>');
    }

    // --- axes ---
    svg.push('<line x1="' + m.l + '" y1="' + yBase + '" x2="' + (m.l + plotW) + '" y2="' + yBase +
             '" stroke="' + C.axis + '" stroke-width="1"/>');

    var xt = xTicks(maxMonth);
    // The end tick beside a close round one ("40y45y" on a phone): keep the end, drop the round one.
    if (xt.length > 1 && xt[xt.length - 1].end && x(xt[xt.length - 1].m) - x(xt[xt.length - 2].m) < 32) xt.splice(xt.length - 2, 1);
    for (var t = 0; t < xt.length; t++) {
      svg.push('<text x="' + x(xt[t].m).toFixed(2) + '" y="' + (m.t + plotH + 18) +
               '" text-anchor="' + (xt[t].end ? 'end' : 'middle') + '" fill="' + C.muted + '" font-size="12" ' +
               'style="font-variant-numeric:tabular-nums">' + esc(xt[t].label) + '</text>');
    }

    // --- hover layer ---
    svg.push('<line class="crosshair" x1="0" y1="' + m.t + '" x2="0" y2="' + (m.t + plotH) +
             '" stroke="' + C.muted + '" stroke-width="1" opacity="0"/>');
    svg.push('<circle class="hover-dot" r="5" fill="' + C.surface + '" stroke="#000" stroke-width="2" opacity="0"/>');
    svg.push('<rect class="hover-target" x="' + m.l + '" y="' + m.t + '" width="' + plotW +
             '" height="' + plotH + '" fill="transparent"/>');
    svg.push(labels.join(''));
    svg.push('</svg>');

    /* The readout is heard from a standing live region (opts.live): one that hides
       and shows itself is announced unreliably. */
    container.innerHTML = svg.join('') + '<div class="chart-tooltip" hidden></div>';
    var wfByMonth = {};
    for (var wj = 0; wj < wf.length; wj++) {
      var wjm = Math.max(0, Math.floor(Number(wf[wj].atMonth) || 0));
      (wfByMonth[wjm] = wfByMonth[wjm] || []).push(wf[wj]);
    }

    container.__chart = { m: m, plotW: plotW, plotH: plotH, maxMonth: maxMonth, x: x, y: y,
                         points: points, periods: periods, windfalls: wfByMonth, width: width,
                         baseline: baseline, allLabels: allLabels, dep: dep, live: opts.live || null };
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
      showAt(Math.round(Math.min(1, Math.max(0, frac)) * ctx.maxMonth));
    }

    // The readout for one month: shared by the pointer and the arrow keys.
    function showAt(month) {
      container.__month = month;
      var pt = ctx.points[month];
      // Past the plan's end only the longer baseline is left to read.
      if (!pt && ctx.baseline && ctx.baseline[month] !== undefined) {
        var bx = ctx.x(month), by = ctx.y(ctx.baseline[month]);
        cross.setAttribute('x1', bx); cross.setAttribute('x2', bx); cross.setAttribute('opacity', '1');
        dot.setAttribute('cx', bx); dot.setAttribute('cy', by);
        dot.setAttribute('stroke', ink().muted); dot.setAttribute('opacity', '1');
        tip.innerHTML = '<div class="tip-head">' + esc(durationLabel(month)) + '</div>' +
          '<div class="tip-period">Plan ended at ' + esc(durationLabel(ctx.points.length - 1)) + '</div>' +
          '<div class="tip-baseline">Baseline ' + esc(money0.format(ctx.baseline[month])) + '</div>';
        tip.hidden = false;
        placeTip(bx, by);
        return;
      }
      if (!pt) return;

      var ranOut = ctx.dep !== null && month >= ctx.dep;
      // After a run-out the readout rests at $0, or at the debt an expense left.
      var shown = ranOut ? Math.min(0, pt.balance) : pt.balance;
      var cx = ctx.x(month), cy = ctx.y(shown);
      var period = pt.periodIndex >= 0 ? ctx.periods[pt.periodIndex] : null;
      var color = period ? colorFor(period.colorSlot) : ink().muted;

      cross.setAttribute('x1', cx); cross.setAttribute('x2', cx); cross.setAttribute('opacity', '1');
      dot.setAttribute('cx', cx); dot.setAttribute('cy', cy);
      dot.setAttribute('stroke', color); dot.setAttribute('opacity', '1');

      tip.innerHTML =
        '<div class="tip-head">' + esc(month ? durationLabel(month) : 'Start') + '</div>' +
        '<div class="tip-value">' + esc(money0.format(shown)) + '</div>' +
        (ranOut ? '<div class="tip-short">Ran out' + (pt.short > 0 ? ' \u00b7 ' + esc(money0.format(pt.short)) + ' unpaid this month'
          : pt.balance < 0 ? ' \u00b7 short by ' + esc(money0.format(-pt.balance)) : '') + '</div>' : '') +
        (period
          ? '<div class="tip-period"><span class="tip-dot" style="background:' + color + '"></span>' + esc(period.name || ('Season ' + (pt.periodIndex + 1))) + '</div>'
          : '<div class="tip-period"><span class="tip-dot" style="background:' + color + '"></span>Starting amount</div>') +
        (ctx.baseline && ctx.baseline[month] !== undefined
          ? '<div class="tip-baseline">Baseline ' + esc(money0.format(ctx.baseline[month])) + '</div>'
          // A plan longer than its baseline: past its end, say so rather than going quiet.
          : ctx.baseline ? '<div class="tip-baseline">Baseline ended at ' + esc(durationLabel(ctx.baseline.length - 1)) + '</div>' : '') +
        (ctx.windfalls[month] || []).map(function (w) {
          return '<div class="tip-windfall">' + esc(money0.format(w.amount)) + ' &middot; ' +
                 esc(w.name || 'extra') + '</div>';
        }).join('');
      tip.hidden = false;
      placeTip(cx, cy);
    }
    function speak() {
      if (ctx.live) ctx.live.textContent = Array.prototype.map.call(tip.children, function (d) { return d.textContent; }).join(', ');
    }

    // Flip to the left of the crosshair when it would overflow the container.
    function placeTip(cx, cy) {
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
    /* A finger leaves the chart the moment it lifts, so on touch the readout
       stays put until the next tap elsewhere; a mouse leaving still hides it. */
    target.addEventListener('pointerleave', function (ev) { if (ev.pointerType !== 'touch') leave(); });
    if (!container.__tapAway) {
      container.__tapAway = true;
      document.addEventListener('pointerdown', function (ev) {
        if (ev.pointerType === 'touch' && !container.contains(ev.target)) {
          var t = container.querySelector('.chart-tooltip');
          if (t && !t.hidden) container.querySelector('.hover-target').dispatchEvent(new PointerEvent('pointercancel'));
        }
      });
    }
    // A touch that turns into a page scroll cancels the pointer; drop the readout.
    target.addEventListener('pointercancel', leave);
    container.__showAt = showAt;
    container.__speak = speak;
    container.__leave = leave;
    // Keyboard: wired once per container (the svg inside is rebuilt on every render).
    if (!container.__keys) {
      container.__keys = true;
      container.addEventListener('keydown', function (ev) {
        var c = container.__chart;
        if (!c || !container.__showAt) return;
        var at = typeof container.__month === 'number' ? container.__month : -1;
        var step = ev.shiftKey ? 1 : 12, next = null;
        if (ev.key === 'ArrowRight') next = at < 0 ? 0 : at + step;
        else if (ev.key === 'ArrowLeft') next = at < 0 ? c.maxMonth : at - step;
        else if (ev.key === 'Home') next = 0;
        else if (ev.key === 'End') next = c.maxMonth;
        else if (ev.key === 'Escape') { container.__month = null; container.__leave(); return; }
        if (next === null) return;
        ev.preventDefault();
        container.__showAt(Math.max(0, Math.min(c.maxMonth, next)));
        // Only keyboard steps are spoken: a pointer sweep would flood the region.
        container.__speak();
      });
      container.addEventListener('blur', function () { container.__month = null; if (container.__leave) container.__leave(); });
    }
  }

  global.Chart = {
    render: render,
    colors: colors,
    colorFor: colorFor,
    nodeColors: nodeColors,
    colorNames: COLOR_NAMES,
    slotCount: PALETTE.light.length,
    isDark: isDark,
    shapeGlyph: shapeGlyph,
    shapeNames: SHAPE_NAMES,
    shapeCount: SHAPE_NAMES.length,
    durationLabel: durationLabel,
    money0: money0,
    money2: money2,
    compact: compact
  };
})(window);
