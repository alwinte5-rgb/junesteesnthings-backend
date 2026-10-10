'use strict';

/* The Bookkeeper course: the eight hours the bookkeeper walks before closing
   a month on their own (owner, 2026-10-09).

   What the course teaches comes from what the shop already wrote down or
   built: the "Keeping the books" SOP in the Playbook, the Finances page
   (overheads that roll forward, estimated job costs, the sales tax position,
   the expenses and tax exports), the refund, dispute and payout handling,
   the Illinois ST-1 reminder emails and the exemption certificate rules
   (tools/lib/tax-certificates.js). Anything only the owner knows is written
   "[owner to fill in: ...]", which the Training page's "Playbook gaps" card
   asks her for. */

const TEAM = require('./shared-team');

const A = {
  money:    'Bookkeeper course 2a: Where our money comes from',
  page:     'Bookkeeper course 2b: The Finances page',
  expenses: 'Bookkeeper course 3a: Expenses and receipts',
  jobcosts: 'Bookkeeper course 3b: Job costs',
  refunds:  'Bookkeeper course 4a: Refunds and disputes',
  outside:  'Bookkeeper course 4b: Payouts and money taken by hand',
  tax:      'Bookkeeper course 5a: Illinois sales tax',
  exempt:   'Bookkeeper course 5b: Exempt sales and certificates',
  close:    'Bookkeeper course 6a: The month-end close',
  recon:    'Bookkeeper course 6b: Reconciling to zero',
  report:   'Bookkeeper course 7a: The monthly summary for June',
  safe:     'Bookkeeper course 7b: Safety, questions and quiet time',
};

const GLOSSARY = {
  'gross sales': 'What customers paid us, before any fees. Sales are recorded at this figure.',
  'payout': 'Money the card processor sends from its balance to our bank, usually several payments at once.',
  'reconcile': 'Match every line in our records to the statement, until the difference is zero.',
  'in transit': 'Money that has left one account and not yet reached the other, such as a payout on its way to the bank.',
  'dispute': 'A customer asking their card issuer to reverse a payment. Also called a chargeback.',
  'exemption certificate': 'The document that lets a buyer (a school, church, charity or reseller) not pay sales tax.',
  'st-1': 'The Illinois sales and use tax return, filed monthly and due on the 20th.',
  'overheads': 'Costs we pay whatever we sell: rent, utilities, software, insurance.',
  'job cost': 'What one order cost us to make: blanks, printing, screens, embroidery.',
  'profit and loss': 'Sales minus costs for a period: what the business made or lost.',
};

