# Wholesale connector + Brevo marketing: plan

Branch `wholesale-connector` (worktree `~/jt-wholesale`), from main `308eaa5`.
Nothing is deployed, merged or sent. Every customer-facing send, deploy and merge
waits for the owner.

`[x]` done · `[~]` in progress · `[ ]` not started · `[!]` blocked on the owner

Two briefs make up this plan:
1. **Final implementation handoff**: Workstreams A–F, wholesale + Brevo + payments.
2. **Activate Brevo Marketing**: Phases 1–7. It is folded into Workstream B below as B1–B7.

---

## Blockers (owner)

- [!] **Brevo access.** The Brevo MCP key is still refused ("Authentication failed",
  checked 2026-11-14). Without access, nothing can be checked or built in Brevo itself:
  plan, contacts, usage, sender domain, segments, templates or automations.
  Options: a new MCP API key (reads data and drafts campaigns), or working in your
  logged-in Brevo tab in Chrome (can do everything), or both.
- [!] **Email consent rule.** Brief B says a past order or quote is not consent.
  Today only *text* consent is recorded, and `/admin/campaign` (reintro + Partners invite)
  emails every Brevo contact on an opt-out basis. Pick one rule for both systems:
  (a) opt-in only (small list, new signup checkbox), or (b) customers + opt-out.
- [!] **Approve new tables + routes for the gate.** radar-gate refuses new tables and
  API routes without owner approval, as it did for #365.
- [!] **Lumise licensing**, only if the designer is ever offered to other businesses.
  Not needed for anything here.

---

## Workstream A: Audit and protect existing systems

- [x] Quote → payment → production map. A quote row (`quotes`) is accepted on `/q/:code`
  (applies options, partner codes, delivery and tax). It is paid by Stripe Checkout,
  which the webhook banks into the append-only `quote_payments` ledger
  (`paid_amount` is a cached rollup of that ledger). Production then moves through the
  job board's milestone columns: `artwork_at` … `delivered_at` (`JOB_STAGES`).
- [x] "Partner Portal" located. It is the **Business Partners Program**. Businesses,
  logins and codes live on design.jtees.net (`jt-partners.php`, `jt-auth.php`), and the
  backend owns what a code does to a quote (`tools/lib/partners.js`). The designer reaches
  the backend through `requireInternalKey` endpoints (`/api/customer-jobs`, `/api/reorder`,
  `/api/biz-profile/*`, `/api/biz-files/*`, `/api/paid-history`). There is no separate
  portal app and no per-business API.
- [x] Pricing source: quote builder + `quoteTotals()` (rush → discount → tax → delivery/shipping).
  `/api/pricing-rules` publishes the curve to the designer. The connector re-prices nothing.
- [ ] **Preorders / Mark Kelty work.** Nothing found in the backend (no `preorder` or
  `kelty`). The designer repo has not been searched yet; that search was stopped
  this session. Closest existing piece: the team size link (`/s/:token`, `size_collections`),
  which gathers sizes from many people into one quote.
- [~] Integrations that touch live orders: Stripe (checkout + webhook + refunds/disputes),
  Brevo (send + CRM deals + contacts), Twilio, Cloudinary, the designer (internal key),
  SinaLite/Signs365, Shippo (designer), Clover (rarely used). Still to write up in full.
- [ ] Written baseline document (`docs/wholesale-audit.md`): models, webhooks, jobs, statuses.

## Workstream B: Brevo marketing (brief 2, Phases 1–7)

**B1. Audit**
- [x] Five follow-ups (quote, deposit, balance, review, reorder) run in the backend's
  hourly sweep, each guarded by a stamp column. Brevo only delivers them. No Brevo
  workflow will duplicate them.
- [x] Other marketing already in the app: the `/admin/campaign` tool (reintro +
  Partners invite, one per address, daily cap 200), the cart-recovery sequence
  (designer-triggered), and the marketing calendar
  (`tools/lib/marketing-calendar.js`, `/admin/marketing-calendar`), which sets a
  "send Brevo campaign" date 6 weeks before each season.
