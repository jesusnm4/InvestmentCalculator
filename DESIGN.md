---
name: Seasons
description: A quiet field notebook for sequential-period investment projections.
colors:
  paper: "#f9f9f7"
  leaf: "#fcfcfb"
  field-white: "#ffffff"
  graphite: "#0b0b0b"
  pencil: "#52514e"
  faded-pencil: "#6e6c66"
  ruled-line: "#e1e0d9"
  field-edge: "#8f8d86"
  axis-grey: "#c3c2b7"
  ledger-blue: "#2a78d6"
  ledger-blue-deep: "#256abc"
  gain-green: "#006300"
  loss-red: "#d03b3b"
  night-paper: "#0d0d0d"
  night-leaf: "#1a1a19"
  night-faded-pencil: "#898781"
  night-field: "#131312"
  night-ruled-line: "#2c2c2a"
  night-field-edge: "#6a6964"
  night-axis: "#383835"
  night-ledger-blue: "#3987e5"
  night-gain-green: "#0ca30c"
  night-loss-red: "#e66767"
  series-blue: "#2a78d6"
  series-orange: "#e96632"
  series-aqua: "#00a26e"
  series-yellow: "#af6600"
  series-magenta: "#d66b94"
  series-green: "#008300"
  series-violet: "#4a3aa7"
  series-red: "#e34948"
typography:
  masthead:
    fontFamily: "Source Serif 4, Georgia, Times New Roman, serif"
    fontSize: "30px"
    fontWeight: 600
    lineHeight: 1.1
    letterSpacing: "-0.015em"
  display:
    fontFamily: "Source Serif 4, Georgia, Times New Roman, serif"
    fontSize: "46px"
    fontWeight: 600
    lineHeight: 1.05
    letterSpacing: "-0.015em"
    fontFeature: "lnum, tnum"
  figure:
    fontFamily: "Source Serif 4, Georgia, Times New Roman, serif"
    fontSize: "22px"
    fontWeight: 600
    lineHeight: 1.2
    fontFeature: "lnum, tnum"
  heading:
    fontFamily: "Source Serif 4, Georgia, Times New Roman, serif"
    fontSize: "20px"
    fontWeight: 600
    lineHeight: 1.2
  title:
    fontFamily: "Source Serif 4, Georgia, Times New Roman, serif"
    fontSize: "17px"
    fontWeight: 600
    lineHeight: 1.3
  body:
    fontFamily: "Source Sans 3, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.5
  data:
    fontFamily: "Source Sans 3, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    fontFeature: "tnum"
  note:
    fontFamily: "Source Sans 3, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "Source Sans 3, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "12px"
    fontWeight: 600
    letterSpacing: "0.06em"
rounded:
  dot: "3px"
  sm: "6px"
  md: "8px"
  lg: "10px"
  xl: "12px"
  toggle-segment: "7px"
  toggle-track: "9px"
  focus: "4px"
spacing:
  xs: "6px"
  sm: "8px"
  md: "12px"
  lg: "18px"
  xl: "24px"
components:
  button-primary:
    backgroundColor: "{colors.ledger-blue}"
    textColor: "{colors.field-white}"
    rounded: "{rounded.md}"
    padding: "8px 14px"
    width: "100%"
  button-secondary:
    backgroundColor: "{colors.field-white}"
    textColor: "{colors.graphite}"
    rounded: "{rounded.md}"
    padding: "8px 14px"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.graphite}"
    rounded: "{rounded.md}"
    padding: "8px 14px"
  icon-button:
    backgroundColor: "transparent"
    textColor: "{colors.pencil}"
    rounded: "{rounded.sm}"
    size: "26px"
  input:
    backgroundColor: "{colors.field-white}"
    textColor: "{colors.graphite}"
    rounded: "{rounded.md}"
    padding: "8px 10px"
  panel:
    backgroundColor: "{colors.leaf}"
    rounded: "{rounded.xl}"
    padding: "18px"
  period-card:
    backgroundColor: "{colors.field-white}"
    rounded: "{rounded.lg}"
    padding: "12px"
  kpi-cell:
    padding: "12px 16px"
  period-node:
    rounded: "{rounded.sm}"
    size: "23px"
  result-bar:
    backgroundColor: "{colors.leaf}"
    textColor: "{colors.graphite}"
    padding: "12px 16px"
  toast:
    backgroundColor: "{colors.leaf}"
    textColor: "{colors.graphite}"
    rounded: "{rounded.lg}"
    padding: "8px 8px 8px 14px"
  swatch:
    rounded: "{rounded.sm}"
    size: "22px"
---

# Design System: Seasons

## Overview

**Creative North Star: "The Field Notebook"**

The calculator reads like a carefully kept notebook: warm off-white paper, graphite and pencil-grey
text, hairline ruled lines, and one hand-drawn curve that carries nearly all of the color. Each
period is a different ink on that curve. Everything around the chart is calm, precise and unshowy.
It is there to record the plan and report the numbers, never to compete with them.

