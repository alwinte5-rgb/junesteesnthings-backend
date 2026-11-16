# June's Tees: system map and baseline (audit, 2026-11-14)

Read from `main` at `308eaa5` before the wholesale connector was added. It describes how
things **are**, so later changes can be checked against it. Live data was not read or changed.

## 1. Quote → payment → production

| Step | Where | Record |
|---|---|---|
| Lead / enquiry | site forms, chat (tawk.to), texts, designer leads | `submissions` |
| Quote built by the shop | `/admin/quote` builder, priced by the server (`quoteTotals`, pricing helpers, `/api/pricing-rules` shared with the designer) | `quotes` (`items` JSONB, `revision` bumped on each edit; every prior version kept in `quote_revisions`) |
| Customer reviews | `/q/:code` (draft and held quotes are hidden) | `viewed_at` |
| Customer accepts | `POST /q/:code/accept`: optional lines, delivery choice, missing contact details, tax certificate, Business Partner code rules | `accepted_at`, `status = 'accepted'` |
| Customer pays | `/q/:code/pay/card` → Stripe Checkout. Only one open session per quote, and the old one is expired first. | `stripe_session` |
| Payment banked | `/webhooks/stripe` (signed) and the return page call the same banking path; the hourly `stripe payments` sweep catches anything missed | append-only `quote_payments` (unique per Stripe object); `quotes.paid_amount` is the cached rollup |
| Refunds / disputes / payouts | the same webhook + hourly sweeps (`stripe refunds`, `stripe disputes`, `stripe payouts`) | negative ledger rows; dispute record; payout alerts |
| Production | job board columns `artwork_at → proof_sent_at → proof_ok_at → blanks_ordered_at → blanks_in_at → production_at → qc_at → shipped_at → delivered_at` (`JOB_STAGES`) | stamps on `quotes`; proofs in `job_proofs`, art in `art_requests` |
| Cancel | `/admin/quote/:code/cancel` → `applyQuoteCancel` (now shared) | `cancelled_at` (never deleted), follow-up for the owner |

Studio (designer) orders are a second order stream. They live in the designer's MySQL and
are read through `/orders_feed.php`; they are not quotes.

## 2. "Partner Portal" = Business Partners Program

- Businesses, their people, logins (email code) and promo codes live on **design.jtees.net**
  (`jt-partners.php`, `jt-auth.php`, MySQL `jt_businesses`). The backend owns what a code does
  to a quote (`tools/lib/partners.js`): MAIL15 first order, REORDER5/BACKAGAIN, the 60-day
  price lock on exact reorders. All of it is behind `JT_PARTNERS=on`, which is on.
- The designer calls the backend with the shared internal key (`X-JT-Key`, `requireInternalKey`):
  `/api/customer-jobs`, `/api/reorder`, `/api/paid-history`, `/api/biz-profile/*`,
  `/api/biz-files/*`, `/api/sms-consent`, `/api/brevo-event`, order emails.
- **None of these endpoints suits an outside system.** They trust the caller completely, with
  one shared key for everything. The wholesale connector therefore has its own per-business
  keys and its own routes. It does not reuse them.
- Adding a person to a business is an invite they accept, so a plain add cannot expose that
  email's paid jobs.

## 3. Preorders / campaign logic

- **Backend: none found.** There is no `preorder` / campaign-batch code, and nothing named
  for Mark Kelty.
- The closest existing piece is the **team size link** (`/s/:token`, `size_collections` +
  `size_entries`). It gathers names and sizes from many people into one quote, which the shop
  then prices. Wholesale batches use the same idea: the business gathers its retail orders,
  then sends one request with final quantities.
- **Designer repo: none found** (searched 2026-11-14: `origin/main`, every remote branch,
  PRs and issues in both repos, for `preorder`, `pre-order`, `kelty`).
- **What the Kelty work actually is: a manual batch process, outside both repos.** A
  monthly-batch brand customer sends a spreadsheet built from a June's Tees template (one
  garment and one design per sheet, one row per item, rows sharing an order number ship as
  one package). The shop prices the batch on the final counts, and a local converter turns
  the sheet into a Shippo bulk-label CSV. The template and converter live on the owner's
  Mac, not in a repo.
- **Gaps that matter for wholesale preorder batches:**
  - The deposit is always 50% of the whole quote (`depositFor`). The batch terms ask for
    the deposit plus all shipping up front, so today that is handled by hand.
  - `/admin/shipping` buys one label per job (one `ship_to`). A batch shipped to many
    retail customers needs Shippo's bulk import or a new batch-shipping build.
- **Conclusion for Workstream C:** there is no preorder code to reuse. A wholesale batch is
  one production request with final quantities (what the connector already takes). Collecting
  the retail preorders is Biz Dashboard's job. Ship-to-each-customer batches are a separate,
  later build and need the owner's say on deposit and shipping terms.

## 4. Integrations that can affect live orders

| Integration | What it touches | Failure handling today |
|---|---|---|
| Stripe | checkout, banking, refunds, disputes, payouts | signed webhook + hourly sweeps; idempotent on Stripe ids |
| Brevo | every email (transactional API), contacts, one CRM deal per quote, lifecycle events | Resend fallback for sends; credit-balance check; hourly catch-up for contacts and deals; breach monitor |
| Twilio | order texts, consent | status callbacks recorded |
| design.jtees.net | studio orders, partner codes, carts, consent | internal key; feed read on demand |
| Cloudinary | artwork, proofs, photos | signed uploads |
| SinaLite / Signs365 / S&S | supplier prices and orders | supplier sync step |
| Shippo (designer), Clover (rarely used), Google Ads/Analytics | shipping labels, card reader, reporting | — |

