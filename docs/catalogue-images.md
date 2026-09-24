# Which picture a quote shows

Three different systems put a photograph on a garment, they are easy to
confuse, and confusing them is what put a white-grey hoodie on a quote for a
black one. This is the order they are tried in, and who owns each.

## The order, as `server.js` applies it

A quote line takes the first of these that exists:

| # | Source | Where it comes from | Covers |
|---|---|---|---|
| 1 | What a person uploaded | Cloudinary, attached on the quote form | whatever was attached |
| 2 | Per-colourway **art** | `colours[].image` from the catalogue | 409 colourways, 29 products |
| 3 | Per-colourway **photo** | `data/colour-photos.json` | 2156 colourways, 99 products |
| 4 | The product **thumbnail** | `lumise_products.thumbnail_url` | everything else |

Art beats photo deliberately. The art is cut out on a transparent ground and
aligned to a print area so a design can sit on it; the photo is a supplier
product shot. Where both exist the art is the better picture. Swapping them
would cost the 29 art products nothing visible on a quote and everything in
the designer, which is why `tests/colour-photo.test.js` pins the order.

The thumbnail is last because a line must never be imageless — but it is ONE
colourway standing in for the whole product, so reaching it means the customer
is looking at the wrong colour. Before `colour-photos.json` existed that was
1803 colourways of 2212.

## The tools, and when to run them

All three are manual. None of them runs on a schedule, and none is wired into
`runSupplierSync()` — that job refreshes price, cost and stock only.

```
tools/resync-colours.js      --vars=<file> [--apply]   # which colours exist
tools/resync-thumbnails.js   --vars=<file> [--apply]   # the product thumbnail
tools/colour-photos.js       --vars=<file> [--write]   # the per-colour photo
```

Run them in that order. `colour-photos.js` matches on the colour TITLE, so it
has to run after any change to the palette or it will report real colours as
missing. Each is a dry run until its write flag is passed.

`colour-photos.js` writes `data/colour-photos.json`, which is committed and
read by `server.js` at boot. A committed file rather than a database column
because the catalogue reaches `server.js` over HTTP from `jt-catalog.php`,
which lives in the Lumise **image** and not on its volume — an edit there is
wiped by the next deploy.

Needs both MySQL and the S&S credentials, which no single Railway service
holds. From a workstation:

```
railway run --service junesteesnthings-backend -- \
  env MYSQLHOST=<tcp-proxy-host> MYSQLPORT=<tcp-proxy-port> \
  node tools/colour-photos.js --from-env --write
```

The `env` goes after the `--`, because `railway run` injects the service's own
variables over the shell's and would otherwise put back the internal host.

## Reading the output

`colour-photos.js` separates two failures that look identical and are not:

- **S&S does not sell this style in this colour** — act on it. The picture is
  the least of the problem: the shop is offering a colour the garment is not
  made in, so the order cannot be filled as sold. Run `resync-colours.js`.
  This is the #97 Harriton bug, where a twill work shirt carried a Gildan tee
  palette.
- **S&S sells it but has no photograph** — nothing to fix. The colour is real
  and orderable; the line keeps the thumbnail. 56 colourways are in this state
  and always will be until the supplier shoots them.

A run that reports anything UNREACHABLE refuses to write, because a style that
failed at the API is indistinguishable from one with no colours, and writing
that run would delete photos the catalogue already had.

## Quotes saved before a refresh

The picture is resolved when a quote is SAVED and stored on the line, so an
existing quote keeps whatever it was given. Re-saving it in the admin form
re-derives it — the save path keeps only Cloudinary URLs from the posted
images, so a stored supplier URL is dropped and the ladder above runs again.

There is no backfill tool. With the catalogue this size the affected quotes
are countable on one hand, and opening one to check the result is worth more
than a script that rewrites customer-facing records unattended.
