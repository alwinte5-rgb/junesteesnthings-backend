# Stitch estimator and preview digitiser

    # count and preview in one pass, then price it
    python3 tools/embroidery/digitize.py logo.png --width-cm 9 --colours 3 \
      --out preview.png --json | node tools/embroidery/quote.js --vars=~/.jtees-art.json --qty 24

`digitize.py` lays down real stitch geometry — underlay, tatami fill, satin
border, per thread colour — and counts the needle penetrations. That count is
the point: it exists BEFORE anyone pays to digitise, which is the only way to
price a job or sanity-check a supplier's quote.

It is not a production digitiser and writes no DST. The real file still gets
digitised properly; this decides what to charge for it.

**The picture is the by-product, and it earns its keep.** Thread cannot do
gradients, hairlines or small type. The preview shows the customer what survives
— on the test logo the 20 pt strapline comes out illegible and most of the 2 px
rules vanish — and the run reports the share of the design too fine to hold a
fill, so that conversation happens before the machine runs rather than after.

## Two counts that agree

`estimate.py` (area x density) and `digitize.py` (count the actual paths) are
independent. On the test logo they land within ~10% of each other once coverage
is accounted for, which is the cross-check worth keeping: if they ever diverge
badly, one of them is wrong about the artwork.

Quote from the higher of the two. Undercharging is the failure that costs money.

## Two defects worth remembering

- Quantising the whole frame let the BACKGROUND claim a thread slot, so asking
  for 3 threads returned 2 and a green bar was merged into the navy. A missing
  thread is a missing colour change, and a colour change is money. The palette
  is built from artwork pixels alone.
- "Too fine to sew" was measured as `mask - erode(mask)`, which flags the
  boundary band of every solid shape — 10% on a plain circle. It is an opening
  now (erode, then grow back), so a solid circle reports nothing and a thin ring
  reports 84%.



    python3 tools/embroidery/estimate.py logo.png --width-cm 10 --json \
      | node tools/embroidery/quote.js --vars=~/.jtees-art.json --qty 24

## Why

Embroidery cannot be quoted without a stitch count, and a stitch count only
exists once a design is digitised. So the shop had two options, both bad: quote
only (and lose an impulse sale on a $16 cap) or guess (and eat the difference).
This estimates the count from the artwork, before anyone digitises anything.

It reports a RANGE, on purpose. Stitch count tracks fill area and density, not
size. Quote from the upper figure.

## What it showed on its first run

A solid 10 cm circle estimates at **13,400-31,500 stitches**. The size-based
band the shop would sell it under is *Medium Logo (≤10×10 cm, 8k-10k stitches)*
at $39 — the real count is up to three times that band's ceiling, and it
exceeds every active band including Full Back.

A thin 10 cm ring, the same footprint, estimates at **3,800-5,700** and lands
correctly in Small Logo at $28.

Same size. $28 to off-the-ladder. **Size is the wrong axis**, and that is the
whole reason the stitch ceilings read low: they are inherited from Anchorfish's
sheet, where the size names are a shorthand for typical logos, not a rule.

## Validated, not assumed

Run against shapes with known geometry at a known scale: a solid 1in square
measures 1.00 sq in and 4.00 linear in of edge, a circle π/4. The arithmetic is
`area x fill_density x (1 + underlay) + outline x satin_density`, with the
published spreads (800-2,000 per sq in fill, 150-200 per linear inch satin)
carried through as the range rather than averaged into a false precision.

## The bands are not duplicated here

`quote.js` reads the live rows from `lumise_printings` and parses each stitch
ceiling out of the method's own title. Retitle a band or switch one off in the
admin and this follows. A second copy of a price ladder is a price ladder that
will disagree with the shop.

## A real digitiser: what it would take

Nothing here produces a DST. That is a much larger job, and worth being plain
about: commercial digitising software (Wilcom, Hatch) costs thousands because
auto-digitising well is genuinely hard — stitch direction, pull compensation,
underlay strategy and push/pull on stretchy fabric are judgement, not geometry.

The open-source ground, if it is ever wanted:

- **[Ink/Stitch](https://github.com/inkstitch/inkstitch)** — an Inkscape
  extension, the most complete free digitising platform. Writes DST, PES and
  others. Scriptable through Inkscape's command line, so a "good enough for
  simple marks" pipeline (SVG in, DST out) is realistic.
- **[pyembroidery](https://github.com/EmbroidePy/pyembroidery)** — reads 40+
  and writes 20+ formats. This is the right library for *reading* a customer's
  supplied DST and counting its stitches exactly, which turns this estimator
  into a measurement whenever a file already exists. That is the highest-value
  next step and it is small.
- **[pystitch](https://github.com/inkstitch/pystitch)** — Ink/Stitch's
  maintained fork of pyembroidery.
- **[PEmbroider](https://github.com/CreativeInquiry/PEmbroider)** — Processing
  /Java, generative work rather than logo digitising.

Recommended order: exact counts from supplied DSTs via pyembroidery (small,
certain), then Ink/Stitch for simple one-colour marks, and keep sending complex
logos to a human digitiser.

## Calibrated against a real digitised file

`read_dst.py` reads a Tajima DST with no dependency (512-byte header, 3-byte
records, 0.1mm units) and reports what is actually in it. A header `ST:` that
looks wrong usually is not — most writers count jumps in it, which is exactly
the 47-stitch gap on the file below.

The same design, professionally digitised at four sizes:

| size | stitches | per sq in | **per inch of width** | avg stitch |
|---|---|---|---|---|
| 3.91in | 16,461 | 1,125 | 4,210 | 1.89mm |
| 4.91in | 21,030 | 913 | 4,283 | 2.19mm |
| 5.91in | 25,861 | 774 | 4,375 | 2.47mm |
| 6.91in | 30,952 | 677 | 4,479 | 2.74mm |

**Stitch count scales with LINEAR size, not with area.** Density per square
inch falls by 40% across that range while stitches per inch of width barely
moves. The reason is visible in the last column: scaling a design up keeps the
row spacing and lengthens the stitches, so rows grow with height while stitches
per row stay put.

That matters for money in both directions. Pricing embroidery per square inch
overcharges large designs and undercharges small ones, and the published
"1,200-2,000 stitches per square inch" rule only holds at around 4in — which is
roughly the size those rules were written for.

## What the shop will not take

Encoded in `review()`, from the published digitising minimums rather than
invented: satin columns below 1.3mm are unreliable, thin lines want 2.5mm,
capital letters want 6.4mm (7-9mm on knits), and a counter below 0.9mm fills in.

    ACCEPT    nothing flagged
    REVIEW    some fine detail, or complex enough to be worth eyeballing
    DECLINE   15%+ of the design finer than 1.3mm, complexity 8x a plain
              shape, under 25mm across, or more than 6 thread colours

Complexity is outline length against that of a circle of equal area — a cheap
stand-in for "how many separate things is the machine being asked to sew". A
solid shape is about 1; a ring of hairlines is 11.5.
