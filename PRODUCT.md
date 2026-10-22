# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

The owner plus friends and family, reached by a shared public link. They are planning their own
savings or retirement, not finance professionals: they know roughly what they earn, save, and expect
to earn on it, and want to see where that leads. Some will have no prior exposure to terms like APR
or compounding frequency.

## Product Purpose

Answer "where will I end up?" for a life plan that changes over time. The user describes their plan
as sequential phases (save hard, slow down, stop contributing, a downturn) plus lump sums, and gets a
believable final balance, how much of it they paid in versus how much grew, and what that balance
could sustain as retirement income.

Success is a person leaving with a number they trust and a sense of which levers move it. Three jobs
carry the product:

- **Where will I end up:** a final balance for a multi-phase plan.
- **Compare scenarios:** tweak rates, contributions, lengths, and extras and see how much each matters.
- **Retirement spending check:** translate the end balance into a sustainable monthly income (the 4% rule line).

## Positioning

Most compound-interest calculators model one rate and one contribution for the whole horizon. This
one models **sequential periods**, each starting from the balance the previous one ended on with its
own length, contribution, rate, compounding, and color, plus **extras** (one-off or recurring lump
sums, positive or negative) anchored to absolute months. The chart shows each period as its own
stretch of the curve, and the accounting never lets a lump sum masquerade as growth.

## Operating Context

- Opened from a shared link, used on whatever device the person has; also runs straight from the
  filesystem (`file://`) or `python3 -m http.server`.
- Sessions are exploratory: set up a plan, then adjust inputs repeatedly and watch results update live.
- Setup auto-saves to `localStorage` per browser; there are no accounts, no sync, and no sharing of a
  specific scenario. **Start from the example** (formerly Reset) restores an example
  projection, with Undo.

## Capabilities and Constraints

- Inputs: starting amount; inflation rate (default 2.5%); seasons (length in years or months, Save
  with a monthly amount, or Withdraw in today's dollars rising with inflation, either a fixed
  monthly amount or the 4% rule by default: 4% of what the season starts with in its first year,
  then raised with inflation each year, never 4% of whatever is left; nominal annual rate,
  compounding daily/monthly/yearly, color slot); extras (name, amount, when, optional repeat every
  N years or months until a point or the end). Every time field has its own years/months picker;
  the plan itself is always stored in months.
- Outputs: for a saving plan, the final amount and monthly income under the 4% rule; once any
  season withdraws, a "Will it last?" answer ("Lasts through Retirement" / "Runs out 6y 3m into
  Retirement") with the ending balance, total withdrawn, and one sentence on what would change it (how much more could be
  withdrawn, or how much less / how much more starting money would make it last). Always: total
  paid in (never negative; in today's dollars it also shows the as-typed sum, owner's choice;
  planned expenses reported separately), growth, a per-season
  colored balance chart with shape-coded extra markers, and a per-season breakdown table with a
  starting-amount row.
- Money: shown in today's dollars by default (2.5% inflation, editable), switchable to future
  dollars. Growth in today's dollars is real growth.
- Running out: withdrawals stop at what is there; the page reports when the money runs out, how
  much went unpaid ("Short by $X"), and names a planned expense if it caused it. A dip below zero
  that recovers is reported separately. Inflation is a plan setting (owner's choice), under the
  starting amount.
- The example plan ("Saving", "Letting it grow", "Retirement" on the 4% rule) lasts, so first-time
  visitors see the "will it last?" question answered. Running out is anchored to the season ("Runs
  out 6y 3m into Retirement"); the owner chose not to ask for an age.
- Comparing scenarios: "Keep as baseline" stores the current plan; a ghost line and a difference
  show how later edits compare. One baseline at a time; shareable links are still undecided.
- Math: monthly simulation, contribution at month end; negative rates allowed; 1200-month (100-year)
  cap; effective annual yield shown per period. Details in README.md and CLAUDE.md.
- **Currency is USD only** with en-US formatting; no localization is planned.
- **Will be hosted publicly** (deploy target not yet chosen). It must keep working as a static site
  with no build step, no dependencies, and under `file://`.
- Terminology: the UI says "seasons" for the phases of a plan (matching the product name); the code
  still says `periods`. The UI says "extras"/"extra amounts"; the code says `windfalls`.
- Return hint (owner-approved wording): "The S&P 500 has averaged about 10% a year before inflation
  since the 1920s (about 7% after); a mix with bonds usually earns less. Past returns don't
  guarantee future ones." The 2.5% default inflation rate is likewise an assumption, not advice.
- Undecided: hosting target, whether to add a disclaimer, page metadata/sharing previews, and
  shareable scenario links.

## Brand Commitments

- Name: **Seasons**, chosen by the owner: each period is a season of a financial life. Tagline:
  "Investment projections for a plan that changes over time." The plain description
  "Investment projection calculator" stays in the browser tab title and meta description so the
  page is findable and shared links explain themselves.
- Voice: plain, explanatory, honest about limits. Hints explain mechanics in one sentence ("Each
  period picks up where the previous one ended."); the 4% rule is framed as a rough guide with its
  sources (Bengen 1994, Trinity study 1998), not advice.
- Color means *which period* and nothing else; extras are distinguished by shape. Period colors come
  from a fixed colorblind-validated palette owned by `js/chart.js`.

## Evidence on Hand

- The working app (`index.html`, `js/`, `styles.css`) and its example projection (what "Start from the example" loads).
- Math tests in `js/calc.test.js`, run via `tests.html`.
- No testimonials, users counts, or endorsements exist; do not invent any. No logo exists.

## Product Principles

1. **Trust over flash.** Every number must reconcile (paid in + growth = balance); never blur
   contributions, extras, and growth.
2. **The plan is a sequence.** Periods and extras are the core model; features should strengthen
   multi-phase planning rather than flatten it back to one rate.
3. **Live and forgiving.** Results update as you type, nothing is lost on reload, and editing never
   destroys what the user was doing.
4. **Readable by non-experts.** Explain mechanics in plain words and frame rules of thumb as guides,
   not financial advice.
5. **Small and self-contained.** Static, dependency-free, works offline from a file.

## Accessibility & Inclusion

Series colors are validated for colorblindness in both light and dark themes, and extras use shape
rather than hue so the chart reads in greyscale. Light, dark, and system themes are supported. No
formal WCAG level has been set.
