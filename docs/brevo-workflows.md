# Brevo automation — what is wired, and the five workflows to switch on

Everything a workflow needs is now live and populated. The workflows themselves
have to be clicked together in the Brevo UI: `POST /automation/workflows` returns
404 on this account, so they cannot be created over the API. This is the exact
build list.

---

## What the app already sends you

**Events** (Automations → trigger → "An event is tracked"):

| Event | Fires when |
|---|---|
| `jt_quote_sent` | a quote is created and sent |
| `jt_quote_accepted` | the customer accepts, before any money |
| `jt_deposit_paid` | a payment lands but a balance remains |
| `jt_paid_in_full` | the quote reaches zero outstanding |

**Contact attributes** (for branching and personalisation):

`QUOTE_CODE` · `QUOTE_TOTAL` · `BALANCE_DUE` · `QUOTE_STATUS`
(`new`/`qualifying`/`pending`/`won`/`lost`) · `QUOTE_URL` · `LIFETIME_VALUE` ·
`ORDERS_COUNT` · `LAST_PAID_AT` · `LAST_QUOTE_AT` · `JOB_SUMMARY`

`LIFETIME_VALUE` and `ORDERS_COUNT` are summed from the payment ledger across
every quote for that address, so they survive corrections and refunds.

**Templates** — #91 follow-up · #92 deposit reminder · #93 balance due ·
#94 thanks + review · #95 reorder nudge

**Lists** — 8 open balance · 9 paid customers · 10 repeat customers

---

## The five workflows

### 1. Quote sent, no reply
Trigger `jt_quote_sent` → wait **3 days** → if `QUOTE_STATUS` is `new` → send **#91**.
Exit on `jt_quote_accepted`.

> The single highest-value one. A quote with no follow-up is the most common way
> a small shop loses a job it had already won.

### 2. Accepted, deposit unpaid
Trigger `jt_quote_accepted` → wait **2 days** → if `BALANCE_DUE > 0` → send **#92**
→ wait **4 days** → if still `> 0` → notify yourself to phone them.
Exit on `jt_deposit_paid`.

> Accepted-but-unpaid is the worst state to sit in: they have said yes and you
> cannot start. Two days is soon enough to matter and not pushy.

### 3. Balance before pickup
Trigger `jt_deposit_paid` → wait **7 days** → if `BALANCE_DUE > 0` → send **#93**.

### 4. Thanks + review
Trigger `jt_paid_in_full` → wait **3 days** → send **#94** → add to list **9**.

> Three days, not immediately — ask once they have the shirts in hand, not when
> the money clears.

### 5. Reorder nudge
Trigger: contact in list **9** and `LAST_PAID_AT` more than **90 days** ago →
send **#95** → if `ORDERS_COUNT >= 2` add to list **10**.

> Repeat business from existing customers is the cheapest revenue you have. The
> artwork is already on file, so there is no setup cost to redo.

---

## Set once, in Settings

- **Sending domain**: jtees.net must stay SPF/DKIM verified or these land in spam.
- **Unsubscribe**: required on all five. The app already suppresses unsubscribes
  for its own mail (`email_optouts`), but Brevo-sent mail obeys Brevo's list.
- **Quiet hours**: do not send before 9am or after 8pm local.
- **Cap**: one automated email per contact per 48h, so two workflows firing
  together cannot double-message somebody.

---

## Worth adding next

- **SMS / WhatsApp** — several quotes are phone-only and cannot be chased by
  email at all. You already collect the numbers.
- **Meetings** — a booking link for consultations, instead of phone tag.
- **Tracking script** on jtees.net — lets a workflow trigger on "viewed the
  quote page twice and did not pay", which is a genuine buying signal.
