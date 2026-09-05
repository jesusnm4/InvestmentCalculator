# Investment Projection Calculator

A small static website that projects investment growth across **sequential periods**. You set a
starting amount, then add periods that run one after another — each with its own length,
monthly contribution, annual growth rate, compounding frequency, and color. The color shows up
in the growth chart, so each period owns a visible stretch of the curve.

## Running it

No build step, no dependencies, no Node. Either:

- **Double-click `index.html`** — it works straight off the filesystem, or
- **Serve it** (nicer for reloads):

  ```sh
  python3 -m http.server 8000
  # then open http://localhost:8000
  ```

## Tests

Open **`tests.html`** in a browser. It runs the assertions in `js/calc.test.js` against
`js/calc.js` and prints a PASS/FAIL row for each. All rows should read PASS.

## Files

| File | What it does |
|---|---|
| `index.html` | Page markup |
| `styles.css` | Layout and light/dark tokens |
| `js/theme.js` | Resolves light/dark/system and stamps it on `<html>` |
| `js/calc.js` | The projection math — pure functions, no DOM |
| `js/chart.js` | Hand-rolled SVG chart + the color palette |
| `js/app.js` | State, form wiring, `localStorage`, results rendering |
| `tests.html`, `js/calc.test.js` | In-browser test runner |

## How the math works

The rate you type is a **nominal annual rate (APR)**; the compounding setting says how many
times a year it is credited. The simulation steps one month at a time, using

```
monthly growth factor = (1 + rate/f) ^ (f/12)     f = 365 | 12 | 1
balance = balance * factor + monthly contribution
```

with the contribution landing at month end (an ordinary annuity). Each card shows the resulting
**effective annual yield** so you can see what the compounding setting is actually buying you.

Yearly compounding spreads its annual factor geometrically over the 12 months rather than
crediting it in one lump — it lands on the same value at every year boundary and keeps the
curve smooth.

Periods run back to back: each one starts from the balance the previous one ended on. Negative
rates are allowed (useful for modelling a downturn). Total duration caps at 100 years.

Under the chart, a line applies the **4% rule** to the final balance: 4% of it in the first year,
split across 12 months. It is a retirement rule of thumb (Bengen, 1994; the Trinity study, 1998),
shown as a rough guide — the math is `Calc.safeWithdrawal`, and the rate is overridable.

## Notes

- Your setup auto-saves to `localStorage`; **Reset** restores the example projection.
- Period colors come from a fixed 8-swatch palette rather than a free color picker — the eight
  hues are pre-validated to stay distinguishable under colorblindness in both light and dark
  mode. `js/chart.js` is the single source of truth for them; the swatches, the legend, the
  table dots, and the chart all read from there.
- The top bar has a light / dark / system theme toggle; the choice is remembered.
  `js/theme.js` resolves it and stamps `data-theme` on `<html>` before first paint, so there
  is no flash of the wrong theme on load.
