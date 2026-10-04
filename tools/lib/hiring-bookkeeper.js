'use strict';

/* The applicant test for the part-time bookkeeper, in the same shape as the
   sales one in hiring.js (see ROLES there). Everything else is shared by every
   role.

   What the job is: keeping the shop's books right every month. Card payments
   arrive through Stripe (and some PayPal and cash), with refunds, disputes and
   fees; costs are entered on the Finances page; Illinois sales tax applies,
   with tax-exempt schools and churches on certificate. The bookkeeper
   reconciles every account to its statement, keeps receipts, closes each month
   and explains the numbers plainly. Financial access is sensitive: care with
   logins and data matters as much as accuracy. */

const MINUTES = 30;

const INTRO = `This test takes about ${MINUTES} minutes. It is the same kind of work you would do for us every month:
deciding how to record what happened, reconciling payments to the bank, closing a month, and explaining the
numbers to a busy owner who is not an accountant. You do not need accounting software: everything is written.
Please do not use ChatGPT or other AI tools to write your answers: we want to see how you think.`;

const PARTS = {
  choice: { label: 'Part 1: Bookkeeping judgment', note: '8 questions, about 6 minutes. Pick what you would really do.' },
  craft: { label: 'Part 2: The books', note: 'About 18 minutes. Show your working: amounts, accounts, steps.' },
  initiative: { label: 'Part 3: Initiative', note: 'About 4 minutes. There is no single right answer; we want to see how you think.' },
  bonus: { label: 'Part 4: Bonus', note: 'Optional, about 3 minutes. This can change the direction of your interview.' },
};

const WEIGHTS = { choice: 25, craft: 50, initiative: 25 };

const MULTIPLE_CHOICE = [
  { id: 'fees', q: 'Stripe sold $2,000 of orders this week and paid $1,940 into the bank. How do you record it?',
    choices: ['$1,940 of sales', '$2,000 of sales and $60 of card processing fees as an expense, matched to the $1,940 deposit',
      '$2,000 of sales and ignore the difference', '$1,940 of sales and $60 of other income'],
    answer: 1, why: 'Sales are the full amount the customers paid. The fees are a real cost of the business and belong in expenses, or sales and costs are both understated.' },
  { id: 'refund', q: 'A customer got a $120 partial refund this month on an order paid last month. What do you do?',
    choices: ['Delete last month\'s sale', 'Record a $120 refund this month, linked to the original order',
      'Change last month\'s sale to the lower amount', 'Ignore it: it is small'],
    answer: 1, why: 'A closed month stays as it was. The refund is recorded when it happened, linked to the order, so both months stay true and traceable.' },
  { id: 'exempt', q: 'A school orders shirts tax-free. What must be true before the sale is recorded as exempt from Illinois sales tax?',
    choices: ['Nothing: schools never pay tax', 'The school says so in an email',
      'We have their exemption certificate (their Illinois "E" number) on file, and the sale is recorded as exempt with it',
      'The owner approves it verbally'],
    answer: 2, why: 'Exempt sales must be backed by the customer\'s exemption number on file. Without it, the shop owes the tax if it is ever audited.' },
  { id: 'receipt', q: 'There is a $86.40 card charge from "SQ *PRINTSUPPLY" with no receipt. What do you do?',
    choices: ['Guess a category and move on', 'Leave it out of the books',
      'Look for the receipt in email and the supplier account, ask the owner if it cannot be found, and record it with the receipt attached',
      'Record it as a personal expense'],
    answer: 2, why: 'Every expense needs a receipt and the right category. Asking takes a minute; a wrong guess or a missing receipt costs more at tax time.' },
  { id: 'personal', q: 'The owner paid a $300 supplier bill with their personal card. How is it recorded?',
    choices: ['It is not a business expense', 'As a business expense, paid by the owner (an owner contribution, or a reimbursement owed to them)',
      'As income', 'As a loan from the supplier'],
    answer: 1, why: 'It is still a business cost. Recording who paid it keeps the expense in the books and shows what the business owes the owner.' },
  { id: 'close', q: 'What is the first thing you do before producing a month\'s profit report?',
    choices: ['Send the report straight away', 'Reconcile every account (bank, Stripe, PayPal, cash) to its statement for the month',
      'Round the numbers', 'Copy last month\'s report'],
    answer: 1, why: 'A report is only right if every account matches its statement. Reconciling first catches missing, duplicate and wrong entries.' },
  { id: 'dispute', q: 'A customer disputes a $250 card payment and Stripe takes the money back plus a $15 fee. What do you record?',
    choices: ['Nothing until it is decided', 'The $250 reversal and the $15 fee now, and the money back if the dispute is won later',
      'Only the $15 fee', 'Delete the original sale'],
    answer: 1, why: 'The money left the account now, so the books show it now. If the shop wins, the return is recorded when it arrives.' },
  { id: 'access', q: 'The owner offers to send you the bank login in a chat message. What do you say?',
    choices: ['Yes, send it', 'Send it by email instead',
      'Ask for your own user with read-only or bookkeeper access (with two-factor login), never the owner\'s password in a message',
      'Write it on a note'],
    answer: 2, why: 'Shared passwords in messages leak. A separate, limited user with two-factor login keeps the money safe and shows who did what.' },
];

