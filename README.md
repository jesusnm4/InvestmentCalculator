# Seasons

*Investment projections for a plan that changes over time.*

A small static website that projects investment growth across **sequential periods**, the seasons
of a financial life: save hard, slow down, stop contributing, ride out a downturn. You set a
starting amount, then add periods that run one after another, each with its own length, monthly
contribution, expected yearly return, compounding and color. Lump sums ("extras") can land on top,
once or on a schedule. The page tells you where the plan ends up, how much of that is growth, and
what it could pay out each month in retirement.

## Using it

- **Your plan** (left) is a timeline of **seasons**. Each one hangs off a numbered node in its own
  color, says where it sits ("From 10 yrs to 20 yrs"), and picks up where the previous one ended.
  Reorder with the arrows. Compounding, the effective yield and the season's color live under
  **More options**. Until you change something, a note says you're looking at the example plan.
- **Time fields** (a period's length, an extra's timing) each have a **years / months** picker.
  Switching converts the number shown; fractions work (2.5 years is 30 months).
- **Extra amounts** are lump sums on top of the monthly contributions. Use a negative amount for a
  large planned expense, and tick **Repeat** to make one recur. A new extra starts at $0, and each
  one says which season it lands in and, when it repeats, how much it adds in total.
- **Each season saves or withdraws:** **Save**, **Withdraw %** or **Withdraw $**. Withdrawals are
  in today's dollars and rise with inflation each year. **Withdraw %** (default 4%) is the classic 4%
  rule: 4% of what the season starts with in its first year, then raised with inflation, not 4% of
  whatever is left. The card shows what it comes to per month. Switching never brings in an amount
  you didn't type: % to $ starts at what the % came to, and Save starts at $0.
