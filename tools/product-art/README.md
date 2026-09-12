# Real product art for the design canvas

The designer draws a generic silhouette under a customer's design. There is one
headwear image for every cap, beanie, trucker and visor; `premium_front.png` is
a women's crew-neck tee and stands in for every work shirt and button-down.
`tools/canvas-audit.js` lists who is borrowing what.

Tinting one silhouette cannot fix it, because a lot of these styles are
**two-tone**: a Richardson 112RE in "Loden/ Khaki" is a loden crown with khaki
mesh, and no single fill colour represents that.

So the canvas art becomes the REAL photograph, one per colourway.

## How it works

S&S carries `colorFrontImage` and `colorBackImage` for every colour of every
style, shot straight on against white. The pipeline is:

1. `colours.js`  — list a style's colourways and their image paths
2. `cutout.py`   — strip the white background
3. `pack.py`     — downscale to 800px and encode WebP with alpha
4. `upload.js`   — signed upload to Cloudinary
5. `wire.js`     — write one Lumise variation per colourway

Lumise supports this natively: a variation carrying `cfgstages: true` supplies
its own `stages`, which replaces the product's. The stage is written with
`overlay: false` so the photograph is the base layer and the customer's design
sits ON it, rather than the art being a shading wash drawn over the design.

## The background is flooded in from the edge, not thresholded

A "white pixels are background" rule eats the white panels of a white garment
and the specular highlights on every other one. Only white CONNECTED to the
border is background, so an interior white mesh panel survives.

## A prerequisite: swatch values must be unique

Variations key on the colour option's `value`. S&S returns one body colour per
colourway, so "Loden/ Black" and "Loden/ Khaki" both arrived as `#777056` —
which also meant the cart recorded the same value for either, and the shop
could not tell which cap was sold. `tools/unique-colour-swatches.js` separates
them. Run it before wiring any variations.

## Sizes

At 800px and WebP q90 a colourway is ~120KB. A style with 20 colours, front and
back, is ~5MB. The whole borrowing catalogue is roughly 350 colourways, ~85MB,
which is why these live on Cloudinary and not in this repo.

## Caps have no back stage, and are not getting one

Decided 2026-09-12: **no back decoration on hats.** `ssa-add-products.js` gives
the cap type `back: null`, and that stays. A stage is somewhere a customer can
put a design, so adding one is not an artwork change — it commits the shop to
decorating and pricing a cap back.

So run headwear with `--sides front`. It is a third of the work: a style with 20
colourways drops from 40 images to 20, and across the headwear in the catalogue
that is about 100 images not fetched, cut, encoded or stored.

Everything else takes `--sides front,back`, where the product already has a back
stage to put the art on — quarter-zips, wovens, bags, and the vests and jackets
once they come off hold.

(The six cap BACK images uploaded during the 112RE pilot are unused. Harmless,
and already there if this is ever revisited.)