const WRITTEN = [
  { id: 'recon', part: 'craft', minutes: 7, label: 'Reconcile a month',
    prompt: 'September\'s Stripe report: gross sales $8,400, refunds $350, Stripe fees $255, one dispute lost $120 plus a $15 dispute fee. The bank shows $7,410 of Stripe deposits in September. Work out what Stripe should have paid out, explain the difference from the bank, and say exactly how you would record the month.',
    rubric: 'Calculates the expected net payout correctly: 8,400 - 350 - 255 - 120 - 15 = $7,660; finds the $250 gap and gives the likely reason (a payout in transit at month end, arriving in October), and how to confirm it (the Stripe payout list and dates, the October bank statement), without guessing; records gross sales $8,400, refunds $350, card fees $255, the dispute $120 and its $15 fee, and the $250 as money in transit (not missing); mentions tying it out next month. A wrong calculation, or booking only the $7,410 as sales, scores 2 or lower.',
    model: "Expected payouts: $8,400 - $350 refunds - $255 fees - $120 dispute - $15 dispute fee = $7,660.\nThe bank shows $7,410, so $250 is not in the bank yet. Most likely the last payout of September was made on the 30th and lands in early October. I would confirm it on Stripe's payout list (the payout date and amount) and on the October bank statement, not assume it.\n\nRecording September:\n- Sales $8,400 (gross)\n- Refunds $350 (against the original orders)\n- Card processing fees $255\n- Dispute lost $120, dispute fee $15\n- $7,410 deposited, $250 in transit (Stripe balance / clearing account)\nIn October I would tick off the $250 deposit against the in-transit amount so the clearing account goes back to zero.",
  },
  { id: 'monthend', part: 'craft', minutes: 5, label: 'Close the month',
    prompt: 'Walk us through your month-end close for a small shop with a bank account, Stripe, PayPal, some cash sales, a monthly rent, and a few contractors paid by PayPal. What do you check, in what order, and what do you send the owner at the end?',
    rubric: 'An ordered, realistic close: collect statements; reconcile each account (bank, Stripe, PayPal, cash) to its statement; match payouts to deposits, clearing accounts back to zero or explained; check every expense has a receipt and a category, recurring costs (rent, software) are all there, contractor payments recorded; sales tax for the month (taxable vs exempt with certificates); look for duplicates and odd items; then the profit and loss and a short plain-English summary with questions for the owner. Lock or mark the month closed.',
    model: "1. Download every statement: bank, Stripe, PayPal, and count the cash log.\n2. Reconcile each one: every deposit matched to a Stripe or PayPal payout, Stripe and PayPal balances agree with their reports, anything in transit noted.\n3. Expenses: every line has a receipt and a category; rent, software and phone are all in; contractor PayPal payments recorded as contract labor with names.\n4. Sales tax: taxable sales vs exempt sales, and every exempt sale has the customer's certificate on file. Note the amount to set aside.\n5. Look for duplicates, refunds without their sale, and anything unusual.\n6. Run the profit and loss, compare with last month, and close the month.\n7. Send June a short summary: sales, costs, profit, cash in the bank, tax to set aside, and any questions (missing receipts, charges I couldn't identify).",
  },
  { id: 'explain', part: 'craft', minutes: 3, label: 'Explain it to the owner',
    prompt: 'The owner asks: "The report says we made $3,200 profit in September, but the bank only went up $900. Where did the money go?" Write your reply exactly as you would send it.',
    rubric: 'Plain words, no jargon; explains that profit and cash differ and gives the likely concrete reasons for THIS shop (payouts still in transit, sales tax collected but owed to the state, deposits received in an earlier month or balances still owed by customers, inventory such as blank shirts bought ahead, owner withdrawals, loan payments); offers to show the exact breakdown for September; short and friendly.',
    model: "Hi June, good question: profit and cash move differently. For September the $2,300 gap is mostly:\n- $250 of Stripe payouts that landed on October 1st\n- About $640 of sales tax we collected that belongs to the state (it's in the bank but it isn't ours)\n- $900 of blank shirts bought in September for October orders (paid now, sold next month)\n- Customers who still owe their balances on finished jobs\nI'll send you the exact breakdown with the numbers by tomorrow, so you can see every dollar.",
  },
  { id: 'experience', part: 'craft', minutes: 3, label: 'Your experience',
    prompt: 'Tell us about the bookkeeping you do now or have done: the businesses (size, type), the software (QuickBooks, Xero, spreadsheets), what you do each month, and one problem you found and fixed in someone\'s books.',
    rubric: 'Real, specific experience: the kind and size of business, named software, a monthly routine, and a concrete problem found and fixed (with amounts if possible). Small or e-commerce businesses with Stripe or PayPal are a plus. Generic "I am detail-oriented" with no example scores 1-2.',
    model: "I keep the books for three small businesses: an online clothing store (Shopify, Stripe, PayPal, about $25,000 a month), a cafe and a cleaning company. I use QuickBooks Online and Xero. Each month I reconcile every account, chase receipts, and send each owner a one-page summary. At the clothing store I found Stripe fees had been booked as refunds for six months, which made their returns look 4% higher than they were; I moved $3,100 to fees and set up a bank rule so it doesn't happen again.",
  },
  { id: 'quiet', part: 'initiative', minutes: 4, label: 'Quiet time',
    prompt: 'The month is closed and nothing is assigned. You have 3 hours this week. Tell us exactly what you would do with them, and why.',
    rubric: 'Self-starter: names useful finance work without being told, for example chasing missing receipts and exemption certificates, checking recurring costs for subscriptions nobody uses, comparing supplier prices, preparing for quarterly or yearly taxes, a cash-flow forecast for the busy season, checking customers who still owe money, tidying categories, documenting the close process; prioritised by money saved or risk reduced. "I would wait" scores low.',
    model: "1. 45 min: list every recurring charge and ask June about any subscription nobody seems to use (these often add up to $50-100 a month).\n2. 45 min: check every exempt sale this year has its certificate on file, and list the missing ones for sales to collect.\n3. 45 min: a simple cash-flow forecast for the next 3 months, with the busy back-to-school and sports season and the sales tax payments in it.\n4. 30 min: list customers who still owe balances over 30 days, for sales to follow up.\n5. 15 min: send June a short note with what I found.",
  },
  { id: 'bonus', part: 'bonus', minutes: 3, optional: true, label: 'Bonus: a skill we did not ask about',
    prompt: 'Is there a skill we did not ask about that could help us? For example payroll for contractors, US sales tax filing, inventory costing, financial reports and dashboards, Excel or Google Sheets automation, or using AI tools carefully for finance. Tell us what you have done with it and one result you are proud of.',
    rubric: 'Score 0 if left blank. Rewards a real, evidenced skill useful to a small US shop (contractor payments and 1099s, sales tax filing, inventory and job costing, dashboards, spreadsheet automation, AI used carefully with checks) with a concrete result. Vague claims with no example score 1-2.',
    model: "I built a Google Sheets dashboard for a client that pulls the monthly profit and loss and shows each product line's margin. It showed their custom orders made 3 times the margin of their ready-made stock, and they moved their ad budget to custom orders the next month.",
  },
];

