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

**Cache busting:** `index.html` loads every CSS/JS file with a `?v=YYYY-MM-DD` query. Bump it (all
five at once) whenever any of those files change, or browsers keep serving stale copies and the
new HTML runs against old JS. The fonts are left unversioned so the preload and `@font-face` URLs
match.

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

A misplaced brace in `styles.css` silently scopes the rest of the file into one media query (desktop
then looks unstyled while phones look fine). After moving CSS blocks, check the balance:

```sh
python3 -c "import re;s=re.sub(r'/\*.*?\*/','',open('styles.css').read(),flags=re.S);d=m=0
for c in s:
  d+=(c=='{')-(c=='}');m=min(m,d)
print('ok' if d==0 and m==0 else 'UNBALANCED')"
```

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
`points`, plus `truncated` when the 1200-month (100-year) global cap clipped that period. Each point
also records the month's inflows (`contribution`, `extra`). `totals.depletedAt` is the first month a withdrawal
could not be paid in full (a later refill, e.g. a pension extra, does not undo it); without any
unpaid withdrawal it is the start of a final stretch below zero, else null; `totals.dippedAt` is
the first month below zero at all (a dip that later recovers is reported, not treated as running
out). A withdrawal only takes what is there: once the balance is empty the unpaid part goes to
`shortfall` (`perPeriod[i].shortfall`, `totals.totalShortfall`) and `withdrawn` counts only money
actually paid, so withdrawals never drive the balance below zero (a planned expense still can).
`Calc.extraScale` and `Calc.savingMoreAdds` power the expense and "save more" levers. The levers'
internal `lasts()` test is strict (never short, never below zero). `totals.lowestBalance` and
`totals.monthsBelowZero` describe a planned-expense dip (money borrowed against the plan). A kept
baseline stores its own `depletedAt`: withdrawals stop at $0, so its balances alone never show a
run-out. `Calc.inTodaysDollars(projection, inflationPercent)` returns
the same shape restated in today's dollars, discounting each flow by its month so
`growth = end - start - contributed - windfalls` still holds; it returns the input unchanged at 0%.

**Seasons** are the UI's name for periods (`state.periods`); the code keeps "period".

**Extras** (`state.windfalls` — the UI says "extras", the code still says windfalls) are lump sums
anchored to *absolute* months, independent of the period list, summed when several share a month and
applied at month end like a contribution. An extra's `amount` is in today's dollars and rises with
`state.inflationPercent` (`Calc.extraAt(w, month, inflation)` gives its dollars in month m) unless
`w.fixed`; `load()` marks extras saved before this as fixed so they keep their meaning. Periods carry a stable
`id`; an extra with `anchor` (a period id) and `anchorOffset` lands at that season's start + 1 +
offset, and `untilSeason` makes a repeat stop at its season's end. `syncAnchors()` in app.js
re-derives `atMonth` / `repeatUntil` from those before every render and save, so calc.js only ever
sees absolute months. An extra may repeat: `repeatEvery` months from `atMonth`
until `repeatUntil`, or to the end of the timeline when that is null. `Calc.windfallMonths(w, horizon)`
is the single source of truth for which months an extra lands on — the projection math and the chart
markers both read it, so they can never disagree. The
accounting is the part to be careful with: `totals.totalContributed` means *everything paid in* and
must include them, or `totalGrowth` silently absorbs the lump sum. `perPeriod[i].contributed` stays
monthly-savings-only (never negative), withdrawals sit in `perPeriod[i].withdrawn` (positive), and
one-offs in a sibling `perPeriod[i].windfalls`, so the invariant
`growth = endBalance - startBalance - contributed + withdrawn - windfalls` holds (and in totals,
`final = totalContributed - totalWithdrawn + totalGrowth`). A season's direction is `flow`
(`'save'` / `'withdraw'`). Saving adds a flat `monthlyContribution`. Withdrawing is in **today's
dollars and rises with inflation** (`state.inflationPercent`, a plan input that also drives the
today's-dollars view), either a fixed `monthlyContribution` (`withdrawUnit: 'dollars'`) or the 4%
rule (`withdrawUnit: 'percent'`, `withdrawPercent`): that percent of the balance the season starts
with, in its first year, then raised with inflation. `flowAt()` in calc.js is the one place that
turns a season into a signed monthly amount; `Calc.isWithdrawing(p)` says whether it takes money
out. A negative amount on a saving season (older saved plans) still means a fixed withdrawal.
`perPeriod[i].firstWithdrawal` is the season's first monthly withdrawal in today's dollars. `Calc.withdrawalScale(state)` and `Calc.extraStartNeeded(state)` answer "what would
last" by bisection over full projections. Anything scheduled past the
end never lands and comes back in `unappliedWindfalls` (indices) rather than being dropped silently;
for a repeat that means its *first* occurrence, since later ones falling off the end are expected.

**Rates** are nominal annual (APR); compounding (`daily`/`monthly`/`yearly` → f = 365/12/1) decides
how often it is credited. The simulation steps monthly with
`factor = (1 + r/f)^(f/12)`, contribution at month end (ordinary annuity). Yearly compounding is
deliberately spread geometrically across the 12 months instead of credited in one lump — same value
at each year boundary, smooth curve. Negative rates are supported; `monthlyGrowthFactor` returns 0
when the rate is negative enough to make the base non-positive.

**Extras are shape-coded, never color-coded.** Hue is already spoken for — it means *which period* —
so `Chart.shapeMark`/`Chart.shapeGlyph` draw the four marker shapes in neutral `INK` tones, and each
extra owns a stable `shapeSlot` the way a period owns a `colorSlot` (stored, not derived from
position, so deleting one does not reshuffle the rest). If you add a visual channel for extras, do
not reach for `PALETTE`.

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
  clamped modulo `Chart.slotCount`, `view` falls back to today's dollars at 2.5%, a malformed
  `baseline` is dropped). Add validation there for any new persisted field.
- **Money view.** `renderResults()` projects nominally, then restates through
  `Calc.inTodaysDollars` when `state.view.money === 'today'`; everything below it renders that one
  `projection`. Don't mix nominal and today's figures on screen. `viewMoney(amount, month)` converts
  single values (extra markers, baseline balances).
- **`save(keepExample)`**: plan edits clear `state.isExample`; view-only changes (money switch,
  inflation, baseline) pass `true`.
- Chart re-render on resize watches **width only** — reacting to height would feed the
  `ResizeObserver` its own output.
