# June's Tees wholesale API, v1

Version header: `X-JT-Api-Version: 2026-11-14`. Base URL: `https://www.jtees.net/api/wholesale/v1`.
Off (every route answers 404) until the owner sets `JT_WHOLESALE=on`.

This is the contract between June's Tees (the provider) and any system that sends it
production work, Biz Dashboard first. **Claude owns this side; Codex owns the Biz
Dashboard side.** Change the contract here first, then build both ends.

Sample responses for every status and event are in `docs/wholesale-v1-fixtures.json`. A
test (`tests/wholesale-fixtures.test.js`) keeps them in step with the code.

---

## 1. What the API does and does not do

June's Tees stays the only source of prices, print methods, setup/artwork/rush charges,
production rules and payment terms. The API never computes any of them.

| Step | Where it happens |
|---|---|
| Business sets retail prices, takes retail payment on **its own** Stripe | Biz Dashboard. June's Tees never sees it. |
| Business proposes a production request | `POST /requests` |
| The shop prices it | The June's Tees quote builder (a normal quote) |
| Business reviews a revision and authorizes it | `POST /requests/:id/authorize` |
| Business **accepts and pays** the wholesale invoice | The quote page, `quote.url` (`https://www.jtees.net/q/<code>`). It applies the Business Partner rules, tax, delivery and Stripe checkout. |
| Payment verified | Stripe webhook → June's Tees payment ledger. Reported as `quote.payment`. |
| Artwork, proof, production, shipping | The June's Tees job board. Reported as `status` + `quote.production`. |
| Customer-facing messages | The business, under its own brand. June's Tees never contacts its retail customers. |

So:
- A partner **cannot send a price, a discount or a payment**. Unknown fields are refused.
- **Retail payment never starts production.** `in_production` needs money paid on the
  *wholesale* quote.
- Business Partner Program benefits (first-order code, reorder code, 60-day price lock)
  apply only on the quote page, under the program's own rules. They are never stacked or
  applied by this API, and they show in `quote.pricing.discount` / `promo_code` only once
  the quote carries them.
- One request ↔ at most one quote, and one quote ↔ at most one request. That rules out
  duplicate fulfilment and duplicate payment requests.

## 2. Authentication

`Authorization: Bearer jtw_<12 hex>_<32 chars>`

- The owner issues one key per business on `/admin/wholesale`. It is shown once, and only
  its SHA-256 is stored.
- A key can only reach that business's own requests and events. Anything else answers
  **404**, the same as a request that does not exist.
- Lost key: the owner connects the business again and switches the old one off.
- Suspended business: **403** `partner_suspended`.
- Bad or missing key: **401**. More than 20 refused keys a minute from one IP: **429**.
- Rate limit: 120 requests a minute per business (**429**, `Retry-After: 60`).
- Bodies over 256 KB: **413**.

## 3. Statuses

One enum, `request.status`, always derived from June's Tees records:

| status | meaning | ends? |
|---|---|---|
| `requested` | received; no quote sent yet (a draft quote is not shown) | |
| `quoted` | a quote is out and valid | |
| `expired` | the quote's `valid_until` passed unaccepted. A new revision can reopen it. | |
| `awaiting_payment` | accepted on the quote page, nothing paid | |
| `deposit_paid` | part paid | |
| `paid` | paid in full, not started | |
| `in_production` | artwork/proof/blanks/printing under way **and** money paid | |
| `ready` | checked, ready to go | |
| `shipped` | | |
| `delivered` | | yes |
| `declined` | the shop will not quote it (`declined_reason`) | yes |
| `cancelled` | by the business before payment, or by the shop | yes |

Treat unknown future values as "in progress, show as is". New values may be added in v1.
None will be renamed.

## 4. Endpoints

### `GET /me`
`200 {partner:{id,name,webhooks}, api_version, statuses:[...]}`

### `POST /requests`: propose a production request
Headers: `Idempotency-Key` (required, 8–100 of `A-Za-z0-9._:-`).

