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
first bills every screen twice. Reprice, confirm 1 colour at 50–99 reads `$4.25`
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
    2  1 colour          $4.25      $3.80      $3.35      $3.00      $2.60      $2.20
    3  2 colour          $5.30      $4.75      $4.20      $3.70      $3.25      $2.80
    4  3 colour          $6.40      $5.85      $5.25      $4.75      $4.30      $3.80
    5  4 colour          $7.50      $6.90      $6.30      $5.85      $5.35      $4.85
    6  5 colour          $8.60      $8.00      $7.35      $6.90      $6.40      $5.90
  NEW  6 colour          $9.70      $9.10      $8.45      $7.95      $7.45      $6.95
  NEW  7 colour         $10.80     $10.15      $9.50      $9.00      $8.50      $8.00

  The same prices are also written to the combined "Screen Printing" method,
  as columns 1-color..7-color plus a full-color backstop, so the editor can
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

## Is $4.25 profitable once screens are billed separately?

Yes. The markup **is** the margin on the print itself, because screens are no
longer inside it: `1 - 1/2.34 = 57.3%`, and the curve settles to a flat 55% at
volume where competition is hardest.

Print line, per piece, 1 colour:

| band | Anchorfish cost | we sell | gross | margin |
| --- | --- | --- | --- | --- |
| 50–99 | $1.80 | $4.25 | $2.45 | 57.6% |
| 100–249 | $1.65 | $3.80 | $2.15 | 56.6% |
| 250–499 | $1.47 | $3.35 | $1.88 | 56.1% |
| 500–999 | $1.32 | $3.00 | $1.68 | 56.0% |
| 1000–2499 | $1.17 | $2.60 | $1.43 | 55.0% |
| 2500–7000 | $0.99 | $2.20 | $1.21 | 55.0% |

The screen add-on is the **thinnest margin in the system**: bill $35, cost $20,
so $15 a screen at 42.9%. It therefore dilutes a job rather than carrying it —
but it never drags one below break-even, and the fixed cost now lands on the
order that caused it instead of on every piece.

Whole job, decoration only — the blank is a separate line with its own markup:

| job | revenue | cost | profit | margin |
| --- | --- | --- | --- | --- |
| 50pc, 1 colour, 1 location, white (the minimum job) | $247.50 | $110.00 | $137.50 | 55.6% |
| 50pc, 1 colour, 1 location, dark | $282.50 | $130.00 | $152.50 | 54.0% |
| 50pc, 1 colour, 2 locations, dark | $565.00 | $260.00 | $305.00 | 54.0% |
| 50pc, 7 colours, 2 locations, dark (worst case) | $1,640.00 | $780.00 | $860.00 | 52.4% |
| 100pc, 1 colour, 2 locations, dark | $900.00 | $410.00 | $490.00 | 54.4% |
| 500pc, 1 colour, 2 locations, dark | $3,140.00 | $1,400.00 | $1,740.00 | 55.4% |

**What this margin does NOT include.** It is gross margin against the Anchorfish
invoice and nothing else. Still to come out of it: the blank, art and setup
labour, inbound freight, and card fees (~2.9% + $0.30). Treat 52–56% as the
ceiling, not the take.

**Worth revisiting:** $35 a screen is the weakest line here. $40 would put it at
50% and bring it in line with everything else. That is a pricing decision, not a
bug, so it has not been changed.

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
