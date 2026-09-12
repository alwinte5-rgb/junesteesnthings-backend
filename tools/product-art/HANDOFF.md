# Product art — where this stopped

Written 2026-09-12. Read this before re-reading the pipeline; it is here so you
do not have to.

## Shipped and live

| | |
|---|---|
| `lumise-designer` `e195104` | **The product picker shows real photos.** Verified live: the app.js served from design.jtees.net is byte-identical to the commit. |
| `lumise-designer` `66fe032` | Canvas disclaimer collapsed to a hover pill. |
| `lumise-designer` `a43214d` | **`get_printings()` reads both column formats.** Closes a $0-decoration hole — see below. |
| `junesteesnthings-backend` `74225cb` | `run.js` / `plan.js` drive the whole backlog; pack + upload resumable; 8 tests. |

## The batch was RUNNING when the session ended

    node tools/product-art/run.js --vars=$HOME/.jtees-art.json --all \
      --outdir=$HOME/jtees-product-art --apply

It runs in the background and **dies with the session**. Re-run the exact same
command to continue: finished products are skipped (`done` is read from the
database), cut images are kept, and uploads already recorded in a manifest are
not repeated. Log: `~/jtees-product-art/run.log`.

**The batch finished: 23 of 27 products written, 361 images.** Four failed:

- `#25` — `wire failed`, the variations column ceiling described below. Needs
  the `wire.js` fix; a re-run alone will not clear it.
- `#144`, `#151`, `#168` — `upload failed`, all three
  `curl (56) Recv failure: Connection reset by peer` partway through Cloudinary.
  Transient. **A re-run fixes these**: every uploaded URL was flushed to the
  manifest as it landed, so only the missing images are fetched again.

`#162` was the dry run (4 colourways, uploaded but deliberately not wired) — it
is in the 23 only if the final run wrote it; check `--list` before assuming.

## Result

**25 of 27 products are wired. 184 of 219 colourways carry real per-colourway
art (84%)**, counting neither #25 (blocked, below) nor #88 (out of scope).
Across the whole borrowing catalogue including both, it is 184 of 389 (47%).

The 35 colourways still on the silhouette are not a bug to fix:

- **62 side-images do not exist at S&S** (`no image at S&S — skipped` in the
  logs). #143 has no photo for any of its three colours, #148 none for nine of
  fifteen. Nothing to fetch; those colourways keep the stand-in.
- **#97 Harriton M500 is selling the wrong colour list entirely.** Not a
  string-matching problem — I said that first and it was wrong. The product
  offers Ash, Sport Grey, Graphite Heather, Irish Green, Safety Green,
  Carolina Blue, Garnet, Maroon and thirteen more: that is a **Gildan tee
  palette on a Harriton twill work shirt**. S&S says the M500 comes in Dill,
  French Blue, Nautical Blue, Stone, Sunray Yellow, Team Orange, Team Purple,
  Wine and Hunter — none of which the shop lists. Only Black, Navy, Red and
  White appear on both, by coincidence of generic names.

  So the shop is taking orders for 21 colours this garment is not made in, and
  cannot sell the 11 it is. Normalising the match would recover nothing. The
  fix is to re-pull the colour attribute from S&S for style 13845, which is a
  catalogue correction, not an art one — and it has to happen before the art
  can be wired.

`--list` reports these as `partial` forever, because `done` is
`wired >= cols` and a colourway with no supplier photo can never be wired.
That is misleading rather than wrong — worth changing to compare against what
is actually wireable.

## The one real blocker: #25 will not fit

`wire.js` on **#25 YP Classics 6606** died with

    ERROR 1406 (22001): Data too long for column 'variations'

`lumise_products.variations` is **TEXT — 65,535 bytes**. The pilot #164 stores
6 colourways in 7,516 bytes, so a colourway costs ~1,250 bytes and the ceiling
is **about 52 colourways**. #25 has 55.

It is the only runnable product over the line (#88 has 115 and is excluded;
everything else is 25 or fewer). Two ways out, neither chosen yet:

1. **Stop storing the URL twice.** `wire.js` writes the same Cloudinary URL to
   both `st[side].url` and `st[side].image`. Only `image` is load-bearing —
   app.js prefixes the assets path only `if (!stages[s].image)`. A short slug in
   `url` (canvas-audit reads it) and the full URL in `image` cuts roughly 40%
   and puts #25 comfortably under. Smallest change, no schema.
2. **`ALTER TABLE lumise_products MODIFY variations MEDIUMTEXT`.** Raises the
   roof to 16MB and would let #88's 115 colourways in too. It is a schema
   change on a live database, so it is the owner's call.

Option 1 first; it is reversible and needs no migration.

Three of #25's colourways also did not wire — `Black/ White/ White`,
`Dark Heather/ White/ White`, `Navy/ White/ White` are at S&S but not on the
product. Harmless; the other 55 matched.

## The $0-decoration bug, found on the way

`printings` exists in two formats: the admin object (`{"_7":"A3"}`,
rawurlencoded) and a legacy comma list (`7,8,9`). `get_printings()` understood
only the first and, given the second, fell out of its `if` **without
returning** — so it produced `null`.

That does not throw, it charges nothing:

- `app.js:10852` turns `null` into `[]`
- `app.js:16809` — no printings, so no decoration chooser is rendered
- `app.js:15831` — the "choose a decoration" check is gated on
  `printings.length > 0`, so it is **skipped**
- `app.js:16805` — the print price stays `0`

`jt_printing_ids()` in jt-auth.php read both formats all along, which is why the
product page offered methods the designer then priced at nothing. Fixed in
`a43214d`, with `tests/printings-column-formats.test.php` pinning both readers
to the same answer.

**Only #88 was affected** — it is the single ACTIVE product still in the legacy
form; the other 57 are retired.

## Open decision: what is #88 meant to be?

`products.php` records the intent: `$jt_quote_only = array(88)` with a comment
saying such products "stay printing-less on purpose" and show *Get a Quote*.
**That is not what happens.** The quote-only path keys on the column being
EMPTY, and #88's column is `"7,8,9,15,10,16,13"` — non-empty — so its catalogue
card renders **Customize** and links straight into the designer.

After `a43214d` its four active embroidery methods price correctly, so the hole
is closed either way. What is left is a product decision:

- make it genuinely quote-only (empty the column), matching the written intent; or
- leave it designable now that it prices properly.

The owner has already said its 115 colourways are too many to build art for.

## Housekeeping

- `~/.jtees-art.json` (0600) holds merged Railway variables. **Delete it when
  the batch is done.** It exists because the secret guard blocks reading the
  variable store into a pipeline; `--vars=<file>` is the supported path.
- **Rotate the S&S API key.** `railway-vars-safe` judged it "ordinary-shaped"
  and printed it in full into a session transcript.
- `OPENAI_API_KEY` returns 401 on both services — the AI Designer is still down.
- `~/junesteesnthings-backend/Lumise/Lumise-Product-Designer-PHP-ver2.0/lumise`
  is a **second checkout of the designer repo**, sitting at `ebca78e` — behind
  `main`. `tests/blank-pricing-agreement.test.cjs` and
  `screen-fee-agreement.test.cjs` only run there (they read `server.js` three
  levels up); in `~/lumise-designer` they fail with ENOENT, which is
  environmental, not a regression.

## Decided, do not revisit

- **No back decoration on hats** — headwear runs `--sides front` only.
- Use `Images/Color/...` (flat ghost-mannequin), never `Images/Style/...`
  (a person wearing the garment). Verified by eye on real photos.
- #88 is excluded from the art run.
