# Brevo follow-up — the click path

Everything the workflows depend on is live and populated. What is left cannot be
done over the API (`POST /automation/workflows` returns 404 on this account), so
these are UI steps.

**Build workflow 1 only, and leave the other four until it has fired once.**
One workflow proven end to end is worth more than five configured on trust.

---

## Before you start (2 minutes)

**1. Confirm Automations exists in your account.**
Log in at [app.brevo.com](https://app.brevo.com) and look for **Automations** in
the top nav. If it is not there, stop — nothing below will work, and the fix is a
plan change, not a configuration change. Tell Claude and we will find another
route (the app can send these itself on a timer; it already does the
abandoned-cart and review sequences that way).

**2. Confirm the tracker is on.**
**Automations → Settings → Tracking**. The events the app sends
(`jt_quote_sent` and friends) arrive through the Events API; if tracking is
disabled they are accepted and discarded. Verified 2026-08-08: the API accepts
them (HTTP 204) and every contact attribute below is populated.

---

## Workflow 1 — Quote sent, no reply

*The one that matters. A quote nobody follows up on is the most common way a
small shop loses a job it had already won.*

1. **Automations → Create an automation → Create from scratch**
2. Name it `Quote follow-up — no reply`
3. **Entry point → An event is tracked**
   - Event: paste exactly `jt_quote_sent`
   - Save
4. **+ → Wait** → `3` days
5. **+ → Condition → A contact detail**
   - Attribute: `QUOTE_STATUS`
   - Operator: **is equal to**
   - Value: `new`
   - *(`QUOTE_STATUS` is one of `new` / `qualifying` / `pending` / `won` / `lost`.
     Anything past `new` means they replied, so they drop out here.)*
6. **On the YES branch → + → Send an email**
   - Template: **#91 — JT — Quote follow-up (no reply)**
7. **On the NO branch → End**
8. **Settings (gear, top right)**
   - "Allow contacts to enter this automation more than once" → **ON**
     *(a returning customer gets a second quote later; without this they are
     followed up once, ever)*
9. **Turn it on** (toggle, top right)

### Proving it works

Send a real quote today. Within a minute the contact should show
`jt_quote_sent` on their timeline (**Contacts → the contact → Activity**), and
the automation's **Statistics** tab should show 1 contact entered. The email
itself is due 3 days later — check back then rather than assuming.

---

## The other four (build after 1 has fired)

Same shape each time: entry point, wait, condition, send.

| # | Name | Entry event | Wait | Condition | Template |
|---|---|---|---|---|---|
| 2 | Accepted, deposit unpaid | `jt_quote_accepted` | 2 days | `BALANCE_DUE` greater than `0` | **#92** |
| 3 | Balance before pickup | `jt_deposit_paid` | 7 days | `BALANCE_DUE` greater than `0` | **#93** |
| 4 | Thanks + review | `jt_paid_in_full` | 3 days | — | **#94** |
| 5 | Reorder nudge | `jt_paid_in_full` | 90 days | `ORDERS_COUNT` ≥ `1` | **#95** |

Notes that matter:

- **2** should also exit on `jt_deposit_paid`, so somebody who pays on day 1 is
  never chased on day 2. Add it under **Settings → Exit conditions**.
- **4** waits 3 days on purpose — ask for a review once they have the shirts in
  hand, not when the money clears.
- **5** is the cheapest revenue you have: their artwork is already on file, so a
  reorder costs you no setup.

---

## What the app already sends

**Events** (Automations → trigger → "An event is tracked"):

| Event | Fires when |
|---|---|
| `jt_quote_sent` | a quote is created and sent |
| `jt_quote_accepted` | they accept, before any money |
| `jt_deposit_paid` | a payment lands but a balance remains |
| `jt_paid_in_full` | the quote reaches zero outstanding |

**Contact attributes** (for conditions and personalisation):

`QUOTE_CODE` · `QUOTE_TOTAL` · `BALANCE_DUE` · `QUOTE_STATUS` · `QUOTE_URL` ·
`LIFETIME_VALUE` · `ORDERS_COUNT` · `LAST_PAID_AT` · `LAST_QUOTE_AT` ·
`JOB_SUMMARY`

`LIFETIME_VALUE` and `ORDERS_COUNT` are summed from the payment ledger across
every quote for that address, so they survive corrections and refunds.

**Templates** — #91 follow-up · #92 deposit reminder · #93 balance due ·
#94 thanks + review · #95 reorder nudge

**Lists** — 8 open balance · 9 paid customers · 10 repeat customers

---

## Set once, in Settings

- **Sending domain** — jtees.net must stay SPF/DKIM verified or these land in spam.
- **Unsubscribe** — required on all five. The app suppresses unsubscribes for its
  own mail (`email_optouts`), but Brevo-sent mail obeys Brevo's own list.
- **Quiet hours** — nothing before 9am or after 8pm local.
- **Frequency cap** — one automated email per contact per 48h, so two workflows
  firing together cannot double-message somebody.

---

## Worth knowing

**SMS is not a quick win here.** Several quotes are phone-only and cannot be
chased by email at all, but US carriers require a registered toll-free or 10DLC
number: 4–6 weeks of approval, a *new* number (which splits the thread with
customers who already text you), and SMS credits this plan does not carry. The
admin already flags phone-only quotes with a copy-ready message to send from
your own phone — that keeps the conversation on the number people know.
