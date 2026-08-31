# Decoration pricing — 2026 (Anchorfish)

**The database is the store of record for live prices. This file is the record of
what we decided and why.**

That distinction is the reason this file exists. For three sessions the 2026
prices lived only as constants inside `tools/reprice-anchorfish-2026.js`, which
prints them and exits. They were discussed as though they were live while the
storefront was still quoting the old numbers, because nobody had run `--apply`.
A price you cannot look up is a price nobody can check.

## How to regenerate this file

```sh
node tools/reprice-anchorfish-2026.js | sed '/UPDATE statements/,$d'
```

The tables below are that command's output verbatim. If you change a cost or a
markup in the tool, re-run it and paste the result here in the same commit —
otherwise this file becomes a second, wrong source of truth, which is worse than
having none.

## How to apply them to the live store

```sh
railway variables --service MySQL --json | node tools/reprice-anchorfish-2026.js            # dry run
railway variables --service MySQL --json | node tools/reprice-anchorfish-2026.js --apply    # writes
```

`--apply` snapshots `lumise_printings` to `~/jtees-backups/` first and aborts if
that snapshot fails. Restoring the `calculate` column from that TSV is the only
undo.

### The ordering rule

**Do not set `JT_SCREEN_FEES=1` before the tables are repriced.** The old tables
carried the screen charge amortised into the per-piece rate. Turning the fee on
first bills every screen twice. Reprice, confirm 1 colour at 50–99 reads `$3.85`
and not `$8.45`, then set the flag.

The reverse window is real too and points the other way: between the reprice and
the flag, screen print is *under*charged, because the tables no longer carry
screens and the fee is not yet on. Do the two steps back to back.

## The tables

```
DIGITIZING — charged at the vendor rate: $30 to 15k stitches, +$5 per extra 1k.

  id   was      now      title
  ----------------------------------------------------------------------------
  12   $25     $30      DST Digitizing — one-time (to 15k stitches)
  15   $25     $30      DST Digitizing — one-time, Small/Medium (to 15k stitches)
  16   $45     $45      DST Digitizing — one-time, Large Logo (to 18k stitches)
  17   $65     $80      DST Digitizing — one-time, Full Back (to 25k stitches)

  One-time charge per design, not per piece — waived if the customer supplies a usable DST/EMB file. Add as its own line, quantity 1.


EMBROIDERY RUN RATES — sewn in house.
Chest logo $20.00, full back $75.00, sizes between fitted on the vendor sheet.
Tapers to the anchors at 100+, lifted below that so embroidery is never
cheaper than DTF on a small run.

  id   item                 1-11      12-24      25-49      50-74      75-99    100-149   150-1000
  --------------------------------------------------------------------------------------------------
    8  Small Logo (     $30.00     $28.00     $25.00     $22.00     $21.00     $20.00
    9  Medium Logo      $41.00     $39.00     $36.00     $33.00     $32.00     $31.00
   10  Large Logo (     $52.00     $50.00     $47.00     $44.00     $43.00     $42.00
   11  Full Back (≤     $85.00     $83.00     $80.00     $77.00     $76.00     $75.00

  NAMES & TEXT — own bands, shallow taper. Each name is a separate setup.
  id   item                  1-5       6-11      12-24      25-49      50-74      75-99   100-1000
  --------------------------------------------------------------------------------------------------
    7  Name/Text (c     $20.00     $18.00     $16.00     $14.00     $13.00     $12.50     $12.00
  NEW  Name/Text (u     $50.00     $45.00     $40.00     $35.00     $32.50     $31.25     $30.00
  NEW  Extra Large      $60.00     $60.00     $60.00     $60.00     $60.00     $60.00     $60.00

  Fitted from your two prices: $20.00 chest -> $75.00 full back, x5.50 on cost.
    by stitch band:         0-8k $20      8k-10k $31     10k-14k $42     14k-18k $53     20k-22k $64     22k-25k $75


SCREEN PRINT — Anchorfish 2026, print only. Screens are NOT in these rates:
they bill once per order at $35/screen (cost $20), screens = (colours + 1 on darks) x locations.
50-piece minimum: the old bands started at 12, which contradicted it.

  id   colours         50-99    100-249    250-499    500-999  1000-2499  2500-7000
  -----------------------------------------------------------------------------------
    2  1 colour          $3.85      $3.45      $3.05      $2.70      $2.40      $2.00
    3  2 colour          $4.80      $4.35      $3.80      $3.35      $2.95      $2.55
    4  3 colour          $5.80      $5.30      $4.75      $4.35      $3.90      $3.50
    5  4 colour          $6.80      $6.30      $5.70      $5.30      $4.85      $4.45
    6  5 colour          $7.80      $7.30      $6.70      $6.25      $5.80      $5.40
  NEW  6 colour          $8.80      $8.25      $7.65      $7.20      $6.75      $6.35
  NEW  7 colour          $9.80      $9.25      $8.60      $8.15      $7.70      $7.30

  The same prices are also written to the combined "Screen Printing" method,
  as columns 1-color..6-color plus a full-color backstop, so the editor can
  price from the design's own colour count.


DTF — method #1 "Printing", the only ACTIVE method, so this is live on the store.
Stage 1 is the main print (132 sq in), stage 2 an additional location.
Live bands stopped at 175, so every larger order quoted at the 175 rate.

  stage                  1-11      12-24      25-49      50-99    100-249    250-499    500-999  1000-2499  2500-7000
  ---------------------------------------------------------------------------------------------------------------------
  main print           $26.05     $20.30     $15.75     $11.90      $9.50      $7.55      $6.10      $4.90      $4.00
  add. location         $6.70      $6.50      $5.25      $4.95      $4.20      $3.50      $3.10      $2.75      $2.55

  Every stitch count from 0 to 25k now has a price. The 14k-22k band is flat $60,
  which also covers the 18k-20k gap Anchorfish leaves unpriced on their own sheet.
  Above 25k stitches there is still no rate — Anchorfish quotes those separately.


```