```json
{
  "external_ref": "NS-1001",
  "needed_by": "2026-12-10",
  "notes": "Batch of preorders closed Nov 20",
  "contact": {"name": "Dana", "email": "ops@northside.example", "phone": "+17735550100"},
  "ship_to": {"name": "Northside Apparel", "street1": "1 Main St", "city": "Chicago", "state": "IL", "zip": "60601", "country": "US"},
  "lines": [{
    "external_line_ref": "sku-blk-tee",
    "product": "Black tee, front logo",
    "colour": "Black",
    "sizes": {"S": 4, "M": 10, "L": 10},
    "decoration": "DTF front, about 11 in wide",
    "artwork_urls": ["https://cdn.northside.example/logo.png"],
    "notes": "Match last run"
  }]
}
```
Rules: `external_ref` is unique per business. 1–50 lines. `qty` 1–10,000, or `sizes`
(1–20 sizes) whose sum is the quantity (send both and they must agree). https artwork
links only, 10 a line. Strings are capped. Unknown fields → **422** `unknown_field`.

| Outcome | Answer |
|---|---|
| created | **201** `{request}` |
| same key + same body (also concurrent) | **200** `{request, replayed: true}`. Never a second request. |
| same key + different body | **409** `idempotency_conflict` |
| new key, existing `external_ref` | **409** `duplicate_external_ref` |

**Preorder batches:** collect the retail orders in Biz Dashboard. When the batch closes,
send **one** request with the final quantities and sizes. The quote is priced on what
you send. To change a batch after it is quoted, contact the shop: they issue a new
revision, which you authorize again (see `reapproval_required`).

### `GET /requests?updated_since=<ISO>&limit=<1-100>`
Newest change first. Use it to reconcile after downtime.

### `GET /requests/:id`
`{request}` (see section 5).

### `POST /requests/:id/authorize` `{"revision": 2}`
The business owner has reviewed **this revision** and wants it made. **It does not accept
or pay.** The answer carries `next: {action: "accept_and_pay", url}`. Send the owner to
that url.
- Allowed while `quoted` or `awaiting_payment`.
- `revision` ≠ current → **409** `revision_mismatch`. Fetch and show the new figures again.
- Other statuses → **409** `not_authorizable`.

### `POST /requests/:id/cancel` `{"reason": "..."}`
Allowed until money is paid on the wholesale quote. After that → **409**
`payment_received`; the shop handles it.

### `POST /requests/:id/artwork` `{"url": "https://...", "name": "...", "note": "...", "line": 0}`
Adds a version. Nothing is overwritten (`request.artwork[]` holds every version with
`version`, `line` and `submitted_at`). After the proof is approved, the version is
marked `after_approval: true`, the shop is alerted, and a new proof is needed. Refused
once `shipped` or ended.

### `GET /events?after=<evt_id>&limit=<1-200>`
Every event for this business, oldest first. This is the **source of truth for
catching up**: webhooks are a convenience on top of it.

## 5. The request object

```json
{
  "id": "wr_3f9c0a1b2c3d4e5f6a7b",
  "external_ref": "NS-1001",
  "status": "deposit_paid",
  "created_at": "...", "updated_at": "...",
  "needed_by": "2026-12-10", "notes": "...", "lines": [ /* as sent */ ], "ship_to": {},
  "artwork": [{"version": 1, "line": 0, "url": "https://...", "name": null, "note": null, "submitted_at": "...", "after_approval": false}],
  "authorized_revision": 2, "authorized_at": "...",
  "reapproval_required": false,
  "declined_reason": null, "cancel_reason": null,
  "quote": {
    "id": "WHSL000001", "revision": 2, "valid_until": "2026-11-28", "needed_by": "2026-12-10",
    "url": "https://www.jtees.net/q/WHSL000001",
    "lines": [{"description": "...", "details": "...", "colour": "Black", "qty": 24, "sizes": {"S": 4, "M": 10, "L": 10},
               "unit_price": 12.5, "line_total": 300, "optional": false,
               "prints": [{"location": "front", "method_id": 1, "colours": null}],
               "extras": [{"label": "Setup", "amount": 25}], "setup_fee": 0, "mockups": ["https://..."]}],
    "pricing": {"subtotal": 300, "rush": 0, "rush_pct": 0, "discount": 0, "discount_note": null, "promo_code": null,
                "tax": 25, "delivery": 0, "shipping": 0, "total": 325, "deposit_required": 162.5, "currency": "usd"},
    "payment": {"paid": 170, "balance": 155, "state": "deposit_paid", "terms": "Deposit before production; balance before the goods leave. Paid on the quote page."},
    "accepted_at": "...",
    "production": {"artwork": null, "proof_sent": null, "proof_ok": null, "blanks_ordered": null, "blanks_in": null,
                   "production": null, "qc": null, "shipped": null, "delivered": null}
  }
}
```
- `quote` is `null` until the shop **sends** a quote. Drafts are never shown.
- Money is dollars, 2 decimal places. `payment` comes from the payment ledger, which Stripe's
  webhook writes, so a checkout someone only *started* never shows as paid.