- **Results** (right): for a plan that only saves, the final amount and **monthly income** under the
  4% rule. Once a season withdraws, the headline answers **Will it last?** ("Lasts through Retirement" or
  "Runs out 6y 3m into Retirement") and one sentence says what would change it: how much more you could
  withdraw, or how much less (or how much more starting money) would make it last. Below that: total
  paid in, growth, total withdrawn, the chart (each season's stretch labeled above it, with the
  names in the legend only when they don't fit), and a breakdown table whose columns add up.
- **Today's dollars.** Amounts are shown in today's money by default, at 2.5% inflation (editable).
  Switch to **Future $** to see the raw dollar amounts on the day you reach them.
- **Running out.** If the balance goes below zero, the page says when, the chart marks it, and
  nothing about that plan shows as green growth.
- **Comparing.** **Keep as baseline** saves the current plan as a dashed ghost line; as you change
  things, the page shows the difference and where the baseline ended ("+$7,066 vs baseline ending at
  $114,252"). Replacing a baseline can be undone.
- **Deleting** a season or extra, adding a season (it copies the last one), **Start from the
  example**, and replacing or clearing the baseline all act immediately and offer **Undo**. Undo
  steps back through the last 10 actions; the history stays after the message fades, with an
  **Undo** link beside "Your plan", and Cmd/Ctrl+Z works too.
- **About these numbers** (under the chart) explains today's dollars, saving and withdrawing, the
  baseline and the 4% rule in one place.
- **The answer stays in view**: whenever the headline is scrolled away, a bar pinned to the bottom
  shows it; tap **See results** to jump back. Keyboard users get a **Skip to results** link first.
  On wide screens it's a small card in the corner. When the money runs out, the chart stops at $0 and
  shades the rest instead of plotting debt; a dip below zero that recovers is called out, not
  treated as running out.
- **When the money runs out**, withdrawals stop at what was there: the page says "Short by $X",
  counts only what was actually withdrawn, and names an expense if one caused it ("Runs out at
  5 yrs, when Extra 1 lands", with "An expense of $22,700 or less would make it last"). Plans that
  only save get a lever too ("Saving $100 more a month would add about $56,300").
- **Inflation** is a plan setting under the starting amount ("Prices rise each year").
- **On a desktop**, the answer and chart stay pinned beside whichever season you're editing; the
  breakdown table sits below both columns.
- **On a phone**, seasons you aren't editing collapse to one line ("10 yrs · $500/mo saved · 7%");
  tap one to open it.
- **Paid in matches your maths.** In today's dollars it also shows the sum as typed ("$70,000 as
  typed, worth this today"); planned expenses (negative extras) are reported separately. The breakdown stacks into one block per season.
- Everything auto-saves in your browser (`localStorage`). There are no accounts and nothing is
  sent anywhere.

## Running it

No build step, no dependencies, no Node. Either:

- **Double-click `index.html`**: it works straight off the filesystem, or
- **Serve it** (nicer for reloads):

  ```sh
  python3 -m http.server 8000
  # then open http://localhost:8000
  ```

If the page looks half-updated after a change (an empty chart, buttons that do nothing), the
browser mixed cached old files with new ones. Reload with **Cmd+Shift+R**.

## Tests

**Math:** open **`tests.html`** in a browser. It runs the assertions in `js/calc.test.js` against
`js/calc.js` and prints a PASS/FAIL row for each. All rows should read PASS. `tests.html` is the
source of truth; `CLAUDE.md` also has a one-liner that runs the same suite headless with macOS's
built-in JavaScriptCore.

**In real browsers (optional):** [Playwright](https://playwright.dev/python/) is set up as a
development-only tool for checking the page in Chromium and WebKit (Safari's engine) at exact
device sizes. It lives in a local `.venv/` (git-ignored) and never ships with the site. On a fresh
clone:

```sh
python3 -m venv .venv
.venv/bin/python -m pip install playwright
.venv/bin/python -m playwright install chromium webkit
```

Then, with the site served on port 8000, take screenshots like this:

```sh
# iPhone in Safari's engine, dark mode, whole page
.venv/bin/python -m playwright screenshot --browser webkit --device "iPhone 13" \
  --color-scheme dark --full-page --wait-for-selector ".chart-svg" \
  http://localhost:8000 iphone-dark.png

# Desktop in Chromium
.venv/bin/python -m playwright screenshot --browser chromium --viewport-size "1440,900" \
  --wait-for-selector ".chart-svg" http://localhost:8000 desktop.png
```

Playwright starts from empty storage, so screenshots show the example plan, not yours.

## Files

| File | What it does |
|---|---|
| `index.html` | Page markup |
| `styles.css` | Layout, light/dark tokens and the type scale |
| `js/theme.js` | Resolves light/dark/system and stamps it on `<html>` |
| `js/calc.js` | The projection math (periods, extras): pure functions, no DOM |
| `js/chart.js` | Hand-rolled SVG chart and the color palette |
| `js/app.js` | State, form wiring, `localStorage`, undo, results rendering |
| `tests.html`, `js/calc.test.js` | In-browser test runner |
| `fonts/` | Self-hosted Source Serif 4 and Source Sans 3 (latin, variable; SIL Open Font License) |
| `PRODUCT.md` | Who the site is for, what it must do, and the constraints to keep |
| `DESIGN.md` | The design system: colors, type, components and the rules behind them |
| `.impeccable/` | Machine-readable design tokens and saved design reviews (used by the Impeccable design tooling) |
| `CLAUDE.md` | Architecture and conventions for working on the code |

## How the math works

The return you type is a **nominal annual rate (APR)**; the compounding setting says how many
times a year it is credited. The simulation steps one month at a time, using

```
monthly growth factor = (1 + rate/f) ^ (f/12)     f = 365 | 12 | 1
balance = balance * factor + monthly contribution
```

with the contribution landing at month end (an ordinary annuity). Each card's **More options**
shows the resulting effective annual yield, so you can see what the compounding setting is
actually buying you. Compounding defaults to monthly.

Yearly compounding spreads its annual factor geometrically over the 12 months rather than
crediting it in one lump: it lands on the same value at every year boundary and keeps the curve
smooth.

Seasons (`periods` in the code) run back to back: each one starts from the balance the previous one
ended on. Negative
returns are allowed (useful for modelling a downturn). Total duration caps at 100 years. Lengths
and timings are always stored in months; the years/months picker only changes how a field
displays.

**Extras** are anchored to *absolute* months, so one stays where you put it when periods are
edited or reordered; it simply falls inside whichever period covers that month. Each lands at
month end, like a contribution, and grows from the next month on. A repeating extra recurs every
N years or months, optionally until a given point; leave the end empty and it runs to the end of
the projection. An extra whose first occurrence is past the end of the projection never lands and
says so; later occurrences running off the end are simply ignored. The breakdown gives extras
their own column so they are never mistaken for growth.

**Withdrawals** are entered in today's dollars: a fixed amount `A` is spent as
`A × (1 + inflation)^(month/12)` in month `month`, so it buys the same every month. Under the % rule,
the first month is `percent × season start balance / 12`, rising with inflation from there.

**Today's dollars** divide each amount by inflation up to the month it happens:
`today = amount / (1 + inflation)^(month/12)`. Every flow is discounted by its own month, so the
breakdown still adds up, and "growth after inflation" is the plan's real growth (it can be negative
even when the dollar balance rises). The month the balance first goes below zero is reported as the
month the money runs out.

The **4% rule** behind the monthly income figure takes 4% of the final balance in the first year,
split across 12 months. It is a retirement rule of thumb (Bengen, 1994; the Trinity study, 1998),
shown as a rough guide, not a guarantee. The math is `Calc.safeWithdrawal`, which accepts a
different rate in code; the page always uses 4%.

## Design notes

`DESIGN.md` is the full record; the short version:

- **Color means "which period", and nothing else.** Period colors come from a fixed 8-swatch
  palette, pre-validated to stay distinguishable under colorblindness in light and dark mode.
  `js/chart.js` is the single source of truth: the swatches, legend, table dots and chart all read
  from it, and CSS never hardcodes a series color.
- **Extras are marked by shape** (circle, square, triangle, diamond), not color, so a marker never
  reads as another period. Shape stays readable in both themes, in greyscale and under
  colorblindness.
- **Type:** Source Serif 4 sets the answers (money figures and headings), Source Sans 3 everything
  else, on a fixed set of named sizes (`--text-*` in `styles.css`). The fonts are bundled, so the
  page works offline.
- **Theme:** the light / dark / auto switch in the masthead is remembered. `js/theme.js` stamps
  `data-theme` on `<html>` before first paint, so there is no flash of the wrong theme.
- **Accessibility:** text meets WCAG AA contrast in both themes, results are announced to screen
  readers once typing settles, focus is kept in place when cards are reordered or deleted, and
  touch screens get larger targets.