## Is $3.85 profitable once screens are billed separately?

Yes. The markup **is** the margin on the print itself, because screens are no
longer inside it: `1 - 1/2.13 = 53.2%`, and the curve settles to about 50.5% at
volume where competition is hardest.

**Repriced 2026-08-30**, from an anchor of $4.25 (markups 2.34→2.13 and down the
curve by the same factor). The old anchor put a 100-piece two-location job at
$14.64 a piece — the top of what this trade quotes for one colour on a Gildan
5000 — and the second location is *already* charged at the full rate, because
Anchorfish gives no shared-setup discount. Carrying a premium markup on top of
that priced the shop out of exactly the two-sided work it wants.

Print line, per piece, 1 colour:

| band | Anchorfish cost | we sell | gross | margin |
| --- | --- | --- | --- | --- |
| 50–99 | $1.80 | $3.85 | $2.05 | 53.2% |
| 100–249 | $1.65 | $3.45 | $1.80 | 52.2% |
| 250–499 | $1.47 | $3.05 | $1.58 | 51.8% |
| 500–999 | $1.32 | $2.70 | $1.38 | 51.1% |
| 1000–2499 | $1.17 | $2.40 | $1.23 | 51.2% |
| 2500–7000 | $0.99 | $2.00 | $1.01 | 50.5% |

The screen add-on is the **thinnest margin in the system by a distance**: bill
$25, cost $20, so $5 a screen at **20%**. It is close enough to cost to be near
pass-through, and that is deliberate — the setup charge is the line a customer
compares first, and it is what makes a small run look expensive.

**Cut from $35 to $25 on 2026-08-30.** Where it costs is many-colour work, because
the screen count scales with colours *and* locations: a 7-colour two-location dark
job burns 16 screens, so the cut is **$160 on that one job** and takes it to 39%
margin — the lowest any job shape reaches. On the shop's ordinary work it is $20
to $60 a job. If screen-heavy orders become common, **raise this before touching
the print table**: 16 screens move a total far faster than a per-piece rate does.

Whole job, decoration only — the blank is a separate line with its own markup:

| job | revenue | cost | profit | margin |
| --- | --- | --- | --- | --- |
| 50pc, 1 colour, 1 location, white (the minimum job) | $227.50 | $110.00 | $117.50 | 51.6% |
| 50pc, 1 colour, 1 location, dark | $262.50 | $130.00 | $132.50 | 50.5% |
| 50pc, 1 colour, 2 locations, dark | $525.00 | $260.00 | $265.00 | 50.5% |
| 50pc, 5 colours, 2 locations, dark (worst case — 12 screens) | $1,080.00 | $606.00 | $474.00 | 43.9% |
| 100pc, 1 colour, 2 locations, dark | $830.00 | $410.00 | $420.00 | 50.6% |
| 500pc, 1 colour, 2 locations, dark | $2,840.00 | $1,400.00 | $1,440.00 | 50.7% |