- `reapproval_required` is true when the quote's revision is newer than the one you authorized.
- `needed_by` / `valid_until` are dates. **No turnaround is promised by the API.** Any
  estimate is on the quote page.

## 6. Errors

Every error: `{"error": {"code": "...", "message": "...", "field": "..."}}` (`field` when one applies).
Codes: `unauthorized`, `partner_suspended`, `rate_limited`, `body_too_large`, `invalid_body`,
`unknown_field`, `invalid_field`, `idempotency_key_required`, `idempotency_conflict`,
`duplicate_external_ref`, `conflict`, `not_found`, `revision_mismatch`, `not_authorizable`,
`payment_received`, `not_cancellable`, `artwork_closed`, `artwork_limit`, `server_error`.
On `server_error` nothing was changed, so retry with the same Idempotency-Key.

## 7. Webhooks

Optional: the owner sets an https URL on a public host when connecting the business.
Each event is POSTed as:

```
Content-Type: application/json
X-JT-Event-Id: evt_...
X-JT-Signature: t=<unix seconds>,v1=<hex HMAC-SHA256(secret, "<t>.<raw body>")>

{"api_version":"2026-11-14","event":{"id":"evt_...","type":"request.status_changed","request_id":"wr_...",
 "from_status":"quoted","to_status":"awaiting_payment","data":{"quote":"WHSL000001","revision":2},"created_at":"..."}}
```

Event types: `request.created`, `quote.linked`, `request.authorized`,
`request.status_changed`, `artwork.submitted`, `artwork.changed_after_approval`.

**Receiver rules (Biz Dashboard must do all four):**
1. Verify the signature on the **raw** body before parsing, with a timing-safe compare.
2. Refuse when `|now − t| > 300 s` (replay).
3. De-duplicate on `X-JT-Event-Id`. A delivery can arrive more than once.
4. Answer 2xx fast, then process. Anything else is retried.

The signing secret is per business. The owner gives it out with the key. (It is derived
from the server's `JT_WHOLESALE_SECRET` and the business id, so it is never stored.)

```js
function verify(secret, header, raw) {
  const m = /^t=(\d+),v1=([0-9a-f]{64})$/.exec(header || '');
  if (!m) return false;
  const want = crypto.createHmac('sha256', secret).update(`${m[1]}.${raw}`).digest();
  const got = Buffer.from(m[2], 'hex');
  return got.length === want.length && crypto.timingSafeEqual(got, want)
    && Math.abs(Date.now() / 1000 - Number(m[1])) <= 300;
}
```

Retries: 1 m, 5 m, 30 m, 2 h, 6 h, 12 h, 24 h, 24 h (8 tries, about 3 days). Redirects are
not followed and there is a 10 s timeout. After the last try the shop is told, and
`/events` still has every event.

Status is reconciled from June's Tees records every 2 minutes, so a status event can trail
the real change by up to 2 minutes.

## 8. For Codex: the Biz Dashboard side

- Code against a **provider interface** (`createRequest`, `getRequest`, `listRequests`,
  `authorize`, `cancel`, `submitArtwork`, `events`), with June's Tees as one implementation,
  so other industries never depend on it.
- The June's Tees connection must not require Biz Dashboard's Production Management
  add-on. It is the business's link to an outside supplier.
- Never show the business a price you computed. Show `quote.pricing` and send the owner to
  `quote.url` to accept and pay.
- Keep retail payments, refunds, tax and chargebacks entirely on the business's side.
- Store `request.id`, your `external_ref` and the last `evt_` id you processed. Reconcile with
  `GET /events?after=` on start-up and hourly.
- Test against fixtures (`docs/wholesale-v1-fixtures.json`) and a **test business** the owner
  connects on a non-production deploy. Never use live customer orders.

## 9. Not in v1

- Partners cannot create or edit quotes, accept, pay or approve proofs through the API.
  All of that happens on the quote page.
- No tracking numbers yet (`shipped` only).
- No per-line production status. Status is per request, as the job board is per job.
- No file upload. Artwork is a link the business hosts.
