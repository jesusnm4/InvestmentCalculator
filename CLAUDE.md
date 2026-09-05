# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

A static, dependency-free investment projection calculator. It models **sequential periods**: each
period starts from the balance the previous one ended on, with its own length, monthly contribution,
annual rate, compounding frequency, and color.

## Running and testing

There is no build step, no package manager, and no Node on this machine. Everything runs from the
filesystem or a plain static server:

```sh
python3 -m http.server 8000   # then open http://localhost:8000
```

`index.html` also works when opened directly over `file://` — this is why every JS file is a plain
IIFE that attaches to `window` (`window.Calc`, `window.Chart`, `window.Theme`) rather than an ES
module. Keep it that way; `<script type="module">` breaks under `file://`.

Tests: open `tests.html` in a browser. `js/calc.test.js` is a hand-rolled runner (`test`, `close`,
`ok` helpers) that pushes results into `window.CalcTests.results`; `tests.html` renders one PASS/FAIL
row per assertion. There is no way to run a single test in isolation and no CLI runner — the whole
file runs on page load. To add coverage, add a `test(...)` block in `js/calc.test.js`. Only `calc.js`
is under test; `chart.js` and `app.js` are verified by eye in the browser.

There is no Node, but macOS ships JavaScriptCore, and `calc.js` is DOM-free, so the suite also runs
headless — useful for checking math changes without switching to a browser:

```sh
{ echo 'var window = this;'; cat js/calc.js js/calc.test.js; \
  echo 'CalcTests.results.forEach(function(t){ print((t.pass?"PASS  ":"FAIL  ")+t.name+"  "+t.detail) })'; \
} > /tmp/t.js && /System/Library/Frameworks/JavaScriptCore.framework/Versions/A/Helpers/jsc /tmp/t.js
```

`tests.html` remains the source of truth; this is only a shortcut, and it cannot load `chart.js` or
`app.js` (both need a DOM).

## Architecture

Strict one-way layering, enforced by convention rather than tooling:

```
theme.js  →  stamps data-theme on <html> (blocking, before first paint)
calc.js   →  pure math, no DOM, no app state
chart.js  →  SVG rendering + palette; takes a Calc.project() result, knows nothing about app state
app.js    →  owns state, form wiring, localStorage, and calls into Calc + Chart
```

`app.js` is the only file that touches `state` or the DOM outside its own concern. Never reach back
up the chain — `calc.js` must stay DOM-free so `tests.html` can load it standalone.

**`Calc.project(state)`** returns `{ points, perPeriod, totals }`. `points` is indexed by month
(`points[m].month === m`), so consumers can index it directly; each point carries a `periodIndex`
(`-1` for month 0, the starting amount). `perPeriod[i]` carries `startMonth`/`endMonth` offsets into
`points`, plus `truncated` when the 1200-month (100-year) global cap clipped that period.

**Rates** are nominal annual (APR); compounding (`daily`/`monthly`/`yearly` → f = 365/12/1) decides
how often it is credited. The simulation steps monthly with
`factor = (1 + r/f)^(f/12)`, contribution at month end (ordinary annuity). Yearly compounding is
deliberately spread geometrically across the 12 months instead of credited in one lump — same value
at each year boundary, smooth curve. Negative rates are supported; `monthlyGrowthFactor` returns 0
when the rate is negative enough to make the base non-positive.

**Color is owned by `js/chart.js`**, not CSS. `PALETTE.light` / `PALETTE.dark` are eight hues
pre-validated to stay distinguishable under colorblindness in both themes; the dark column is the
same hues re-stepped, not a second palette. The chart, the legend, the swatch buttons, and the table
dots all read from `Chart.colorFor(slot)`. Do not hardcode a series hex in `styles.css` or in markup.
Periods store a `colorSlot` index, never a hex.

**Theme flips are a re-render, not a CSS swap.** Because series colors come from JS, `app.js`'s
`repaintForTheme()` rebuilds the period cards and the chart on every theme change (including OS-level
changes while the preference is `system`, via `Theme.onSystemChange`). `chart.js` reads
`document.documentElement.dataset.theme` — it never calls `matchMedia` itself.

## Conventions in `app.js`

- **Two render paths, kept separate on purpose.** `renderPeriods()` is structural and rebuilds every
  card via `innerHTML`; it is called only on add / delete / reorder / theme change. `renderResults()`
  plus `refreshCardNotes()` handle what changes as you type — rebuilding a card mid-input would
  destroy the caret. Preserve this split when adding fields.
- Inputs are wired by **delegated listeners** on `#period-list` reading `data-field` / `data-action`
  attributes, with the period identified by `li.dataset.index`. Cards are built as HTML strings, so
  any user-supplied value must go through `escapeHtml` / `escapeAttr`.
- Every mutation calls `save()` (writes `investment-projection-v1` to `localStorage`). All
  `localStorage` access is wrapped in try/catch for private-mode browsers — keep that.
- `load()` re-validates persisted data (unknown `compounding` falls back to `monthly`, `colorSlot` is
  clamped modulo `Chart.slotCount`). Add validation there for any new persisted field.
- Chart re-render on resize watches **width only** — reacting to height would feed the
  `ResizeObserver` its own output.
