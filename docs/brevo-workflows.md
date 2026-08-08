# Customer follow-up — what runs, and where it lives

**Correction, 2026-08-08.** An earlier version of this file was a click-path for
building five workflows in Brevo's Automation UI. Three of them already existed
in the app and had been running all along; the other two were 30 lines each in
the same pattern. **All five now live in `server.js` and need no Brevo UI at
all.**

Nothing here needs configuring. This file exists so you know what the shop is
sending on your behalf, and how to change it.

---

## The five sequences

All run from the hourly sweep in `server.js` (`runSweep`, ~line 7495). Every one
of them: selects at most 20 rows, **stamps the row before sending** so a failure
cannot re-fire on the next pass, skips anyone who has unsubscribed, and logs
errors without throwing.

| # | Sequence | Fires when | Tunable | Function |
|---|---|---|---|---|
| 1 | **Quote follow-up** | 3 days after a quote goes unaccepted, while it is still valid | `JT_QUOTE_FOLLOWUP_DAYS` | `sendQuoteFollowUps` |
| 2 | **Deposit reminder** | 2 days after acceptance with nothing paid | `JT_DEPOSIT_NUDGE_DAYS` | `sendDepositReminders` |
| 3 | **Balance reminder** | 7 days after a deposit, balance still outstanding | `JT_BALANCE_NUDGE_DAYS` | `sendBalanceReminders` |
| 4 | **Review request** | after delivery, on the stored due date | — | `sendDueReviewRequests` |
| 5 | **Reorder nudge** | 90 days after paid in full, if they have not been back | `JT_REORDER_NUDGE_DAYS` | `sendReorderNudges` |

Each has a guard column on `quotes` — `followed_up_at`, `deposit_nudged_at`,
`balance_nudged_at`, `reorder_nudged_at` — so a customer gets each message once
and only once. Clearing a column re-arms that message for that job, which is the
supported way to re-send one deliberately.

**Why 1 and 2 matter most.** A quote nobody follows up on is the most common way
a shop loses a job it had already won, and accepted-but-unpaid is the worst state
to sit in: the customer has said yes and the work cannot start.

**Why 3 exists.** A balance is far easier to collect before the goods leave than
after.

**Why 5 skips recent customers.** It excludes anyone with a quote newer than the
one being chased — a live job means they do not need asking, and the email would
read as though we had not noticed.

---

## Changing the timing

Set the env var on the `junesteesnthings-backend` service; no code change:

```
JT_QUOTE_FOLLOWUP_DAYS=3
JT_DEPOSIT_NUDGE_DAYS=2
JT_BALANCE_NUDGE_DAYS=7
JT_REORDER_NUDGE_DAYS=90
```

To stop one entirely, comment out its line in `runSweep` — deliberately a code
change, because silently disabling customer follow-up should not be a one-click
mistake.

---

## What Brevo is still used for

- **Sending.** Every message above goes out through Brevo's transactional API
  (`sendEmail`), so deliverability, the sending domain and the suppression list
  are all still Brevo's.
- **Contact attributes**, kept current by `syncQuoteContact()`: `QUOTE_CODE`,
  `QUOTE_TOTAL`, `BALANCE_DUE`, `QUOTE_STATUS`, `QUOTE_URL`, `LIFETIME_VALUE`,
  `ORDERS_COUNT`, `LAST_PAID_AT`, `LAST_QUOTE_AT`, `JOB_SUMMARY`. Useful for
  segmenting a manual campaign — a one-off promotion to everyone with
  `LIFETIME_VALUE` over some figure, say.
- **Lifecycle events** — `jt_quote_sent`, `jt_quote_accepted`, `jt_deposit_paid`,
  `jt_paid_in_full` — available if you ever want to build something in the
  Automation UI that the app does not do.
- **Templates #91–95** were created for the Brevo-UI version. They are unused
  now (the app sends its own HTML) and can be deleted, or kept as a starting
  point for a manual campaign.

**Keep the sending domain verified.** SPF/DKIM on jtees.net is what keeps all
five sequences out of spam.

---

## SMS, and why it is not a quick win

Several quotes are phone-only and cannot be chased by email at all. US carriers
require a registered toll-free or 10DLC number: 4–6 weeks of approval, a **new**
number (which splits the thread with customers who already text you), and SMS
credits this plan does not carry. The admin already flags phone-only quotes with
a copy-ready message to send from your own phone — that keeps the conversation on
the number people know.