const MODULES = [
  /* ── 1 ── */
  TEAM.MODULE,

  /* ── 2 ── */
  {
    key: 'b2', icon: '💵', title: 'Where the money comes from, and the Finances page',
    goal: 'Know every way money reaches us, how sales and fees are recorded, and what the Finances page shows.',
    lessons: [{
      id: 'b2-money', article: A.money, minutes: 20, tags: 'bookkeeping, sales, gross, fees, stripe, paypal, cash, deposits, payouts, accounts',
      goals: ['List the ways customers pay us', 'Record sales gross and fees as an expense', 'Follow one order from payment to the bank'],
      images: [{ src: '/assets/images/work/storefront-lincoln-ave.jpg', alt: 'Our shop: the books follow every order made here' }],
      body:
`You keep the record of every dollar that comes in and goes out, so June knows what the business really makes and the state gets exactly what it is owed.

**How customers pay us**

- **Card payments on quotes:** a customer accepts a quote and pays online through Stripe. Many pay a deposit first and the balance later, so one order can have several payments
- **Online orders from the design studio:** also paid by card through Stripe
- **Payments taken by hand:** cash, a check, a charge June made in the Stripe dashboard, or a payment app. Staff record these on the order
- Every account money moves through: [owner to fill in: every account money comes into or goes out of: bank, cards, Stripe, PayPal, cash]

**Sales are gross; fees are an expense**

A customer pays $100 by card. Stripe keeps about $3 and sends us $97. In the books:

- **Sales: $100**, what the customer paid
- **Fees: $3**, an expense in the Fees category
- Never record the sale as $97. Taking fees off sales hides what card fees really cost us in a year

**From payment to the bank**

Stripe does not send each payment to the bank on its own. It collects them and sends a **payout**: one deposit covering several payments, minus their fees and any refunds. So:

- One bank deposit is often many orders
- To match a deposit, open the payout in Stripe: it lists every payment, fee and refund inside it
- A payout on its way is **in transit**, not missing

**The order is the anchor**

Every payment, refund and dispute belongs to an order (a quote code like AB12CD, or a design studio order number). When something cannot be linked to an order, it is not wrong yet, but it needs an answer before the month closes.`,
    }, {
      id: 'b2-page', article: A.page, minutes: 20, tags: 'bookkeeping, finances page, break-even, overheads, job costs, sales tax position, month by month, export, csv',
      goals: ['Read each card on the Finances page', 'Pick a month or a whole year', 'Export what you need'],
      body:
`The Finances page is where the shop's own records add up: sales, overheads, job costs and sales tax, by month. June owns it, and only she can change anything on it. How you see it: [owner to fill in: how the bookkeeper sees the Finances page figures and exports]

**Choosing the period**

The page opens on this month. The menu by the title picks another month, or "All of" a year for the table and chart of the whole year.

**What each card shows**

- **Sales against break-even:** this month's sales against what we must sell to cover our overheads
- **Overheads:** the monthly costs (rent, software, phone). Costs ticked as monthly copy themselves into each new month, on the same day. Unticking the latest one stops it; deleting one month's copy is remembered, so it does not come back
- **Job costs:** what each accepted job cost to make. Most are estimated automatically from supplier prices and our print price sheets, and marked as estimated. Jobs it could not cost are listed for someone to fill in on the job page
- **Receipts with the tax still to work out:** money received that is not yet linked to anything that says how much of it is sales tax. A month with any of these cannot be filed with confidence
- **Untaxed sales with no exemption number:** sales where no tax was charged and no certificate is on file. Each needs a certificate or an explanation
- **Sales tax position:** tax collected per month, what was paid to the state, and what is still owed
- **Month by month:** the year at a glance

**Exports**

The expenses and the sales tax records download as CSV files. The tax export uses the tax worked out when each payment arrived, so it matches the Sales tax position card even if a quote was edited later.

**What it is not**

The Finances page is not the bank statement. It shows what our system recorded. Your job each month is to prove the two agree (Module 6).`,
    }],
    practice: [],
    quiz: {
      key: 'books-2', title: 'Module 2 quiz: where the money comes from', minutes: 10,
      questions: [
        { id: 'gross', q: 'A customer pays $200 by card and Stripe keeps $6. Sales are recorded as…',
          choices: ['$194', '$200, with $6 in Fees', '$206', '$6'],
          answer: 1, article: A.money, why: 'Sales are gross; fees are an expense.' },
        { id: 'payout', q: 'One bank deposit from Stripe is usually…',
          choices: ['One order', 'A payout covering several payments, minus fees and refunds', 'A refund', 'A loan'],
          answer: 1, article: A.money, why: 'Open the payout in Stripe to see what is inside.' },
        { id: 'transit', q: 'A payout has left Stripe but is not in the bank yet. It is…',
          choices: ['Missing', 'In transit', 'A dispute', 'Income twice'],
          answer: 1, article: A.money, why: 'In transit, not missing.' },
        { id: 'several', q: 'Why can one order have several payments?',
          choices: ['It is an error', 'Many customers pay a deposit, then the balance', 'Stripe splits them', 'Taxes'],
          answer: 1, article: A.money, why: 'Deposit first, balance later.' },
        { id: 'anchor', q: 'Every payment, refund and dispute belongs to…',
          choices: ['A month only', 'An order', 'A customer\'s email', 'Nothing'],
          answer: 1, article: A.money, why: 'The order is the anchor.' },
        { id: 'owner', q: 'Who owns the Finances page?',
          choices: ['Anyone on the team', 'June', 'Customers', 'Stripe'],
          answer: 1, article: A.page, why: 'June owns it; a bookkeeper can be given read-only access.' },
        { id: 'roll', q: 'A cost is ticked as monthly. What happens next month?',
          choices: ['Nothing', 'It copies itself into the new month on the same day', 'It is deleted', 'It doubles'],
          answer: 1, article: A.page, why: 'Monthly overheads roll forward on their own.' },
        { id: 'estimated', q: 'A job cost marked "estimated" came from…',
          choices: ['The customer', 'Supplier prices and our print price sheets', 'A guess by sales', 'Last year'],
          answer: 1, article: A.page, why: 'Check estimates against real invoices.' },
        { id: 'untaxed', q: '"Untaxed sales with no exemption number" lists sales that…',
          choices: ['Are fine', 'Need a certificate or an explanation', 'Were refunded', 'Are next month\'s'],
          answer: 1, article: A.page, why: 'No tax and no certificate is a problem to solve.' },
        { id: 'bank', q: 'The Finances page and the bank statement…',
          choices: ['Are the same thing', 'Must be proved to agree, every month', 'Never agree', 'Do not matter'],
          answer: 1, article: A.page, why: 'Reconciling proves our records match the bank.' },
      ],
    },
    buffer: 7,
  },

  /* ── 3 ── */
  {
    key: 'b3', icon: '🧾', title: 'Expenses, receipts and job costs',
    goal: 'Record every cost once, in the right category, with a receipt, and keep job costs honest.',
    lessons: [{
      id: 'b3-expenses', article: A.expenses, minutes: 20, tags: 'bookkeeping, expenses, receipts, categories, contract labor, personal card, recurring',
      goals: ['Record an expense with a receipt and a category', 'Handle a cost paid on a personal card', 'Record contractor pay correctly'],
      body:
`An expense without a receipt is a guess, and a guess is what an auditor or the tax office will question first.

**Every expense needs**

- **The date** it was paid
- **The amount**, exactly as on the receipt
- **Who was paid** (the vendor)
- **A category** from our fixed list: Rent, Utilities, Materials, Equipment, Software, Insurance, Marketing, Vehicle, Fees, Contract labor, Other. A fixed list means totals add up; a category typed three ways cannot be totalled
- **A receipt**, kept here: [owner to fill in: where receipts are kept]
- A short note when it is not obvious ("vinyl for the reunion banner")

**Choosing the category**

- Blank shirts, ink, transfers, vinyl, thread: **Materials**
- A heat press, a printer: **Equipment**
- Card processing and bank fees: **Fees**
- Ads: **Marketing**
- Helpers and freelancers, including paid hiring tests: **Contract labor**, with the person's name
- Use **Other** rarely. If you use it twice for the same thing, ask June whether it deserves a category

**No receipt?**

1. Search email for the vendor or the amount
2. Check the supplier's account (most let you download invoices)
3. Ask June, saying what you already checked

Never guess an amount or invent a receipt. A cost you cannot prove is listed as missing until it is found.

**Paid on a personal card**

A business cost paid on someone's own card is still a business cost. Record it with a note of who paid, so June can pay them back or treat it as money she put in.

**Monthly costs**

Rent, software and the phone repeat. Tick them as monthly once, and they copy themselves into each new month. Each month, check every copy was really paid at that amount. A price rise or a cancelled subscription must be changed, not left to roll forward.

**Never twice**

Before adding an expense, check it is not already there: a monthly copy, a supplier invoice already entered, or a cost someone else recorded. Two entries for one cost make profit look smaller than it is.`,
    }, {
      id: 'b3-jobcosts', article: A.jobcosts, minutes: 20, tags: 'bookkeeping, job costs, estimated, supplier invoices, s&s, anchorfish, margin',
      goals: ['Read a job\'s costs and how they were worked out', 'Replace estimates with real invoice amounts', 'Spot a job that lost money'],
      images: [{ src: '/assets/images/work/screen-printing-press.jpg', alt: 'The press: each job\'s cost is blanks, printing and setup' }],
      body:
`Sales tell June what came in. Job costs tell her whether each job made money. Without them, a busy month can still be a losing one.

**What a job costs**

- **Blank garments** from our supplier
- **Printing or embroidery**, at the rates on our contract price sheets
- **Setup:** screens for screen printing, digitizing for embroidery
- **Anything else** bought for that job: a banner, cutouts, signs

**How the costs get there**

Every accepted job with no costs is estimated automatically: garments at the supplier's price from our catalogue, printing from our price sheets, and anything it cannot match roughly from the price. Each estimated line is marked as estimated.

The estimate is a starting point, not the real cost.

**Making them real**

When the supplier's invoice arrives:

1. Find the job (by its quote code) and open its costs on the job page
2. Compare each line with the invoice
3. Change the amounts to what we actually paid
4. Note anything unusual: a substitute shirt, a reprint, extra shipping

Jobs the system could not cost at all are listed on the Finances page. Fill those in from the invoices.

**Reading the result**

A job's margin is its sale price, before tax, minus its costs. Watch for:

- A job that cost more than it sold for: tell June, with what drove it (a reprint, rush shipping, a wrong price)
- The same kind of job always making less than others: June may need to change a price
- A supplier invoice for a job that does not exist, or twice for one job

You do not change prices or quotes. You show June the numbers; she decides.`,
    }],
    practice: [
      { key: 'signoff:books-receipts', type: 'signoff', minutes: 5,
        title: 'Records expenses with receipts and the right category', hint: 'June checks a week of your entries: every one with a receipt, the right category, no duplicates, and personal-card costs noted.' },
    ],
    quiz: {
      key: 'books-3', title: 'Module 3 quiz: expenses, receipts and job costs', minutes: 10,
      questions: [
        { id: 'needs', q: 'Which does every expense need?',
          choices: ['Only an amount', 'Date, amount, vendor, category and a receipt', 'A customer name', 'June\'s signature'],
          answer: 1, article: A.expenses, why: 'All five, plus a note when not obvious.' },
        { id: 'ink', q: 'Ink and blank shirts go under…',
          choices: ['Equipment', 'Materials', 'Other', 'Fees'],
          answer: 1, article: A.expenses, why: 'Materials.' },
        { id: 'stripe', q: 'Card processing fees go under…',
          choices: ['Fees', 'Marketing', 'Materials', 'Other'],
          answer: 0, article: A.expenses, why: 'Fees.' },
        { id: 'test', q: 'A paid hiring test for an applicant is…',
          choices: ['Marketing', 'Contract labor, with their name', 'Other', 'Not recorded'],
          answer: 1, article: A.expenses, why: 'Contractor pay, including paid tests.' },
        { id: 'noreceipt', q: 'A $48 charge has no receipt. First you…',
          choices: ['Guess what it was', 'Search email and the supplier account, then ask June', 'Delete it', 'Record it as Other'],
          answer: 1, article: A.expenses, why: 'Never guess or invent a receipt.' },
        { id: 'personal', q: 'June paid for ink on her own card. You…',
          choices: ['Leave it out', 'Record it as a business cost, noting who paid', 'Record it as a sale', 'Ask the supplier'],
          answer: 1, article: A.expenses, why: 'Still a business cost.' },
        { id: 'roll', q: 'A software subscription went up from $20 to $25. The monthly copy says $20. You…',
          choices: ['Leave it', 'Change it to what was really paid', 'Delete it', 'Add a second one'],
          answer: 1, article: A.expenses, why: 'Check each copy against what was paid.' },
        { id: 'estimate', q: 'A job cost is marked estimated. When the invoice arrives you…',
          choices: ['Leave the estimate', 'Change it to what we actually paid', 'Delete the job', 'Double it'],
          answer: 1, article: A.jobcosts, why: 'The estimate is a starting point.' },
        { id: 'margin', q: 'A job\'s margin is…',
          choices: ['Total including tax', 'Sale price before tax minus its costs', 'Costs only', 'The deposit'],
          answer: 1, article: A.jobcosts, why: 'Tax is the state\'s, not ours.' },
        { id: 'loss', q: 'A job cost more than it sold for. You…',
          choices: ['Change the price on the quote', 'Tell June what drove it', 'Hide it', 'Charge the customer more'],
          answer: 1, article: A.jobcosts, why: 'You show the numbers; June decides.' },
      ],
    },
    buffer: 7,
  },

  /* ── 4 ── */
  {
    key: 'b4', icon: '↩️', title: 'Refunds, disputes and payouts',
    goal: 'Know how money going back out is recorded, and spot money that has stopped arriving.',
    lessons: [{
      id: 'b4-refunds', article: A.refunds, minutes: 20, tags: 'bookkeeping, refunds, partial refund, failed refund, disputes, chargebacks, closed month',
      goals: ['Record a refund in the month it happens', 'Treat an open dispute correctly', 'Book a lost dispute and its fee'],
      body:
`Money going back to customers has to be as exact as money coming in, and it has to land in the right month.

**Refunds**

- A refund is recorded **when it happens**, linked to its order. Refunds made through Stripe are picked up automatically and rebuilt from Stripe's own list, so a refund made in two parts is counted once each, not twice
- A refund lowers sales for the month it happened in, not the month of the original sale
- **A closed month is never changed.** A refund in November for an October sale belongs to November
- A refund can **fail** at the customer's bank days or weeks later. The system takes it back off when Stripe reports it; when you see one, tell June: the customer has not got their money
- Sales tax on a refunded sale comes back off too (Module 5)

Why a refund happened is June's business, not the books'. After a refund, the automatic payment reminders stop for that order; anything still owed is chased by hand.

**Disputes (chargebacks)**

A customer can ask their card issuer to reverse a payment. The money is taken while the dispute runs, and the shop may win or lose.

- An **open** dispute is recorded from the day it opens, on its order. It is not a refund yet: the shop may win
- While a dispute is open, nobody sends that customer reminders for money, reviews or reorders. Those can be used against us
- **Won:** nothing changes in sales
- **Lost:** recorded like a refund in the month it was lost, with its tax back out
- Stripe's **dispute fee** is an expense in Fees, whatever the result

Tell June the day a dispute opens. She decides how to answer it, and there is a deadline.

**Partial refunds**

A customer gets $40 back on a $400 order. Sales for that month go down by $40, and the order still shows $360 paid. Check that the order, Stripe and the books all say the same.`,
    }, {
      id: 'b4-outside', article: A.outside, minutes: 20, tags: 'bookkeeping, payouts, failed payout, stripe dashboard, manual payment, cash, check, double counting',
      goals: ['Spot a failed payout', 'Record money taken outside our checkout once', 'Avoid counting one payment twice'],
      body:
`Two things go wrong quietly: money that stops reaching the bank, and money recorded twice.

**Failed payouts**

When Stripe cannot send a payout to the bank (wrong details, a closed account), the money goes back to the Stripe balance, and later payouts can stop until it is fixed. Sales still look perfect, because customers paid. Only the bank shows the gap.

- The shop gets an email alert for a failed payout, and an hourly check looks for them
- Each week, compare Stripe's payouts with the bank deposits. A payout marked paid that never arrived, or no payouts for days in a busy week, is a problem
- Tell June the same day. Only she can change the bank details

**Money taken outside our checkout**

Some payments do not come through the quote or studio checkout: a phone order June charged in the Stripe dashboard, a Stripe invoice, cash, a check.

- Card payments made in Stripe are picked up automatically, and recorded as payments not yet linked to an order
- Cash and checks are recorded by hand on the order, by whoever took them, and go in the cash log

**Never twice**

The risk with money taken by hand is recording it again. When someone records a payment on an order:

- If the system already holds a matching Stripe payment with no order, link that one, rather than typing a new payment
- A cash payment is recorded once, on the order, and once in the cash log, which is the same money, not two
- When an order shows more paid than its total, something was recorded twice, or the customer overpaid. Flag it to June; never quietly fix it

**Unlinked payments**

At month end, every payment not linked to an order needs one: find the order, or ask June what it was. A payment nobody can explain is not income yet; it is a question.`,
    }],
    practice: [],
    quiz: {
      key: 'books-4', title: 'Module 4 quiz: refunds, disputes and payouts', minutes: 10,
      questions: [
        { id: 'month', q: 'An October sale is refunded on November 3. The refund goes in…',
          choices: ['October', 'November', 'Both', 'Neither'],
          answer: 1, article: A.refunds, why: 'A closed month is never changed.' },
        { id: 'failed', q: 'A refund failed at the customer\'s bank. You…',
          choices: ['Ignore it', 'Tell June: the customer has not got their money', 'Refund twice', 'Close the order'],
          answer: 1, article: A.refunds, why: 'The system takes it back off; June must know.' },
        { id: 'open', q: 'An open dispute is…',
          choices: ['A refund', 'Recorded from the day it opens, but not a refund yet', 'Ignored until it closes', 'A sale'],
          answer: 1, article: A.refunds, why: 'The shop may win.' },
        { id: 'reminders', q: 'While a dispute is open, that customer gets…',
          choices: ['Payment reminders', 'No reminders for money, reviews or reorders', 'A discount', 'A call from sales'],
          answer: 1, article: A.refunds, why: 'Reminders can be used against us.' },
        { id: 'fee', q: 'Stripe\'s dispute fee is…',
          choices: ['Only charged if we lose', 'An expense in Fees, whatever the result', 'A refund', 'Sales'],
          answer: 1, article: A.refunds, why: 'Fees, win or lose.' },
        { id: 'partial', q: '$40 refunded on a $400 order. The order shows…',
          choices: ['$0 paid', '$360 paid', '$440 paid', '$400 paid'],
          answer: 1, article: A.refunds, why: 'Order, Stripe and books all agree.' },
        { id: 'payout', q: 'Why does a failed payout not show in sales?',
          choices: ['It does', 'Customers paid; only the bank shows the gap', 'It is a refund', 'It is a fee'],
          answer: 1, article: A.outside, why: 'Compare payouts with bank deposits weekly.' },
        { id: 'bank', q: 'Who can change the bank details for payouts?',
          choices: ['You', 'June', 'Sales', 'Stripe support'],
          answer: 1, article: A.outside, why: 'Tell June the same day.' },
        { id: 'link', q: 'A phone order charged in Stripe shows as a payment with no order. You…',
          choices: ['Type a new payment on the order', 'Link that payment to its order', 'Delete it', 'Record it as Other'],
          answer: 1, article: A.outside, why: 'Linking, not retyping, avoids counting it twice.' },
        { id: 'over', q: 'An order shows more paid than its total. You…',
          choices: ['Fix it quietly', 'Flag it to June', 'Refund the difference', 'Ignore it'],
          answer: 1, article: A.outside, why: 'Recorded twice or overpaid: June decides.' },
      ],
    },
    buffer: 7,
  },

  /* ── 5 ── */
  {
    key: 'b5', icon: '🏛️', title: 'Sales tax',
    goal: 'Know what tax we collect, whose money it is, when it is due, and when a sale may be exempt.',
    lessons: [{
      id: 'b5-tax', article: A.tax, minutes: 25, tags: 'bookkeeping, sales tax, illinois, st-1, due 20th, set aside, tax position, export',
      goals: ['Explain why collected tax is not our money', 'Prepare a month\'s figures for the ST-1', 'Clear receipts with tax still to work out'],
      body:
`Sales tax is the state's money. We collect it from customers and hold it until we pay it over. Treat it like money in someone else's envelope.

**What we collect**

Taxable sales in Illinois are charged sales tax on the quote or at checkout. When a payment arrives, the system works out how much of it is tax and stores that figure with the payment. That stored figure is what we report, even if the quote is edited later.

**When it is due**

We file the Illinois **ST-1** for each month. It is due on the **20th of the next month**. A late return costs a penalty and interest.

The shop gets reminder emails:

- When a month closes: how much tax to set aside
- A few days before the 20th
- The day before, if it is still unpaid

Who files and pays it: [owner to fill in: who files the ST-1 and pays it, and from which account]

**Setting it aside**

When the month closes, the tax collected that month is not income. It should be set aside the same week, so it is there on the 20th. The Sales tax position card shows, for each month, what was collected, what was paid, and what is still owed.

**Preparing a month's figures**

1. Open the month on the Finances page and download the sales tax export
2. Total taxable sales, exempt sales (with their certificates) and tax collected
3. Take refunds in that month back out, with their tax
4. Clear the "Receipts with the tax still to work out" card for that month: each needs linking to its order, or June's answer. A month with any of these cannot be filed with confidence
5. Check "Untaxed sales with no exemption number" (next lesson)
6. Send June the figures, and anything you could not settle

**What you never do**

- Change a stored tax figure to make a month add up
- Treat collected tax as profit
- Decide on your own that a sale was exempt`,
    }, {
      id: 'b5-exempt', article: A.exempt, minutes: 25, tags: 'bookkeeping, tax exempt, exemption certificate, e number, crt-61, resale, schools, churches, approval',
      goals: ['Know when a sale may be tax-free', 'Check a certificate is on file for each exempt sale', 'Chase what is missing'],
      images: [{ src: '/assets/images/work/kindergarten-back-to-school-tee.jpg', alt: 'A school order: schools are often tax-exempt, with a certificate' }],
      body:
`Schools, churches, charities and resellers often do not pay sales tax. But Illinois only accepts an exempt sale if we can show the buyer's certificate for it. No certificate on file means the tax is owed, by us.

**Who can be exempt**

- **Tax-exempt organisations** (many schools, churches and charities) have an Illinois exemption number that starts with "E"
- **Resellers** who will sell the items on give us a resale certificate (Illinois form CRT-61)
- A customer saying "we are tax-exempt" is not enough. The certificate is

**How the system handles it**

- **Quotes:** the shop attaches the certificate, or the customer uploads it. Payment waits until one is on file
- **Design studio orders:** a customer can upload a certificate at checkout. Tax comes off, and the order waits until June approves the certificate. If she refuses it, the tax is added back and collected with the balance

**Your monthly check**

For every untaxed sale in the month:

1. Is there a certificate on file for that sale, approved, with the holder's name matching the customer?
2. Is it the right kind (an E number for an organisation, a resale certificate for a reseller)?
3. Anything on the "Untaxed sales with no exemption number" card needs a certificate, or June's answer on why no tax was charged

**When a certificate is missing**

- Tell sales or June which order and customer, the same week. The certificate can often still be collected
- Never mark a sale exempt yourself, and never accept a certificate on June's behalf
- If one cannot be found, June decides: collect it, or pay the tax ourselves

**Keeping them**

Certificates stay on file as long as the tax records they support. A certificate covers that customer's purchases while it is valid; check the date and the name on repeat orders.`,
    }],
    practice: [
      { key: 'signoff:books-tax', type: 'signoff', minutes: 5,
        title: 'Prepares a month\'s sales tax figures', hint: 'June checks your figures for one month: taxable and exempt sales, tax collected, refunds taken out, a certificate behind every exempt sale, nothing left unworked.' },
    ],
    quiz: {
      key: 'books-5', title: 'Module 5 quiz: sales tax', minutes: 10,
      questions: [
        { id: 'whose', q: 'Sales tax collected from customers is…',
          choices: ['Our income', 'The state\'s money we hold', 'A fee', 'Profit'],
          answer: 1, article: A.tax, why: 'Set it aside; it is not income.' },
        { id: 'due', q: 'The Illinois ST-1 for September is due…',
          choices: ['September 30', 'October 20', 'December 31', 'Whenever'],
          answer: 1, article: A.tax, why: 'The 20th of the next month.' },
        { id: 'late', q: 'A late ST-1 costs…',
          choices: ['Nothing', 'A penalty and interest', 'Only a letter', 'A refund'],
          answer: 1, article: A.tax, why: 'File and pay on time.' },
        { id: 'stored', q: 'A quote was edited after it was paid. Which tax figure is reported?',
          choices: ['A new calculation from the edited quote', 'The figure stored when the payment arrived', 'An average', 'None'],
          answer: 1, article: A.tax, why: 'The stored figure, so filed months never change.' },
        { id: 'unworked', q: 'A month has receipts with the tax still to work out. You…',
          choices: ['File anyway', 'Link each to its order, or get June\'s answer, first', 'Delete them', 'Guess the tax'],
          answer: 1, article: A.tax, why: 'It cannot be filed with confidence until they are cleared.' },
        { id: 'change', q: 'The tax figures are $3 off. You…',
          choices: ['Change a stored tax figure to fit', 'Find the cause and tell June', 'Ignore it', 'Round it'],
          answer: 1, article: A.tax, why: 'Never change a stored figure to make it add up.' },
        { id: 'say', q: 'A customer says "we\'re tax-exempt" but sent nothing. The sale is…',
          choices: ['Exempt', 'Taxable until a certificate is on file', 'Half taxed', 'Free'],
          answer: 1, article: A.exempt, why: 'The certificate is what counts.' },
        { id: 'e', q: 'An Illinois exemption number for a school or church starts with…',
          choices: ['E', 'X', 'S', '7'],
          answer: 0, article: A.exempt, why: 'The "E" number.' },
        { id: 'reseller', q: 'A shop buying shirts to resell gives us…',
          choices: ['An E number', 'A resale certificate (CRT-61)', 'Nothing', 'A receipt'],
          answer: 1, article: A.exempt, why: 'Resellers use a resale certificate.' },
        { id: 'missing', q: 'An untaxed sale has no certificate. You…',
          choices: ['Mark it exempt', 'Tell sales or June which order, so it can be collected', 'Add tax yourself', 'Ignore it'],
          answer: 1, article: A.exempt, why: 'June decides: collect it, or pay the tax ourselves.' },
      ],
    },
    buffer: 7,
  },

  /* ── 6 ── */
  {
    key: 'b6', icon: '📅', title: 'The month-end close',
    goal: 'Close every month in the first three working days, with every account reconciled to zero.',
    lessons: [{
      id: 'b6-close', article: A.close, minutes: 25, tags: 'bookkeeping, month end, close, statements, receipts, recurring, duplicates, profit and loss',
      goals: ['Close a month in three working days', 'Know what goes in each step', 'Never change a closed month'],
      images: [{ src: '/assets/images/work/family-reunion-bulk-order.jpg', alt: 'A busy month of orders: the close proves every one is in the books' }],
      body:
`The close turns a month of activity into numbers June can trust. It happens in the **first three working days** of the next month, every month.

**Day 1: gather**

1. Download every statement for the month: bank, card, Stripe, PayPal, and the cash log. Your bookkeeping software and logins: [owner to fill in: which bookkeeping software we use, and how the bookkeeper signs in]
2. Download the expenses and sales tax exports for the month from the Finances page
3. Check every monthly cost really happened at the recorded amount

**Day 2: reconcile and check**

4. Reconcile each account to its statement until the difference is zero (next lesson)
5. Check receipts: every expense has one, and anything missing is listed
6. Check contractor payments: each one recorded as Contract labor with a name
7. Check refunds and disputes landed in this month, linked to their orders
8. Sales tax: taxable vs exempt, certificates on file, nothing left unworked

**Day 3: finish**

9. Look for duplicates and anything odd: the same amount twice on one day, a vendor you have never seen, a payment with no order, a job that lost money
10. Run the profit and loss for the month
11. Send June the monthly summary (Module 7)

**After the close**

- **A closed month is never changed.** Anything found later is corrected in the month it is found, with a note saying which month it belongs to and why
- Keep a short close note: the date you closed, anything still open, and what you are waiting for

**When the close slips**

If something stops you closing in three days (a statement not available, a big unexplained payment), tell June on day 3 what is blocking it and when it will be done. A late close explained is fine; a quiet one is not.`,
    }, {
      id: 'b6-recon', article: A.recon, minutes: 20, tags: 'bookkeeping, reconciliation, bank, stripe, payouts, in transit, difference, zero',
      goals: ['Reconcile an account until the difference is zero', 'Match Stripe payouts to bank deposits', 'Explain every item left over'],
      body:
`Reconciling proves our records and the statement tell the same story. It is finished when the difference is **zero**, not when it is close.

**The bank account**

1. Start from last month's reconciled closing balance
2. Tick off every deposit and withdrawal in the books against the statement
3. For each item on the statement but not in the books, record it (with a receipt and category if it is a cost)
4. For each item in the books but not on the statement, find out why: in transit, entered twice, or wrong
5. The books' closing balance, plus or minus items in transit, must equal the statement's

**Stripe to the bank**

- Each bank deposit from Stripe matches one payout
- Each payout is made of payments, minus fees and refunds. Open it in Stripe to see the list
- Payments in the last day or two of the month are often in a payout that lands next month: that is **in transit**, noted, not missing
- A payout in Stripe with no matching deposit, after a few days, is a failed payout: tell June

**Cash**

- The cash log, the cash recorded on orders, and the cash banked must agree
- Cash taken and not yet banked is in transit, with a date it will be banked

**What is left over**

When the difference is not zero:

- Look for the exact amount elsewhere (a $97 difference is often a $100 sale with a $3 fee recorded wrong)
- Look for a number entered with its digits swapped: the difference then divides by 9
- Look for something entered twice, or in the wrong month

Never make up a "balancing" entry to reach zero. If you cannot find it, write down the amount, what you checked, and ask June.`,
    }],
    practice: [
      { key: 'signoff:books-close', type: 'signoff', minutes: 5,
        title: 'Closes a month reconciled to zero', hint: 'June reviews your first close: every account reconciled to zero, items in transit explained, receipts and tax checked, done within three working days.' },
    ],
    quiz: {
      key: 'books-6', title: 'Module 6 quiz: the month-end close', minutes: 10,
      questions: [
        { id: 'when', q: 'The close happens…',
          choices: ['In the first three working days of the next month', 'Whenever there is time', 'Once a year', 'On the 20th'],
          answer: 0, article: A.close, why: 'Every month, three working days.' },
        { id: 'day1', q: 'Day 1 of the close is for…',
          choices: ['Gathering statements and exports', 'Running the profit and loss', 'Filing tax', 'Nothing'],
          answer: 0, article: A.close, why: 'Gather, then reconcile, then finish.' },
        { id: 'closed', q: 'You find an October expense in December, after October closed. You…',
          choices: ['Reopen October', 'Record it in December, noting it belongs to October', 'Ignore it', 'Delete it'],
          answer: 1, article: A.close, why: 'A closed month is never changed.' },
        { id: 'slip', q: 'You cannot close by day 3. You…',
          choices: ['Stay quiet', 'Tell June what is blocking it and when it will be done', 'Close with guesses', 'Skip the month'],
          answer: 1, article: A.close, why: 'A late close explained is fine.' },
        { id: 'odd', q: 'Which is worth checking as "odd" at close?',
          choices: ['The same amount twice on one day to one vendor', 'A rent payment on the 1st', 'A Stripe payout', 'A monthly software cost'],
          answer: 0, article: A.close, why: 'Look for duplicates and the unexpected.' },
        { id: 'zero', q: 'A reconciliation is finished when the difference is…',
          choices: ['Under $10', 'Zero', 'Close', 'Explained roughly'],
          answer: 1, article: A.recon, why: 'Zero, not close.' },
        { id: 'transit', q: 'A payout from March 31 lands in the bank on April 2. In March it is…',
          choices: ['Missing', 'In transit, noted', 'A refund', 'Double'],
          answer: 1, article: A.recon, why: 'Noted, not missing.' },
        { id: 'nine', q: 'The difference is $27 and divides by 9. Likely…',
          choices: ['Fraud', 'A number entered with its digits swapped', 'A fee', 'Tax'],
          answer: 1, article: A.recon, why: 'Swapped digits give a difference that divides by 9.' },
        { id: 'fee97', q: 'A $97 difference against a $100 sale often means…',
          choices: ['The fee was recorded wrong', 'A refund', 'A dispute', 'Cash'],
          answer: 0, article: A.recon, why: 'Sales gross, fees separate.' },
        { id: 'plug', q: 'You cannot find a $15 difference. You…',
          choices: ['Add a balancing entry', 'Write down what you checked and ask June', 'Leave it forever', 'Change a sale'],
          answer: 1, article: A.recon, why: 'Never make up a balancing entry.' },
      ],
    },
    buffer: 7,
  },

  /* ── 7 ── */
  {
    key: 'b7', icon: '📨', title: 'Reporting, safety and quiet time',
    goal: 'Give June a monthly summary she can act on, keep the accounts safe, and use quiet time well.',
    lessons: [{
      id: 'b7-report', article: A.report, minutes: 20, tags: 'bookkeeping, monthly summary, profit, cash, tax to set aside, questions, owed',
      goals: ['Write the monthly summary in plain English', 'Put the questions June must answer first', 'Show what customers still owe'],
      body:
`June does not need every number. She needs to know how the month went, how much cash there is, what belongs to the state, and what she must decide.

**The monthly summary**

Short and plain, sent when the close is done:

1. **Sales:** gross sales for the month, and how that compares with last month and with break-even
2. **Costs:** overheads and job costs, and anything unusual
3. **Profit:** sales minus costs, from the profit and loss
4. **Cash:** what is in the bank, and anything in transit
5. **Sales tax:** what to set aside for the ST-1 due on the 20th
6. **Owed to us:** balances customers still owe, oldest first
7. **Questions:** what you need from June, each one answerable in a word or a line

**An example**

"Hi June, September is closed:

- Sales $8,420 (August $6,900). Break-even is $5,200
- Costs $5,130: overheads $1,095, job costs $3,610, fees $425
- Profit about $3,290
- Bank $6,980, plus a $412 payout in transit
- Set aside $611 for the ST-1 due October 20
- Owed: $1,240 across 3 orders, oldest 34 days (AB12CD)
- Questions: 1) the $48 Amazon charge on the 14th, business or personal? 2) the youth league order was untaxed with no certificate. Collect one, or do we pay the tax?"

**Writing it well**

- Numbers first, words second. Round to the dollar
- Compare with last month, so a number means something
- Say plainly when something is wrong: "We lost $120 on the banner job because of a reprint"
- Never send a summary with a number you are not sure of without saying so`,
    }, {
      id: 'b7-safe', article: A.safe, minutes: 20, tags: 'bookkeeping, security, two-factor, passwords, escalate, quiet time, subscriptions, cash flow',
      goals: ['Keep account access safe', 'Know what goes to June the same day', 'Use quiet time on what saves money'],
      body:
`You can see the shop's money. That makes how you handle access and surprises part of the job.

**Safety**

- Your own login for every account, with two-factor sign-in. Never a shared password
- Never a password, a full card number or bank details in chat or email
- Never move money, pay a bill, or change bank or payout details unless June has asked you to, in writing
- A message asking you to pay something urgently, or to change where money goes, even one that looks like it is from June or a supplier, is checked with June by another route first. This is the most common way small businesses lose money
- Customer details stay in our systems. Never paste them into an AI tool

**What goes to June the same day**

- A dispute opening, a failed payout, or a refund that failed
- Money missing, or money that nobody can explain
- A sales tax deadline at risk, or a month that cannot be filed
- Anything that looks like fraud: an odd payment request, a charge nobody recognises
- A mistake you made. Found early, most are a five-minute fix

**Quiet time**

When the month is closed and nothing is waiting:

- **Subscriptions:** list every software and service we pay for, and what each is used for. Flag anything unused to June
- **Missing receipts:** chase them, oldest first
- **Missing certificates:** untaxed sales without one
- **Money owed:** list balances customers still owe, with how long, for sales to chase
- **Busy season:** a simple cash-flow forecast for the next three months, with the seasons that bring the most orders and the supplier bills that come with them
- **Job costs:** replace estimates with real invoice amounts

Write what you did in your end-of-day note, so June sees the quiet time was used.`,
    }],
    practice: [],
    quiz: {
      key: 'books-7', title: 'Module 7 quiz: reporting, safety and quiet time', minutes: 10,
      questions: [
        { id: 'when', q: 'The monthly summary is sent…',
          choices: ['When the close is done', 'Once a year', 'Daily', 'Only if asked'],
          answer: 0, article: A.report, why: 'After the three-day close.' },
        { id: 'tax', q: 'Which belongs in the summary?',
          choices: ['How much to set aside for the ST-1', 'Every transaction', 'Customer phone numbers', 'Your passwords'],
          answer: 0, article: A.report, why: 'Sales, costs, profit, cash, tax, owed, questions.' },
        { id: 'compare', q: 'Why compare with last month?',
          choices: ['So a number means something', 'It is required by law', 'To make it longer', 'No reason'],
          answer: 0, article: A.report, why: 'Context makes numbers useful.' },
        { id: 'question', q: 'Which question is easiest for June to answer?',
          choices: ['"Can you look at the books?"', '"The $48 Amazon charge on the 14th: business or personal?"', '"Things seem off"', '"Thoughts?"'],
          answer: 1, article: A.report, why: 'Answerable in a word or a line.' },
        { id: 'unsure', q: 'You are not sure of one number in the summary. You…',
          choices: ['Send it as if sure', 'Say so in the summary', 'Leave it out silently', 'Guess'],
          answer: 1, article: A.report, why: 'Never present an uncertain number as certain.' },
        { id: 'urgent', q: 'An email "from a supplier" asks you to update their bank details and pay today. You…',
          choices: ['Pay it', 'Check with June by another route first', 'Reply with our bank details', 'Forward it to sales'],
          answer: 1, article: A.safe, why: 'The most common way small businesses lose money.' },
        { id: 'move', q: 'May you pay a bill June has not asked you to pay?',
          choices: ['Yes', 'No'],
          answer: 1, article: A.safe, why: 'Only when June asks, in writing.' },
        { id: 'sameday', q: 'Which goes to June the same day?',
          choices: ['A dispute opening', 'A receipt you found', 'A rent payment on time', 'A finished close note'],
          answer: 0, article: A.safe, why: 'Disputes, failed payouts, missing money, deadlines at risk.' },
        { id: 'mistake', q: 'You find a mistake you made last week. You…',
          choices: ['Hide it', 'Tell June: found early, most are quick to fix', 'Wait for the close', 'Blame the system'],
          answer: 1, article: A.safe, why: 'Found early, most are a five-minute fix.' },
        { id: 'quiet', q: 'A good quiet-time task is…',
          choices: ['Listing subscriptions and flagging unused ones', 'Changing prices', 'Paying bills early', 'Deleting old records'],
          answer: 0, article: A.safe, why: 'Find savings and chase what is missing.' },
      ],
    },
    buffer: 7,
  },
];