Density is moderate and work-focused. A fixed-width column on the left holds the plan, written as a
timeline: a ruled spine with each period hanging off a numbered node in its own ink. The results
column on the right puts the final amount first, then a ruled row of three supporting figures
(paid in, growth, monthly income), the chart with each period's stretch labeled above it, and the
ledger-style breakdown. Type pairs a serif for the answers (figures and headings, like ink in a
ledger) with a quiet sans for the working parts, on a role scale of nine sizes. The one large number
on the page is the final amount.

Dark mode is the same notebook read by lamplight: the same roles and the same hues, re-stepped for a
near-black page. It is never a separate look.

**Key Characteristics:**
- Warm neutral paper surfaces; color is reserved for data and the single action accent.
- The plan reads as a sequence: a timeline spine down the setup column, labeled stretches on the chart.
- Color encodes *which period*; shape encodes *which extra*. Neither channel is borrowed for decoration.
- Soft-edged, quiet controls with hairline borders and almost no shadow.
- Serif figures with tabular numerals wherever money answers the question.
- One display-size number per screen: the final amount.

## Colors

Paper-and-graphite neutrals with a warm cast. A single ledger blue for actions, and an eight-ink
categorical palette that belongs to the chart.

### Primary
- **Ledger Blue** (`ledger-blue`; dark: `night-ledger-blue`): the one interface accent. It fills the
  primary "+ Add period" button (one shade deeper in light mode, mixed 12% toward black, so its white
  label clears AA), draws focus rings, the caret, checkbox ticks and text selection, colors the
  Undo and "See results" actions, and is the fallback period color. It matches series slot 1 on purpose, so the default period and the primary action share an
  ink.

### Neutral
- **Paper** (`paper` / `night-paper`): the page behind everything.
- **Leaf** (`leaf` / `night-leaf`): panels, extra cards, the chart tooltip. One step
  lifted from Paper.
- **Field White** (`field-white` / `night-field`): inputs, period and extra cards, the pressed theme
  button. Where you write or read a figure. In dark mode this sits *below* Leaf, as a recessed well.
- **Graphite** (`graphite`; white in dark): primary text and figures.
- **Pencil** (`pencil`): secondary text, field labels, section headers, table headers, legend text.
- **Faded Pencil** (`faded-pencil` / `night-faded-pencil`): hints, notes, affixes, axis labels,
  period ranges, empty states. Light mode uses the deeper value so 11–12px text clears 4.5:1 on every
  paper surface.
- **Ruled Line** (`ruled-line` / `night-ruled-line`): every hairline border, divider and grid line,
  except a field's own edge.
- **Field Edge** (`field-edge` / `night-field-edge`, CSS `--field-line`): the border of inputs, selects
  and segmented tracks, at 3:1 against what they sit on, so a field reads as a field.
- **Axis Grey** (`axis-grey` / `night-axis`): chart axes and the hover border on controls. One step
  firmer than a ruled line.

### Semantic
- **Gain Green** (`gain-green` / `night-gain-green`) and **Loss Red** (`loss-red` / `night-loss-red`):
  the sign of a growth figure in KPIs and the table. Loss Red also marks warnings and the hover state
  of delete buttons. They are never used as fills.

### Series palette (owned by `js/chart.js`)
Blue, Orange, Aqua, Yellow, Magenta, Green, Violet and Red (`series-*`). These eight hues are
validated to stay distinguishable under colorblindness in both themes, and every line clears 3:1
against the card (light orange, aqua, yellow and magenta are stepped darker for it; yellow to an
ochre, so it stays apart from orange under deuteranopia). The frontmatter lists the
light values; the dark column in `PALETTE.dark` is the same hues re-stepped. `js/chart.js` is the
normative source; this file only mirrors it.

### Named Rules
**The One Meaning Rule.** Hue on the chart, legend, swatches and table dots means *which period*
and nothing else. Extras are told apart by shape (circle, square, triangle, diamond) drawn in
neutral pencil tones, never by a palette color.

**The Palette Lives in JS Rule.** No series hex is ever written in `styles.css` or markup. Every
series color is read through `Chart.colorFor(slot)`, and periods store a slot index, never a hex.

**The Readable Ink Rule.** A figure set on a series fill (the period node number) takes white or
graphite per slot, whichever contrasts more, via `Chart.inkOn(slot)`. Never hardcode white on a
palette hue: yellow, aqua and magenta fail with it.

**The Ink Is for Data Rule.** Outside the chart and its keys, the only saturated color is Ledger
Blue on the primary action and focus. Gain and loss colors tint text only.

## Typography

**Figure & Heading Font:** Source Serif 4 (with Georgia, Times New Roman, serif)
**Interface Font:** Source Sans 3 (with system-ui, -apple-system, Segoe UI, sans-serif)