- [x] Data already synced to Brevo: `LIFETIME_VALUE`, `ORDERS_COUNT`, `LAST_PAID_AT`,
  `LAST_QUOTE_AT`, `JOB_SUMMARY`, `QUOTE_STATUS`, plus the `jt_*` lifecycle events
  and one CRM deal per quote.
- [x] Templates #91–95 are unused leftovers.
- [!] Confirm the actual plan (Starter, Standard or grandfathered), what it includes,
  contact count, monthly usage and sender-domain auth. Needs Brevo access.
- [ ] Check for any Brevo-hosted workflows or campaigns already running. Needs access.

**B2. Consent and suppression** (must be done before any Brevo campaign)
- [x] Gap found: an unsubscribe in the app was never sent to Brevo, so a Brevo
  campaign could still email that person.
- [x] **Fixed on the branch:** each unsubscribe is put on Brevo's blocklist
  (`emailBlacklisted`, which blocks campaigns only; receipts still go). A failed push is
  retried hourly, up to 10 tries, and a give-up is reported. The same sweep copies the
  existing opt-out list over, 200 an hour.
- [x] **Fixed on the branch:** marketing sends now *fail closed* if the opt-out list
  can't be read. Before, they failed open and sent anyway.
- [!] Consent rule (see Blockers).
- [ ] Optional promo-email signup (one checkbox/form) with a consent log of what was
  agreed, when and where (same pattern as `sms_consents`). Synced to Brevo as
  `PROMO_OPT_IN` + `PROMO_OPT_IN_SOURCE`. Previous customers are not enrolled.
- [ ] One shared promotional frequency cap across `/admin/campaign` and Brevo campaigns.

**B3. Segments**
- [ ] From data that exists today: repeat customers (`ORDERS_COUNT ≥ 2`), lapsed
  (`LAST_PAID_AT` > 6 months), high value (`LIFETIME_VALUE`), Business Partners
  (partner membership), opted-in (after B2).
- [ ] Need a new synced field taken from real job history, not guessed: customer type
  (school/team, business, family/event) and "bought signs/promo items" (from quote
  lines: sign lines carry `sign`, products carry categories). Code change on the branch.
- [ ] Built in Brevo. Needs access.

**B4. Templates** (real products, real photos, jtees.net links, no invented deadlines;
Christmas ordering stays open)
- [ ] Seasonal promo · new products/services · featured apparel · schools & teams ·
  business uniforms & promo items · reactivation · holiday · Business Partners.
- [ ] One reusable layout with swappable image/offer blocks, mobile-checked.

**B5. Automations** (drafts only, all paused)
- [ ] Welcome after explicit signup · new-product announcement · seasonal (from the
  calendar) · reactivation · category promos · engagement follow-up. Depends on what
  the plan includes (B1).

**B6. Reporting**
- [ ] One UTM convention for every campaign link (`utm_source=brevo&utm_medium=email&utm_campaign=<slug>`).
  `first_touch` already records UTMs on leads, so quotes from a campaign can be counted.
- [ ] Use Brevo's own reports. Add a small admin summary only if leads/orders by
  campaign can't be seen there.

**B7. Launch safety**
- [ ] Test sends to internal addresses only; mobile layout; links and codes checked;
  no overlap with the five follow-ups; estimated monthly volume against the 10,000 limit.
- [ ] **No live promotional send without owner approval.**

## Workstream C: June's Tees as a wholesale provider

- [x] Design: the connector is a **thin layer over the existing flow**. A business
  sends a production request. The shop builds a normal quote in the quote builder,
  so pricing, partner codes, setup, rush and artwork charges stay where they are. The
  business owner accepts and pays on the existing `/q/<code>` page. Production runs on
  the existing job board.
- [x] Nothing a partner sends can set a price, accept a quote, take a payment or start
  production. A sent `price` field is refused.
- [x] Status is **derived** from the quote and ledger. Production marks with no money
  paid never read as "in production".
- [x] Draft/held quotes are invisible to the partner. Only a whitelisted view of a
  sent quote is shown (no blank cost, overrides or catalogue ids).
- [x] Revisions: authorize is tied to a revision. A later revision flags
  `reapproval_required`. Artwork after proof approval is flagged to the shop.