/* The final exam: new questions across the whole course, 80% to pass. */
const FINAL = {
  floating: 15,
  quiz: {
    key: 'books-final', title: 'Final exam: the Bookkeeper course', minutes: 25,
    questions: null, // books-core-final.js
  },
  signoffs: [
    { key: 'signoff:handoff', type: 'signoff', minutes: 0,
      title: 'Knows what goes to June the same day', hint: 'Disputes, failed payouts, missing or unexplained money, tax deadlines at risk, odd payment requests. June signs this off after seeing you do it.' },
    { key: 'signoff:ready', type: 'signoff', minutes: 0,
      title: 'Ready to close a month on their own', hint: 'The last step. June decides when your close and summary go ahead without her checking each step first.' },
  ],
};
FINAL.quiz.questions = require('./books-core-final')(A);

/* The Finances page was owner only when this lesson first went live; a
   bookkeeper can now read it (finances.view). The published wording is kept
   in `was`, so a copy June has not edited is updated. */
{
  const l = MODULES.flatMap((m) => m.lessons).find((x) => x.id === 'b2-page');
  l.was = [l.body.replace('June owns it, and only she can change anything on it. How you see it:', "June owns it; it shows the shop's money, so it is owner only. How you see it:")];
}

const PAGES = require('./books-core-pages');
for (const l of MODULES.flatMap((m) => m.lessons)) {
  if (l.pages) continue; // the shared module's lessons carry their own
  l.pages = PAGES[l.id] || [{ from: null, checks: [] }];
  l.checks = l.pages.flatMap((pg) => pg.checks);
}

module.exports = { key: 'books-core', title: 'Bookkeeper', track: 'bookkeeper', articles: A, glossary: GLOSSARY, modules: MODULES, final: FINAL };