**Character:** One Adobe superfamily, two voices. The serif is the ink in the ledger: every money
figure and every heading is set in it, with lining, tabular numerals, so the answers read as
written-down results. The sans does the work around them: labels, inputs, notes, the table. Both are
variable fonts, self-hosted as latin subsets in `fonts/` (SIL Open Font License, `fonts/OFL.txt`),
preloaded, and swapped in with `font-display: swap`, so the page works offline and over `file://`.

### Hierarchy
Sizes are role tokens in `styles.css` (`--text-*`); nothing sets a raw size.
- **Display** (serif 600, 46px, 1.05, -0.015em): the final amount only.
- **Figure** (serif 600, 22px): the summary figures and the pinned result bar. The tooltip balance
  uses the serif at title size.
- **Masthead** (serif 600, 30px, 1.1, -0.015em): the name "Seasons", only.
- **Heading** (serif 600, 20px): panel titles ("Your plan").
- **Title** (serif 600, 17px): section heads ("Periods", "Extra amounts") and the chart title.
- **Body** (sans 400, 15px, 1.5): inputs, buttons, running text, the 4% lede. Inputs go to 16px on
  touch screens so iOS does not zoom on focus.
- **Data** (sans 400, 14px, tabular): table cells, input affixes, the years/months pickers.
- **Note** (sans 400, 13px): field labels (Pencil), hints, period ranges, card notes, legend,
  tooltip, the 4% caveat (all Faded Pencil unless noted).
- **Label** (sans 600, 12px, 0.06em, uppercase): the hero label, summary labels, table headers, the
  result bar label. Also the chart's axis and stretch labels (sentence case, 12px).

### Named Rules
**The Ledger Ink Rule.** Money that answers the user's question (final amount, summary figures,
result bar, tooltip balance) is set in the serif with lining tabular numerals. Money in the table
and the inputs stays in the sans: those are working figures, not answers.

**The Tabular Figures Rule.** Every money, percentage or time figure that sits near another figure
uses tabular numerals: inputs, figures, table cells, tooltips, axis labels. Free-text inputs turn it
back off.

**The One Big Number Rule.** Only the final amount is set at display size. If another figure seems
to need it, it belongs in the summary row at figure size.

**The Today's Money Rule.** Amounts are shown in today's dollars by default (2.5% inflation,
editable), with a Today's $ / Future $ switch beside the final amount. The math stays nominal;
`Calc.inTodaysDollars` restates a projection so every figure, the chart and the table move together,
and the accounting still reconciles. Growth in today's dollars is labeled "Growth after inflation".

**The No Green Shortfall Rule.** Once a withdrawal can't be paid, the money has run
out: the hero says so in one Loss Red sentence ("Runs out 6y 3m into Retirement", then "About
$1,750 a month unpaid for 16y 10m" beneath: per month, not one unpicturable lifetime lump), the chart marks it with the grey wash, and nothing about that plan's growth is tinted
green. Only withdrawals run out. A saving plan that a planned expense leaves below zero ends in
debt and is said like a dip: "Ends $31,678 below zero, after New house", with the Loss Red
below-zero wash ("Below zero from here"). Any borrowing adds "after interest on the borrowed
amount" under growth.

**The Whole Dollars Rule.** Projections are estimates, so every figure on screen rounds to whole
dollars. Cents imply a precision the model does not have.

**The Role Token Rule.** A new text element picks one of the nine `--text-*` roles. If none fits,
the role list changes in DESIGN.md first; no one-off sizes.

## Layout

A two-column grid. The setup column is `minmax(340px, 400px)` and the results column takes the rest
(`minmax(0, 1fr)`), with a 20px gap, inside a 1400px max-width container padded 20px 24px 48px.
At 900px and below it collapses to a single column with 16px padding, setup first, and a result bar
pins the final amount to the bottom of the screen whenever the headline figure is out of view (the
layout pads 96px at the bottom to clear it). The summary row is three equal columns and stacks to
one at 560px and below. On coarse pointers, icon buttons and swatches grow to 44px. At 420px and below, the
two-column field grids inside cards stack to one column, so a unit picker never squeezes the digits. The
breakdown table scrolls horizontally inside its wrapper rather than wrapping its numbers.

Spacing works in small steps: 6px and 8px inside controls and between inline items, 10–12px between
fields and cards, 18px for panel padding and between sections, 20–24px for page gutters. Section
breaks inside the setup panel are a hairline rule with 18px of padding above, not extra whitespace
or a new card.

## Elevation & Depth

Nearly flat. Depth comes from tonal layering (Paper → Leaf → Field White) and hairline borders. The
only shadow is a faint ambient lift on the two panels and the chart tooltip, and it is removed
entirely in dark mode, where tone alone separates the layers.

### Shadow Vocabulary
- **Panel lift** (`box-shadow: 0 1px 2px rgba(11,11,11,0.06), 0 8px 24px rgba(11,11,11,0.05)`): the
  setup and results panels and the chart tooltip. Light theme only.
- **Pressed ring** (`box-shadow: 0 0 0 1px var(--muted)`, plus weight 600; ~5:1 against the track): the selected segment of the theme toggle,
  and inset on swatches. Ring is 10% graphite (light) or 10% white (dark).

### Named Rules
**The Paper Doesn't Float Rule.** Cards inside a panel (period cards, extra cards) never get a
shadow; a hairline border and a tonal step are enough. Shadow is for the panels and for anything
that overlays content (tooltip, toast, result bar), and nothing else.

**The No Card in a Card Rule.** Inside the results panel, summary figures sit in a ruled row, not
in boxes. A new grouping inside a panel uses hairline rules or spacing before it uses a border box.

## Shapes

Gently rounded throughout, with radius scaling to the element's size. Small colored marks (legend
dots, table dots, tooltip dots) are 3px. Icon buttons and swatches are 6px. Inputs, buttons and the
tooltip are 8px. Cards and tiles are 10px. Panels are 12px. The segmented toggle nests 7px inside 9px.
Borders are 1px hairlines in Ruled Line; no card carries a thick colored edge. The timeline spine
is a 1px Axis Grey rule, and the period nodes are 23px squares with a 6px radius, haloed in the
panel color where they cross it. The theme toggle nests a 7px segment inside a 9px track. Empty
states use a dashed hairline. Chart lines are 2px with round
caps and joins, over a vertical gradient fill from 32% to 4% opacity.