## 5. Background jobs

Hourly `runSweep`, in this order: studio hourly job, stripe payments, stripe refunds, stripe
disputes, stripe payouts, review asks, review follow-ups, quote follow-ups, deposit reminders,
balance reminders, pickup reminders, reintro emails, reorder nudges, partner code uses, expire
quotes, monthly costs, job costs, daily digest, team watch list, unanswered leads, hiring round 2,
tax check, brevo breach check, brevo catch-up, **brevo opt-out sync (new)**, brevo quote
catch-up, brevo quote re-sync, delivery reconcile, google analytics, google ads, broken links,
error digest, supplier sync, SinaLite reminder, daily summary.

Shorter timers: job costs (5 min), chat alerts (5 min), design follow-ups (30 min),
notifications (2 min), task flow (10 min), **wholesale (2 min, new; does nothing while off)**.

## 6. Webhooks in

`/webhooks/stripe` (signed; checkout completed/expired/async, charge
succeeded/captured/refunded, refund updated, disputes, payout failed), `/webhooks/twilio/sms`,
`/webhooks/twilio/status`, `/webhooks/tawk`, `/webhooks/clover`,
`/webhooks/brevo/inbound/:secret`.

## 7. Quote statuses

`draft`, `held` (hidden from the customer) → `sent` / `viewed` → `accepted` → paid (by
ledger, not a status) → stamps on the job board; `expired`; `cancelled`. Money state is always
read from the ledger rollup, never from the status.

## 8. Email marketing (baseline)

- Five follow-ups (quote, deposit, balance, review, reorder) run in the backend. Each fires once,
  guarded by a stamp column, and skips unsubscribed addresses.
- `/admin/campaign`: reintro + Partners invite, started by hand, once per address, daily cap 200,
  sent to every Brevo contact not blocked or already a partner (an opt-out basis).
- Opt-outs: `email_optouts`, checked before every marketing send. **They were not sent to
  Brevo** (fixed on this branch). There was **no record of email marketing consent**; only text
  consent was recorded.
- Synced attributes: `LIFETIME_VALUE`, `ORDERS_COUNT`, `LAST_PAID_AT`, `LAST_QUOTE_AT`,
  `JOB_SUMMARY`, `QUOTE_*`. Events: `jt_quote_sent`, `jt_quote_accepted`, `jt_deposit_paid`,
  `jt_paid_in_full`. Templates #91–95 are unused.
- Marketing calendar: `tools/lib/marketing-calendar.js`, with a "send Brevo campaign" date 6
  weeks before each season.

## 9. What Biz Dashboard may use

Only `/api/wholesale/v1/*` (`docs/wholesale-api-v1.md`), with its own per-business key.
**Never** the internal-key endpoints, the admin pages or the job board.

## 10. Licensing

The Lumise designer is licensed for June's Tees' own install. Nothing in the wholesale
connector uses it. Offering it to other businesses needs written confirmation of the
license terms first.

## 11. Payments and reliability (Workstream E), checked 2026-11-14

Each issue in the brief, against current `main`. "Covered" means a fix is in place and the
named tests assert it; all of them pass.

| Reported issue | Where it is handled | Tests |
|---|---|---|
| Payment handoff failures | Webhook and return page call the same `bankStripeSession`; the webhook answers only after the work, so a failed write is retried by Stripe for ~3 days | `stripe-webhook-ack`, `paid-after-cancel` |
| Orders without verified payment | Banking requires `payment_status === 'paid'`; the designer's `success.php` no longer marks orders paid; `placeorder.php` removed | `paid-after-cancel`, `customer-sms`, `board-orders-feed` |
| Quote form losing changes | Quote form save lock and per-form key; reopen restores every field | `quote-edit-retains`, `quote-size-restore`, `quote-addon-restore` |
| Quotes that cannot be resumed | Pressing Pay again closes the old card page and makes a new one (`expireCheckoutSession`) | `paid-after-cancel` |
| Missing customer quote notes | `customer_note` carried from the designer and the quote page | `quote-customer-notes`, `order-customer-note` |
| Duplicate orders / payments | `quote_payments.ext_ref` unique index; manual-payment minute key; size-link and lead dedupe | `quote-overpay`, `stripe-outside-checkout`, `unlinked-payments` |
| Missing notifications | Payment alerts never swallow a failure; unlinked money recorded then alerted | `brevo-credits`, `unlinked-payments`, `notifications` |
| Unreconciled Stripe webhooks | Hourly sweeps book charges, refunds, disputes and failed payouts the webhook missed | `stripe-refunds`, `stripe-disputes`, `stripe-outside-checkout`, `stripe-payment-visibility` |
| Failed background sync | Brevo contacts/deals retried with caps and give-up reports | `brevo-quote-sync`, `brevo-contacts`, `brevo-breach-monitor` |

**Audit trail.** Back-office changes go to `staff_activity` (who, route, result) and
`snapshotQuote` keeps the quote row before each manual payment, cancel, restore and settle
(`quote_revisions`). The ledger (`quote_payments`) records the provider's ids. **Gap fixed
on `wholesale-phase2`:** Stripe-driven changes had no History line and failed webhook
deliveries had no record; see ROADMAP Workstream E.

**Not checked:** live incidents. Railway logs need `railway login`; the Stripe dashboard
needs sign-in. Bring a specific order or date and it can be traced end to end.

