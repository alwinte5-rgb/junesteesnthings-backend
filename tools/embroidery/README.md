# Stitch estimator, and the digitiser question

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