- [x] Retail money stays out of it: the connector never sees the business's own Stripe.
- [ ] Preorder batches: gather many retail orders into one request. The final quote is
  priced on final quantities. Reuse the size-link pattern if it fits. Waits on the
  Kelty audit.
- [ ] Custom artwork requests quoted through June's Tees: the existing design-fee lines.
  Documentation only.

## Workstream D: Partner connector API (v1)

- [x] `tools/lib/wholesale.js` (pure rules) + `tools/lib/wholesale-routes.js` (I/O),
  wired into `server.js`. Off until `JT_WHOLESALE=on`.
- [x] Per-business API keys (only the hash is stored, checked timing-safe), suspend/activate.
- [x] `GET /me`, `POST /requests` (Idempotency-Key required; same key + same body
  replays, different body → 409; duplicate `external_ref` → 409), `GET /requests`
  (`updated_since`), `GET /requests/:id`, `POST /requests/:id/authorize`,
  `/cancel` (refused once money moves), `/artwork` (versioned), `GET /events` (pull feed).
- [x] Tenant isolation (another partner's id → 404). Rate limits per partner and on bad
  keys. Body cap. Structured errors. Unknown fields refused.
- [x] Signed webhooks (`X-JT-Signature: t=,v1=` HMAC, 5-minute window, event ids for
  de-duplication). Per-partner secrets derived from `JT_WHOLESALE_SECRET`. Retries over
  about 3 days, then give up and alert. Private-address webhook URLs refused. No redirects followed.
- [x] Audit log `wholesale_events`: who, which request/quote, before/after status, data.
- [x] Owner page `/admin/wholesale`: connect a business (key shown once, never in a URL),
  link a quote, decline, switch off, undelivered-webhook warning.
- [ ] `docs/wholesale-api-v1.md`: the versioned contract for Codex (schemas, status enum,
  errors, webhook verification code, retry rules).
- [ ] Mock fixtures + sandbox for Codex: JSON fixtures for every status and event, plus a
  test-mode partner so Biz Dashboard never touches live orders.
- [ ] Optional link to a Business Partner (`business_id`) is stored. Not used for pricing,
  since program rules apply on the quote page.
- [ ] Future providers: Biz Dashboard should code against a provider interface, with
  June's Tees as one implementation. Write this into the spec for Codex.

## Workstream E: Payments and reliability

- [ ] Reproduce each reported issue before fixing it, with a regression test each:
  payment handoff failures · orders without verified payment · quote form losing
  changes · quotes that can't be resumed · missing quote notes · duplicate orders ·
  missing notifications · unreconciled Stripe webhooks · failed background sync.
- [ ] Audit trail for critical transitions outside the connector. `quote_revisions` and
  `staff_activity` exist; check what's missing.

## Workstream F: Codex coordination

- [ ] Hand Codex the spec + fixtures, then agree on enums, ids and webhook behavior
  before it builds the Biz Dashboard side.
- [ ] No edits to Codex-owned files (`~/biz-dashboard`).

## Tests

- [x] `tests/wholesale.test.js`: 14 unit tests pass (status derivation, quote whitelist,
  validation, idempotency, keys, signatures, SSRF, retries).
- [~] End-to-end run on real Postgres (`~/.local/share/jtees-e2e/run-wholesale.cjs`, about
  50 checks covering the connector and unsubscribe → Brevo). It is written but **has not run
  yet**: the first try failed on a missing package (fixed), and the re-run was stopped.
- [ ] Full existing suite (`node --test tests/*.test.js`) against the branch.
- [ ] `/code-review` and `/security-review` over the branch (owner rule).

## Delivery

- [ ] PR from `wholesale-connector` with what changed, why, what was not done, and manual
  checks. Not merged or deployed without the owner.
- [ ] Rollout: deploy with `JT_WHOLESALE` off → owner checks `/admin/wholesale` → set
  `JT_WHOLESALE_SECRET` → connect one test business → switch on. Rollback: unset
  `JT_WHOLESALE` (the API 404s; tables stay and are harmless).
- [ ] The unsubscribe → Brevo sync starts on deploy and copies the existing opt-out list.
  It only *suppresses*, but it is still a write to Brevo, so the deploy is the owner's call.