const INTERVIEW_GUIDE = [
  { section: 'Warm-up (3 min)', questions: [
    { q: 'Tell me about the books you look after now. What does a normal month look like?',
      listen: 'Named businesses and software, a real routine, and how many hours it takes.' },
    { q: 'Why part-time bookkeeping for a small shop?',
      listen: 'Steady, long-term work. Watch for so many clients that month-end deadlines clash.' }] },
  { section: 'Their work, on screen (8 min)', questions: [
    { q: 'Share your screen and show me a reconciliation you did (with private details hidden). Walk me through it.',
      listen: 'Matches deposits to payouts, explains differences, uses a clearing or in-transit account properly.' },
    { q: 'What was the biggest mistake you found in someone\'s books, and how did you fix it?',
      listen: 'A specific error, the amount, the fix, and a rule or process so it does not happen again.' }] },
  { section: 'Live task (7 min)', questions: [
    { q: 'I will share 10 lines from a bank statement. Categorise them and tell me which ones you would ask me about.',
      listen: 'Sensible categories, asks about anything unclear instead of guessing, spots personal or duplicate charges.' }] },
  { section: 'Our books (6 min)', questions: [
    { q: 'We sell by card through Stripe, take some PayPal and cash, and have tax-exempt schools. What would you set up first?',
      listen: 'Clearing accounts for Stripe and PayPal, fees as expenses, exempt sales with certificates, a monthly close.' },
    { q: 'How do you keep a client\'s financial logins safe?',
      listen: 'Their own user with limited access, two-factor login, a password manager, never passwords in chat.' }] },
  { section: 'Practical check (3 min)', questions: [
    { q: 'Show me your internet speed test and confirm the weekly hours we posted, including the month-end days.',
      listen: 'A clear yes, and availability in the first days of each month for the close.' }] },
  { section: 'Their questions (3 min)', questions: [
    { q: 'What would you like to know about us?',
      listen: 'Questions about our accounts, software and tax show they are already planning the work.' }] },
];

module.exports = {
  key: 'bookkeeper',
  label: 'Bookkeeper (part-time)',
  job: 'a part-time remote bookkeeper who reconciles Stripe, PayPal, cash and the bank every month, records refunds, disputes, fees, expenses and Illinois sales tax (with tax-exempt customers), closes each month and explains the numbers plainly',
  reward: 'Reward bookkeepers who are accurate, reconcile before reporting, record what really happened when it happened, never guess a category or a missing receipt, protect financial logins, and explain money in plain words.',
  minutes: MINUTES,
  intro: INTRO, parts: PARTS, weights: WEIGHTS, choice: MULTIPLE_CHOICE, written: WRITTEN, guide: INTERVIEW_GUIDE,
};