**What this margin does NOT include.** It is gross margin against the Anchorfish
invoice and nothing else. Still to come out of it: the blank, art and setup
labour, inbound freight, and card fees (~2.9% + $0.30). Treat 49–52% as the
ceiling, not the take.

**Where the fee could go.** $25 → 20%, $28 → 28.6%, $30 → 33.3%, $35 → 42.9%.
The rate lives in `ADDONS` in `server.js`, is mirrored in
`tools/reprice-anchorfish-2026.js` for the record, and both are pinned by
`tests/screen-fees.test.js` — including the customer-facing note text, so a stale
price cannot be left sitting next to a live one.

## Why the old table was wrong

Amortising a fixed cost into a per-piece rate makes the rate wrong in both
directions at once. The screens in the old table were spread over an assumed
volume, so relative to billing them once at $35:

| qty | old (screens baked in) | correct | difference on the order |
| --- | --- | --- | --- |
| 50 | $22.54 | $16.94 | customer overcharged $280 |
| 100 | $18.24 | $14.64 | customer overcharged $360 |
| 250 | $13.94 | $12.90 | customer overcharged $260 |
| 500 | $12.54 | $11.92 | customer overcharged $310 |
| 1000 | $10.64 | $10.98 | **shop undercharged $340** |

(2-sided dark garment, 1 colour a side, including the blank at $5.64.)

Small orders subsidised large ones, and past a thousand pieces the shop was
selling below its own intended margin. That sign flip is the argument for the
change, more than the overcharge is.

## Screens: the count, and where it is defined

```
screenCount(colours, locations, dark) = (colours + (dark ? 1 : 0)) * locations
```

Written once, in `quotePricingSource()` in `server.js`, so the fee charged and
the screens ordered from Anchorfish are the same number.

Confirmed against invoice **#16899** — 62 shirts, white on black, two locations,
billed as four screens at $20. That invoice's `Ink: Base, White` line is what
proves the white underbase is its own screen, so **a 1-colour design on a dark
garment is a 2-screen job**. The `underbase` add-on this replaced charged a flat
$25 once, against the $80 of screens that job actually bought.

## The garment

Blanks sell at **cost × 2**, applied to the cheapest core size (S/M/L/XL) by
`tools/ssa-sync.js`. A Gildan 5000 costs $2.82 from S&S and lists at $5.64.

Volume breaks come off that list price, in `BLANK_TIERS` in `server.js`:

| from | off | garment multiple |
| --- | --- | --- |
| 35 | 3% | 1.94× |
| 100 | 5% | 1.90× |
| 250 | 7% | 1.86× |
| 500 | 8% | 1.84× |
| 1,000 | 9% | 1.82× |
| 3,000 | 10% | 1.80× |

**Deepened 2026-08-30, and the 100 and 250 steps added.** The curve previously ran
35 → 2% and then nothing until 500, so a 100-piece and a 250-piece order — the two
commonest sizes in the shop — were discounted the same as a 35-piece one. A flat
stretch across the busiest part of the range is a worse fault than a shallow rate:
it is the orders you quote most often that it fails to move on.

10% at the top is a ceiling, not a round number. It puts the garment at **1.80×
cost**, which is the floor enforced by `quote-blank-pricing.test.js`. The curve
and the guard are now the same number by design, so going deeper means moving
both, on purpose. That floor was tightened to 1.8× on 2026-08-29, away from the
1.60× an earlier curve reached.

**Keep the size of this lever in view.** The garment is about 40% of a decorated
job, so the whole move from 2% to 10% is worth about **17¢ a piece at 100** —
$13.83 → $13.66. If a quote needs to look visibly cheaper, the print table and the
$35 screen fee are where that lives, not here.

**These are FLOORS** (`qty >= min`), the opposite convention to the decoration
tables above, whose keys are band CEILINGS. Read one as the other and every band
lands one step out.

**The first floor moved 125 → 100 → 35 on 2026-08-30.** 100 is the commonest
order size in the shop and it sat one step under the old floor, so the
most-quoted job in the building got no break at all — and the way round it was to
type a garment price over the catalogue by hand on every quote. An override works
once; it is not a price list, it never reaches a margin report, and the next
person quoting the same job invents a different number.

It then went to **35** so the break reaches the small runs. Screen print is not
sold below 50, so 35–49 is DTF, embroidery and HTV — the jobs where the
decoration is dearest per piece and the quote is most likely to be up against a
shop that does not mind a thin garment margin.