## Components

### Buttons
Quiet and soft-edged. They read as part of the page until hovered.
- **Shape:** gently rounded (8px), 1px Ruled Line border, padding 8px 14px, weight 500.
- **Primary:** Ledger Blue fill and border (one shade deeper in light mode) with white text, full
  width. Used once, for "+ Add period".
- **Secondary (`.btn`):** Field White fill with Graphite text, for example "+ Add extra"
  (full width).
- **Text action (`.link-btn`):** no box; 13px Pencil text underlined in Axis Grey at a 3px offset,
  firming to Graphite on hover. Used for "Start from the example" beside the "Your plan" title.
- **Hover / Focus:** the border firms to Axis Grey and the primary brightens by 6%. There is no
  transform and no transition. Focus is a 2px Ledger Blue outline offset by 1px.

### Icon buttons
- 26px square (44px on touch), 6px radius, transparent with a hairline border, holding a drawn
  14px SVG icon (chevron up, chevron down, cross) at a 1.6 stroke in Pencil. On hover the border goes
  to Axis Grey and the icon to Graphite. The danger variant turns border and icon Loss Red on hover
  and sits 6px further from its neighbours. Disabled is 30% opacity.

### Masthead
- Not a toolbar: no bar, fill or border. The name sits on the Paper, aligned to the layout's 1400px
  container. Row one holds the mark, "Seasons" at masthead size, and the theme toggle at the right;
  row two holds the tagline in body-size Faded Pencil, indented 40px to line up under the name. On
  narrow screens the tagline keeps its own row, so the toggle never squeezes it.
- **The mark:** a 28px authored SVG in Pencil ink, a single line that bends twice with a small
  rounded square at each bend: a plan that changes season. It is neutral ink on purpose, never a
  period color.

