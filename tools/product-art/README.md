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

`run.js` drives all five for a product, or for the whole backlog:

    node tools/product-art/run.js --vars=<file> --list
    node tools/product-art/run.js --vars=<file> 154 --outdir /tmp/art
    node tools/product-art/run.js --vars=<file> --all --outdir /tmp/art --apply

It picks `--sides` per product from `tools/lib/garments.js` rather than leaving
it to whoever is typing — headwear front only, everything else the sides its own
stages define — and refuses a product that cannot be wired: no supplier style
id, no colour attribute, duplicate swatches, or no decoration method at all.
Without `--apply` it does every expensive step and stops before the write.

### USE THE COLOUR IMAGE, NEVER THE STYLE IMAGE

`Images/Color/<id>_f_fl.jpg` is a flat ghost-mannequin shot — the garment alone,
which is what the canvas needs. `Images/Style/<id>_fl.jpg` is the marketing
photograph, and for apparel that is a **person wearing it**, head and hands and
trousers included. `colours.js` reads `colorFrontImage`/`colorBackImage` and so
gets the right one; anything that reaches for the style image instead will put
the customer's design on a photograph of a model.

### Resuming

A 400-image run will be interrupted. `pack.py` keeps any `.webp` already cut,
`upload.js` skips an image whose URL is already in the manifest and flushes that
manifest after every single upload, and one colourway that fails to fetch is
reported at the end instead of ending the style. Re-running the same command
retries only what is missing.

### Credentials

Three stores are needed at once — S&S and Cloudinary on the app service, the
public MySQL URL on the database service — and the steps read them as one JSON
object on stdin. `--vars=<path>` reads that object from a 0600 file instead,
which is the better habit: the command that dumps a Railway store writes every
value to stdout, and stdout is a terminal, a screen share or an agent
transcript. Nothing is ever passed as an argument, where `ps` would show it.

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

## What is left

29 active products borrow a stand-in. One (#164, the 112RE pilot) is done.
The remaining 28 are 383 colourways / 527 images:

| drawn as | products | colourways | images |
|---|---|---|---|
| trucker — a solid-back dad hat, no mesh | 6 | 207 | 207 (front only) |
| woven — a women's crew-neck tee | 8 | 69 | 138 |
| qzip — a plain sweatshirt, no placket | 7 | 53 | 106 |
| drawstring — a flat tote | 3 | 22 | 44 |
| beanie — a curved-bill dad hat | 3 | 28 | 28 (front only) |
| cap-structured — an unstructured dad hat | 1 | 4 | 4 (front only) |

**#88 Richardson 112 Snapback is 115 of those 207 trucker colourways, and has
no decoration method** — it is in `$jt_quote_only` in products.php, so it shows
"Get a Quote" and never opens the designer. Art for it changes nothing a
customer can see until it is given a printing. `run.js --all` skips it for that
reason and says so. Doing the other 27 is 268 colourways / 412 images.

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