Worth being honest about what this is: **there is no supplier break behind any of
it.** The garment costs the same at 50 as at 5,000. Every point here is margin
given away to win the bid, not a saving passed on — which is why the curve is
shallow and why nothing is discounted below 100.

`BLANK_DISCOUNT_MIN_QTY` is derived from the table with `Math.min`. It used to be
a hand-kept `125` sitting beside a table that also said 125 — two copies of one
threshold, and nothing read the constant. Anyone who changed it would have
expected the discount to move, and it would not have.

## Where the margin actually is

Costs for the shop's most common job — 100 pieces, 1 colour, front and back, on
a dark Gildan 5000:

| | | |
| --- | --- | --- |
| Blanks | 100 × $2.82 | $282.00 |
| Printing | 100 × $1.65 × 2 locations | $330.00 |
| Screens | 4 × $20 | $80.00 |
| | | **$692.00** ($6.92/pc) |

The **second location is the constraint, not the markup.** Anchorfish charges the
full rate again for location two — no shared-setup discount — so it adds $1.65/pc
of real cost where a shop printing in-house pays almost nothing for the second
pass. At 100 pieces one location sells at $9.68/pc against $4.87 of cost (49.7%);
two sells at $13.83 against $6.92 (50.0%). On two-sided work this shop is structurally behind an in-house
competitor, and no amount of garment discounting closes that gap: the garment is
only $2.82 of the $6.92.

## Six screens, and the white underbase is one of them

The press runs **six screens in one pass**, base included. So:

| garment | most printed colours |
| --- | --- |
| light | **6** |
| dark | **5** — the white underbase takes a station |

The ceiling is **per pass, not per order**. A two-sided 5-colour job is two
passes of six screens and is fine; a one-sided 6-colour job on a dark garment is
seven on one pass and is not.

Anything over that is a **DTF job**, not a more expensive screen-print job —
there is no price for it because the shop cannot run it.

**The 7-colour column was wrong and was being sold.** Its prices were a straight
+$0.47 extrapolation of the sixth column — invented, not quoted. The generator
now refuses any row past the ceiling rather than pricing it, `full-color` is
priced at the highest *producible* column, and `max_screens` travels in the
method row so every surface reads one definition.

## Which method is cheaper — recomputed 2026-08-30

Screen print moved twice in one day (anchor $4.25 → $3.85, screens $35 → $25), so
every earlier crossover figure is wrong. The old note said *"DTF wins from 5
colours below 500 pieces and 4 at 500+"*. It does not any more.

**`s` = screen print cheaper · `D` = DTF cheaper**, by colour count 1–6. There is
no 7 — see the ceiling above; on a dark garment column 6 is unavailable too.

### One location

| qty | 1 | 2 | 3 | 4 | 5 | 6 | DTF wins from |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 50 | s | s | s | s | s | s | never — DTF only past 6 |
| 100 | s | s | s | s | s | D | 6 colours |
| 250 | s | s | s | s | s | D | 6 colours |
| 500 | s | s | s | s | D | D | 5 colours |
| 1,000 | s | s | s | D | D | D | 4 colours |
| 2,500 | s | s | s | D | D | D | 4 colours |

On a **dark** garment the top column is unavailable — six printed colours plus a
base is seven screens. So at 50 pieces a dark garment goes to DTF at 6 colours
where a light one could still be screen printed. Everywhere else the dark and
light crossovers are the same.

### Two locations

| qty | 1 | 2 | 3 | 4 | 5 | 6 | DTF wins from |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 50–500 | s | s | s | D | D | D | 4 colours |
| 1,000+ | s | s | D | D | D | D | D | 3 colours |

Dark and light are identical here.

### What changed, and why

DTF now wins **earlier at volume** and **later on small runs** than it used to.

- Screen print got cheaper per piece, which pushes the crossover *out* on short
  runs — a 50-piece light garment stays screen print across every column the
  press can run.
- But screens are billed once per order, and at high quantity that fixed cost is
  spread thin while the per-piece gap decides everything. Cutting the screen fee
  to $25 did not save screen printing at 1,000 pieces; the per-piece rate is what
  matters there.
- **Two locations is the sharp one.** Screen print doubles both the rate and the
  screen count, while DTF's second location runs roughly 58% less. Anything
  two-sided above 3 colours belongs on DTF at almost any quantity.

Screens are counted as `(colours + 1 on darks) × locations` at $25 each, the same
rule `screenCount()` uses in `server.js`.

**Regenerate this table** whenever either price table moves — it is derived from
both, so a reprice invalidates it silently.