### Results hero
- Row one: the uppercase label ("Final amount", "Shortfall at the end", or "Will it last?" once any
  season withdraws) and, at the right, the
  money switch (a segmented control: Today's $ / Future $) with a compact inflation field beside it,
  shown only for today's dollars.
- The display figure, then the body-size Faded Pencil sub-line saying the length, the season count and
  which money it is in. For a withdrawing plan the display slot answers in words ("Lasts through
  Retirement", or "Runs out 6y 3m into Retirement" in Loss Red) at 78% of display size, and the
  sub-line gives what is left and the years of withdrawals.
- A Loss Red, 600-weight line when the balance dips below zero without any withdrawing season
  (it says whether it recovers). With withdrawals the answer itself says "Runs out 6y 3m into
  Retirement" and the sub-line gives the plan year; the sub-line is one line of `·`-separated facts.
- The lever: the second thing to read after the answer, one Graphite 16px/500 sentence on what
  would change the outcome (`.lever`, max 62ch). The sub-line above it holds two facts at most; which
  money the page is in sits beside the Today's $ / Future $ switch ("at 2.5% inflation").
- A row of text actions: "Keep as baseline" (then "Keep this instead", undoable), the difference in
  Gain Green / Loss Red followed by "vs baseline ending at $X" in Faded Pencil, and "Clear baseline"
  (undoable). With withdrawals the difference is in time ("Lasts 1y 8m longer than the
  baseline"). What "Keep as baseline" does lives in its tooltip.

### Save / Withdraw
- Each season card's "Each month" field is one visible three-way choice, **Save / Withdraw % /
  Withdraw $**, beside a positive amount with a plain `$` or `%` affix. Direction is a choice, never
  a minus sign, and how to withdraw is never hidden in a unit picker. On a card the pressed segment
  is a Ledger Blue tint (14%) with a 45% ring. The choice always takes its own full-width row with
  the amount on the row below it, the same for all three options at every width.
- Switching never brings in an amount nobody typed: % to $ starts at what the % came to (rounded to
  $10), anything to Save starts at $0, and the switch is announced in the undo toast.
- The note under a withdrawing amount leads with the bold monthly figure in today's money, shows the
  inflation raise in numbers ("≈$585/mo when this season starts, $1,083 by its end"), and sizes it
  against the 4% rule. The first card's returns hint is one line with a "What's typical?" disclosure.

### Phone season rows
- At every width, every season but the one being edited collapses to a single summary row (name,
  then "10 yrs · $500/mo saved · 7% return" in Faded Pencil, a quiet Faded Pencil chevron at the
  right), a 44px target that opens it. An open card closes with "Done" in its head (a word, since a
  chevron would read as "move up") or Escape; focus returns to its row. A season past the limit
  says so in Loss Red in its row; one cut short shows the length it really gets. "Withdraw %" /
  "Withdraw $" set the symbol in bold serif, on one line, so the two never blur. In an
  open card the range line ("20–45 yrs", compact form) shares a row with the reorder and delete
  buttons. Icon-button hover colours apply only under `(hover: hover)`, so a red ✕ never sticks
  under a thumb after a delete.

### Edge states
- A season past the 100-year cap keeps its name and the reason, and hides its inputs (`.capped`).
- A ninth season sharing an earlier hue gets a hollow timeline node (`.color-reused`), a hollow
  legend dot and table dot, and a dashed chart line.
- A withdrawing season cut by the cap: the headline stays "Lasts through Retire"; the sub-line says
  "Retire cut to 10 yrs by the 100-year limit". With two or three withdrawing seasons the lever names
  each one's own figure ("up to 10.8% in Early and 8.6% in Late"), never a percent of a percent.
- Undo toasts say what the undo did when "Undone: <text>" would read backwards ("'Gift' lands once
  again"); a Save switch says "Retirement now saves $0 a month". Money is "today's dollars" everywhere.
- After the foot Done or a Delete on touch, the row that keeps focus is scrolled instantly to the
  middle of the screen (a smooth scroll is cancelled by the re-render; the top toast would cover it). On first
  load the desktop chart is sized so the whole results column fits above the fold (down to 220px).
- Monthly or quarterly extras show at most 12 markers (other repeats 24); the key counts them all.
- When withdrawals outrun the money, they stop at what was there: the hero says how much a month went unpaid and for how
  long (the lifetime total stays in "How it adds up"), the table's balance cell shows $0 with a Loss Red "short $X" line, and nothing goes negative.
- On wide screens the pinned result is a compact floating card at the bottom right, with the undo
  toast above it, inset to the results panel's inner edge (never over the plan). The toast hides on
  the next edit or a tap on the bar, since its message would be stale. On phones the bar uses a short
  form ("Runs out · 8y 3m in") and drops its label at 420px and below so it stays one line; the toast
  moves to the top, full width, clamped to two lines.
- Every figure leads in the page's money (owner's choice): "Paid in, in today's money" shows
  "$63,111" with "you put in $70,000" beneath; table cells read "$53,111" with "of $60,000 put in".
  Paid in is the starting amount plus savings, the same as the table's column; extras get their own
  line ("plus $67,463 from extras"), as do planned expenses. Extras are typed in today's dollars and rise
  with prices, like withdrawals, so an expense lever is one number; only an extra set to "Stays the same"
  gets today's worth in brackets. Each extra offers the choice as two radios ("Rises with prices" /
  "Stays the same"), not an opt-out checkbox. A plan that ends in debt shows no green growth, and its
  third figure becomes "Owed at the end".
- On phones (560px and below) the answer follows its label directly; the Today's $ / Future $
  switch moves below the lever, and the three figures become compact rows (label left, figure
  right, note beneath). The bar's run-out form names the season ("Runs out in Retirement").
  Season names longer than 24 characters are cut at a word with "…" in the headline, bar and
  chart label. The Withdrawn note after a run-out says how much time it fully paid for ("fully paid
  for the first 7 yrs of 25"); with several withdrawing seasons the note names the first one's monthly
  amount ("$748/month in Early"); the shortfall is said once, in the sub-line.
- The results column is pinned only while it fits the window. "About these numbers" lives in the
  breakdown panel, not the pinned column, and on desktop the chart gives up height (320px down to
  220px) so the column fits a laptop window; only past that does it unpin and scroll.
- "Copy link" is a quiet text action beside "Undo" and "Start from the example" in the plan's head;
  it confirms in the toast ("Link copied… nothing is uploaded"), or, where the clipboard is off
  limits, puts the link in the address bar and says so. A shared plan is shown without being
  saved; a persistent line in the plan's head says so, with "Back to your own plan". The first edit (or "Start from the
  example")
  saves it and keeps your old plan aside (`-own` key), with "Back to your own plan" / "Forget my old
  plan" until you choose.
- Shared-link wording is only ever true: a first-time visitor (no saved plan, or only the
  untouched example) reads "Edit anything to make it yours" with no Back button; otherwise "Your
  own plan is kept aside". "Back to your own plan" and "Forget my old plan" are undoable, and so is
  adding an extra.
- "(the 4% rule)" is said only at 4%; another percent reads "(the 4% rule's method, at 5%)". Card
  notes give the starting balance in the page's money. The run-out label goes into the empty wash
  on the right, falling back to a short "Runs out" before it would sit over the curve.
- The chart is a Tab stop (2px Ledger Blue focus ring, 4px offset): ← / → step the readout a year,
  Shift a month, Home / End jump, Esc hides it; the readout is a polite live region.
- A return below -50% or above 30% also shows in the collapsed row ("· is that a typo?", Loss Red),
  and turns off the save-more lever. Growth past 1,000% reads "38× what you paid in".
- Placeholders use Faded Pencil (`input::placeholder`), never the browser's grey. The pinned result
  bar's run-out reads in Loss Red, like the headline. A repeating extra's markers get no drop lines
  (a row of them reads as a picket fence); one-offs keep theirs.
- On desktop the toast takes the lowest spot over the results column where it covers no text
  (chart labels and keys, figures, the breakdown title, the floating card); `placeToast`, re-checked
  on scroll.
- A return that looks like a typo mutes the headline (Faded Pencil) and replaces the lever with
  "'Crash' has a −150% yearly return: is that a typo? The answer above assumes it."
- In Future $, lever amounts are in the season's first-year dollars, tagged right after the figure
  ("$420/month instead of $1,154/month (first-year dollars, rising with prices)"), never mixed with
  today's.
- Screen readers: the chart is a named group (`aria-roledescription="chart"`), each summary figure a
  labelled group, and the spoken result reuses the headline's words. A link that can't be read says
  so and changes nothing. Undoing a delete says "'Letting it grow' is back".
- An open season card has Done at its head and, at its foot, "Delete season" (Loss Red text link)
  on the left and Done on the right, so Delete is never the next Tab stop or a thumb-slip from Done.
  After a delete, focus lands on the next season's row (or "+ Add a season").
- After an undo the toast says "Undone: …" with no button; older entries stay on the Undo link and
  Cmd/Ctrl+Z. An entry is dropped once its season is edited by hand, so undoing it can't discard
  that edit. The Repeat toast and the extra's note share one count and total (`extraTally`).
- Selected segments are marked by a Faded Pencil ring and weight 600 in both themes (the fill alone
  is ~1.05:1); the in-card Save / Withdraw choice gets a 1.5px Ledger Blue ring.
- Native selects in a card (anchor, compounding) are drawn like the unit picker (`.select-wrap`:
  appearance none, the same chevron, 44px on touch).
- A return below -50% or above 30% gets a Loss Red "is that a typo?" note; a plan with negative
  growth gets no "save more" lever, and a starting-amount lever past $100M is left out. Lasting
  with under 5% to spare says "It only just lasts". "Keep this instead" hides until something
  changes. A season past the cap is one "Past the 100-year limit" row in the table. The x-axis gets
  an end tick ("45y") when the last round tick falls short. The result bar shows only while
  no part of the results is in view. The undo toast's "(3 to undo)" count is hidden from screen
  readers; undoing a Save/Withdraw switch keeps that card open. A season the 100-year cap shortened
  gets no "you could withdraw more" lever. Extra markers past a run-out are not drawn.
- A season added after a withdrawing one starts as a plain 10-year saving season at $0 (not a copy).
- Ticking Repeat says what it multiplies to ("now repeats every 1 yr: 30 payments, $600,000 in
  total") and offers Undo.
- An extra's "At" is labelled "At, counted from the start of" and its select lists plain season names
  (never cut mid-word), beside the offset. The first season's entry is the plan-start clock under
  that season's name. Rises with prices / Stays the same comes before Repeat (it belongs to the
  amount, not to the fields Repeat reveals). Every field note is tied to its input with
  `aria-describedby` (flow note, rate note, an extra's note). Anchored, it keeps its place in that season when lengths or order change; offset 0 is
  the season's first month, and the note says it in the season's terms ("Lands in the first month
  of Retirement (20y 1m into the plan)"). Until counts from the same season start ("every 1 yr until 10 yrs into
  Retirement"; a default repeat runs "until the end of" its season). Switching the anchor
  re-expresses the same months rather than moving them. If the season is deleted, the extra keeps its last month, from the plan start. It repeats until the end of the season it lands in (not the whole plan;
  the last season runs to the end); the extras key says "each". A time field under a year shown in years switches to months on render.
- The chart's season-name band is all or nothing: if any name will not fit, the band stays empty and
  the legend names them.

### About these numbers
- One closed disclosure under the chart (`.why` styling) holding today's dollars, saving and
  withdrawing, the baseline and the 4% rule. The 4% sentence no longer repeats the figures above it.

### Desktop layout
- The plan and results columns share their own grid (`.layout-cols`); the breakdown table is a
  separate full-width panel below both. At 901px+ (and 760px+ tall) the results column is
  `position: sticky`, so the answer, figures and chart stay beside whichever season is being edited
  and release where the plan ends. A "Back to your plan" link closes the results for keyboard users.

### Pinned result bar and skip link
- The result bar shows at every width whenever the headline is out of view (desktop too), padded to
  the layout's edge. A "Skip to results" link is the first Tab stop, visible only on focus.
- While anything can be undone, a quiet "Undo" text action sits beside "Start from the example"; the
  undo history outlives the toast.

### One way of saying when
- Every run-out is stated relative to its season: "Runs out 6y 6m into Retirement", with "year 27 of
  the plan" in the sub-line, the same wording on the chart label and in the growth note. An expense
  that caused it is named after it ("…into Retirement, after New roof").

### Expense dips
- A planned expense that takes the balance below zero and later recovers is shown as borrowing,
  not hidden: the chart washes that stretch in Loss Red (7%) with a dashed red $0 line and a
  "$34,048 below zero" label; the warning gives depth and duration; the lever offers the expense
  size that would keep it above zero, in the page's money.

### Summary row sum
- Under the three figures, a "How it adds up" disclosure holds the sum in the page's money
  ("$94,602 paid in + $67,463 extras + $72,096 growth − $232,186 withdrawn = $1,975 left. Then
  $517,814 of withdrawals it couldn't pay."). All negatives use "−".

### Chart after the money runs out
- The season lines stop at $0. The rest of the timeline gets an 8% Faded Pencil wash and a dotted
  pencil line at $0; the Loss Red rule and its label sit at the top of the plot. The tooltip there
  says "Ran out · short by $X". Withdrawals never go below zero, so the only negative balance is
  a planned expense's debt: the chart plots it (the axis extends below $0) inside the Loss Red wash,
  so its depth is visible. A season wholly after a run-out is a faint line in its hue at $0. A
  baseline "Lasts … longer" stays uncoloured while the plan still runs out.

### Baseline ghost line
- A kept earlier version of the plan, drawn on the chart as a 1.5px dashed Faded Pencil line under
  the live curve, with a dashed key in the legend and a "Baseline" line in the tooltip. It is never a
  series color. Stored as nominal month-end balances; shown in the current money.

### Example note
- While the page shows the untouched example, a Pencil note under "Your plan" says so, and "Start from
  the example" is hidden. The first edit removes both states.

### Segmented control
- Shared by the theme toggle and the money switch (`.segmented`).
- A Paper-filled track (9px radius, 2px inset) holding three 26px-tall text segments: Light, Dark,
  Auto. Unpressed segments are Faded Pencil. The pressed segment (`aria-pressed`) takes a Field White
  fill, Graphite text and the 1px pressed ring.

### Inputs / Fields
- **Style:** Field White fill, 1px Ruled Line border, 8px radius, padding 8px 10px, inheriting
  body type with tabular figures.
- **Label:** a caption-size Pencil label set 5px above the input.
- **Affixes:** `$` sits inside on the left and `%` on the right, in Faded Pencil at 13px, and the
  input pads to clear them.
- **Time fields** (length, an extra's at / every / until): a years-or-months picker sits inside the
  right end of the input like an affix, behind a hairline divider. It is a native select with its
  arrow redrawn as a Faded Pencil chevron, 13px Pencil text. Years is the default, and the note under
  a period's length shows the other unit ("= 120 months").
- **No spin arrows** on number inputs (WebKit draws them over the digits); arrow keys still step.
- **Focus:** a 2px Ledger Blue outline. **Warning:** a 13px Loss Red note under the field.

### Cards / Containers
- **Panel:** Leaf, 12px radius, 1px ring border, 18px padding, panel lift. Its heading is a 20px serif
  title in sentence case ("Your plan").
- **Period card (timeline entry):** Field White, 10px radius, 12px padding, hairline border. It
  hangs off the timeline spine at a numbered node (the period color, ink from `Chart.inkOn`). The
  head row holds the semibold name input and the reorder/delete icon buttons. Under it, a 13px
  Faded Pencil range ("From 10 yrs to 20 yrs") places the period on the timeline. Length and
  contribution sit side by side, expected yearly return runs full width, and a "More options"
  disclosure holds compounding, the effective-yield note and the color swatches, with its summary
  restating the current choices in Faded Pencil.
- **Extra card:** like a period card but on Leaf, off the timeline. Its identity is the neutral
  shape glyph at the start of its row, and its note names the period it lands in.
- **Summary row:** three cells between a top and bottom hairline, split by vertical hairlines, no
  boxes. Each stacks an uppercase label, a 22px serif figure tinted for gain or loss, and a 13px
  note. The third cell is the monthly income under the 4% rule.
- **Empty note:** centered Faded Pencil text inside a dashed hairline box with a 10px radius.

### Swatch picker
- A row of 22px squares with a 6px radius, each filled from `Chart.colorFor(slot)` with an inset
  ring. The selected one gets a 2px Graphite border.

### Projection chart (signature component)
- A hand-drawn SVG line and area chart. Each period is its own 2px stroke and gradient fill in its
  palette color, joined end to end. Grid lines are Ruled Line, axes are Axis Grey, and tick labels are
  12px tabular Faded Pencil.
- Extras appear as neutral shape markers on the curve (Leaf fill, Faded Pencil stroke), with a
  dashed vertical drop line.
- Hover shows an Axis Grey crosshair and a 5px dot stroked in the period's color. The tooltip is a
  Leaf card that stacks the month, a 17px serif balance, the period with its color dot and any
  extra landing that month.
- A 30px band above the plot names each period's stretch (an 8px color square plus a 12px Faded
  Pencil name), and a dashed Axis Grey rule rises from each handoff seam into the band. A name that
  would not fit its stretch is omitted, never clipped.
- Below the chart sit the period legend (13px, rounded dots) and a quieter extras key (13px, glyphs,
  above a dashed rule). Last comes the 4% rule note: a 15px lede with bold Graphite figures, and the
  sources and caveat behind an underlined "Why 4%?" disclosure, capped at 70ch.
- Touch scrolls the page through the chart (`touch-action: pan-y`); a tap shows the readout.

### Result bar (narrow screens)
- Pinned to the bottom edge at 900px and below, only while the headline figure is out of view. Leaf
  fill, ring hairline on top, a soft upward lift. An uppercase label, the final amount in the
  serif at 22px, and a Ledger Blue "See results" link that jumps to the results.

### Undo toast
- Destructive or surprising actions (delete a season or extra, add a season that copies the last
  one, Start from the example, clear the baseline) act at once and offer a way back instead of asking
  first. A Leaf card with a ring border and panel lift, centred near the bottom (lifted above the
  result bar when it shows), holding the message and a Ledger Blue "Undo" (44px tall on touch). It
  stays 10 seconds, pauses while hovered or focused, and a newer action replaces it. Cmd/Ctrl+Z takes
  the offer unless you have typed since.

### Breakdown table
- 13px cells padded 8px 10px with Ruled Line row dividers. Headers are uppercase Pencil labels.
  Numeric columns are right-aligned and tabular. Growth is tinted for gain or loss (never once the
  balance is below zero); extras are never tinted, since they are money in, not growth. A negative
  balance is Loss Red. A 10px color dot leads each season name. The starting-amount row is in Pencil
  and the total row is weight 600 with no bottom rule.
- At 560px and below the table stacks: one block per row, each figure beside its column name (from a
  `data-label` on every cell), so no column hides off-screen.

## Do's and Don'ts

### Do:
- **Do** read every series color through `Chart.colorFor(slot)` and store a slot index on the data.
- **Do** distinguish extras by shape glyph in neutral pencil tones.
- **Do** use tabular figures on every number that sits near another number.
- **Do** separate layers with a tonal step plus a 1px Ruled Line border before reaching for a shadow.
- **Do** keep uppercase labels in Pencil at 12px, 600, with 0.06em tracking.
- **Do** set sizes with the `--text-*` role tokens only.
- **Do** define every new neutral as a token in both the light `:root` block and the
  `[data-theme="dark"]` block.
- **Do** draw icons as inline SVG at one stroke weight (1.6 at 14px).
- **Do** make destructive actions undoable with the toast rather than gating them behind a dialog.
- **Do** round on-screen money to whole dollars.

### Don't:
- **Don't** hardcode a series hex in `styles.css` or markup, or use a palette hue for anything other
  than a period.
- **Don't** give extras a color of their own.
- **Don't** set a second figure at display size; only the final amount is 46px.
- **Don't** add a third font family, or load the fonts from a CDN; they ship in `fonts/`.
- **Don't** put shadows on cards nested inside a panel, or any shadow in dark mode.
- **Don't** use Gain Green or Loss Red as background fills; they tint text and borders only.
- **Don't** add a second accent color for interface chrome. Ledger Blue is the only action color.
- **Don't** mark a card with a thick colored edge; a period's color lives on its timeline node.
- **Don't** use unicode glyphs or emoji as icons, or the native `confirm()` dialog.
- **Don't** box figures inside a panel; use a ruled row.
