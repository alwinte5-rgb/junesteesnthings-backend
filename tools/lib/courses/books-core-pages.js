'use strict';

/* The Bookkeeper course lessons as pages, the same way design-core-pages.js
   does the Design course: `from` is the bold heading a page starts at, and
   every page ends with a couple of questions about what it just said
   (multiple choice, answered on the page, never marked). */

const q = (text, choices, answer, why) => ({ q: text, choices, answer, why });

module.exports = {
  'b2-money': [
    { from: null, checks: [
      q('A design studio order is paid…', ['By card through Stripe', 'Only in cash', 'Never'], 0, 'Quotes and studio orders both use Stripe.'),
      q('Who records a cash payment?', ['Whoever took it, on the order', 'Nobody', 'The customer'], 0, 'Payments taken by hand go on the order.'),
    ] },
    { from: 'Sales are gross; fees are an expense', checks: [
      q('Why never record a $100 card sale as $97?', ['It hides what card fees cost in a year', 'It is the same', 'Stripe forbids it'], 0, 'Fees go in Fees.'),
      q('The $3 Stripe keeps goes in…', ['Fees', 'Sales', 'Materials'], 0, 'An expense.'),
    ] },
    { from: 'From payment to the bank', checks: [
      q('To see what is inside a deposit, open…', ['The payout in Stripe', 'The quote', 'The customer\'s email'], 0, 'It lists payments, fees and refunds.'),
      q('A payment with no order at month end is…', ['A question to answer before closing', 'Fine forever', 'Profit'], 0, 'The order is the anchor.'),
    ] },
  ],
  'b2-page': [
    { from: null, checks: [
      q('The Finances page opens on…', ['This month', 'Last year', 'All time'], 0, 'The menu picks another month or a year.'),
      q('The Finances page is…', ['Owner only', 'Public', 'For customers'], 0, 'It shows the shop\'s money.'),
    ] },
    { from: 'What each card shows', checks: [
      q('A deleted copy of a monthly cost…', ['Is remembered and does not come back', 'Comes back next day'], 0, 'Deleting one month\'s copy is remembered.'),
      q('"Sales against break-even" compares sales with…', ['What covers our overheads', 'Last year\'s tax', 'Ad spend'], 0, 'Break-even.'),
    ] },
    { from: 'Exports', checks: [
      q('The tax export uses…', ['The tax worked out when each payment arrived', 'Today\'s quote totals'], 0, 'So it matches the Sales tax position card.'),
      q('Is the Finances page the bank statement?', ['Yes', 'No: you prove they agree'], 1, 'It shows what our system recorded.'),
    ] },
  ],
  'b3-expenses': [
    { from: null, checks: [
      q('Why a fixed list of categories?', ['A category typed three ways cannot be totalled', 'It looks nicer'], 0, 'Totals add up.'),
      q('Which is NOT needed for an expense?', ['The customer\'s phone', 'A receipt', 'A category'], 0, 'Date, amount, vendor, category, receipt.'),
    ] },
    { from: 'Choosing the category', checks: [
      q('A new heat press is…', ['Equipment', 'Materials', 'Other'], 0, 'Equipment.'),
      q('After searching email and the supplier account, no receipt. You…', ['Ask June, saying what you checked', 'Invent one'], 0, 'Never guess.'),
    ] },
    { from: 'Paid on a personal card', checks: [
      q('Monthly copies are checked…', ['Every month, against what was really paid', 'Never'], 0, 'Price rises and cancellations change them.'),
      q('Before adding an expense you check…', ['It is not already there', 'The weather'], 0, 'Never twice.'),
    ] },
  ],
  'b3-jobcosts': [
    { from: null, checks: [
      q('Which is part of a job\'s cost?', ['Blank garments and printing', 'Sales tax', 'June\'s rent at home'], 0, 'Blanks, printing, setup, extras.'),
      q('Estimated job cost lines are…', ['Marked as estimated', 'Hidden'], 0, 'A starting point.'),
    ] },
    { from: 'Making them real', checks: [
      q('You find a job by its…', ['Quote code', 'Customer phone'], 0, 'Then open its costs on the job page.'),
      q('A substitute shirt on the invoice is…', ['Noted', 'Ignored'], 0, 'Note anything unusual.'),
    ] },
    { from: 'Reading the result', checks: [
      q('Who changes prices?', ['June', 'You'], 0, 'You show the numbers.'),
      q('A supplier invoice for a job that does not exist is…', ['Worth flagging', 'Normal'], 0, 'Watch for it.'),
    ] },
  ],
  'b4-refunds': [
    { from: null, checks: [
      q('A refund made in two parts is counted…', ['Once each', 'Twice each'], 0, 'Rebuilt from Stripe\'s own list.'),
      q('After a refund, payment reminders for that order…', ['Stop', 'Continue'], 0, 'Anything owed is chased by hand.'),
    ] },
    { from: 'Disputes (chargebacks)', checks: [
      q('A won dispute changes sales by…', ['Nothing', 'The full amount'], 0, 'Only a lost one is like a refund.'),
      q('When does June hear about a dispute?', ['The day it opens', 'When it is lost'], 0, 'There is a deadline to answer.'),
    ] },
    { from: 'Partial refunds', checks: [
      q('$40 back on a $400 order lowers that month\'s sales by…', ['$40', '$400'], 0, 'Only what was refunded.'),
      q('After a partial refund, check that…', ['Order, Stripe and books agree', 'Nothing'], 0, 'All three say the same.'),
    ] },
  ],
  'b4-outside': [
    { from: null, checks: [
      q('After a failed payout, the money goes…', ['Back to the Stripe balance', 'To the customer'], 0, 'Later payouts can stop too.'),
      q('How often do you compare payouts with bank deposits?', ['Weekly', 'Yearly'], 0, 'Only the bank shows the gap.'),
    ] },
    { from: 'Money taken outside our checkout', checks: [
      q('A Stripe invoice payment is…', ['Picked up automatically, not yet linked', 'Lost'], 0, 'Then linked to its order.'),
      q('Checks are recorded…', ['On the order, and in the cash log', 'Nowhere'], 0, 'Same money, one record each place.'),
    ] },
    { from: 'Never twice', checks: [
      q('A matching Stripe payment with no order exists. Recording the payment by hand, you…', ['Link that one', 'Type a new one'], 0, 'Retyping counts it twice.'),
      q('An unexplained payment at month end is…', ['A question, not income yet', 'Profit'], 0, 'Find the order or ask June.'),
    ] },
  ],
  'b5-tax': [
    { from: null, checks: [
      q('How often do we file the ST-1?', ['Monthly', 'Yearly'], 0, 'Each month, due the 20th of the next.'),
      q('Which reminder comes first?', ['When the month closes: how much to set aside', 'The day after it is due'], 0, 'Then before the 20th, then the day before.'),
    ] },
    { from: 'Setting it aside', checks: [
      q('Collected tax is set aside…', ['The same week the month closes', 'On the 19th'], 0, 'So it is there on the 20th.'),
      q('Where do you see what is still owed?', ['Sales tax position card', 'Overheads card'], 0, 'Collected, paid, owed.'),
    ] },
    { from: 'Preparing a month\'s figures', checks: [
      q('Refunds in the month are…', ['Taken back out, with their tax', 'Ignored'], 0, 'Tax comes off refunded sales.'),
      q('Who decides a sale was exempt?', ['Not you', 'You'], 0, 'Never decide that on your own.'),
    ] },
  ],
  'b5-exempt': [
    { from: null, checks: [
      q('Illinois accepts an exempt sale only if…', ['We can show the buyer\'s certificate for it', 'The buyer says so'], 0, 'No certificate means we owe the tax.'),
      q('Many schools and churches have…', ['An "E" number', 'A resale license'], 0, 'Exemption numbers start with E.'),
    ] },
    { from: 'How the system handles it', checks: [
      q('On a quote, payment waits until…', ['A certificate is on file', 'June calls'], 0, 'Shop attaches or customer uploads.'),
      q('A studio certificate June refuses means…', ['Tax is added back and collected with the balance', 'The order is free'], 0, 'Refused tax is collected.'),
    ] },
    { from: 'Your monthly check', checks: [
      q('The certificate holder\'s name should…', ['Match the customer', 'Be anything'], 0, 'Check name and kind.'),
      q('May you accept a certificate for June?', ['No', 'Yes'], 0, 'Approval is hers.'),
    ] },
  ],
  'b6-close': [
    { from: null, checks: [
      q('How many working days for the close?', ['Three', 'Ten'], 0, 'The first three of the next month.'),
      q('Day 1 includes…', ['Downloading every statement', 'The monthly summary'], 0, 'Gather first.'),
    ] },
    { from: 'Day 2: reconcile and check', checks: [
      q('Contractor payments go in…', ['Contract labor, with a name', 'Other'], 0, 'Named.'),
      q('Refunds and disputes are checked…', ['In the month they happened', 'Never'], 0, 'Linked to their orders.'),
    ] },
    { from: 'Day 3: finish', checks: [
      q('Something found after the close goes…', ['In the month it is found, with a note', 'Back into the closed month'], 0, 'A closed month is never changed.'),
      q('A close note records…', ['Date closed, anything open, what you wait for', 'Nothing'], 0, 'Short note.'),
    ] },
  ],
  'b6-recon': [
    { from: null, checks: [
      q('You start a bank reconciliation from…', ['Last month\'s reconciled closing balance', 'Zero'], 0, 'Then tick off every item.'),
      q('An item on the statement but not in the books is…', ['Recorded, with a receipt if a cost', 'Ignored'], 0, 'Record it.'),
    ] },
    { from: 'Stripe to the bank', checks: [
      q('Each Stripe deposit matches…', ['One payout', 'One order'], 0, 'Payouts bundle payments.'),
      q('Cash taken but not yet banked is…', ['In transit, with a bank date', 'Missing'], 0, 'Noted.'),
    ] },
    { from: 'What is left over', checks: [
      q('A balancing entry to reach zero is…', ['Never made up', 'Fine'], 0, 'Find it or ask June.'),
      q('A difference that divides by 9 suggests…', ['Swapped digits', 'A dispute'], 0, 'A transposition.'),
    ] },
  ],
  'b7-report': [
    { from: null, checks: [
      q('The summary opens with…', ['Sales', 'Questions'], 0, 'Sales, costs, profit, cash, tax, owed, questions.'),
      q('Owed balances are listed…', ['Oldest first', 'Alphabetically'], 0, 'So the oldest get chased.'),
    ] },
    { from: 'An example', checks: [
      q('Each question in the summary is…', ['Answerable in a word or a line', 'Open-ended'], 0, 'Easy for June.'),
      q('Tax to set aside is shown with…', ['Its due date', 'Nothing'], 0, 'ST-1 due the 20th.'),
    ] },
    { from: 'Writing it well', checks: [
      q('Numbers are rounded to…', ['The dollar', 'The thousand'], 0, 'Readable.'),
      q('A job lost money. The summary…', ['Says so plainly, with why', 'Hides it'], 0, 'Plain about what is wrong.'),
    ] },
  ],
  'b7-safe': [
    { from: null, checks: [
      q('Every account login has…', ['Two-factor sign-in, your own', 'A shared password'], 0, 'Your own login.'),
      q('May you change payout bank details?', ['Only if June asked in writing', 'Any time'], 0, 'Never move money unasked.'),
    ] },
    { from: 'What goes to June the same day', checks: [
      q('A charge nobody recognises goes to June…', ['The same day', 'At the close'], 0, 'Possible fraud.'),
      q('A mistake you made goes to June…', ['Early', 'Never'], 0, 'Found early, most are quick to fix.'),
    ] },
    { from: 'Quiet time', checks: [
      q('A cash-flow forecast covers…', ['The next three months', 'Last year'], 0, 'With the busy seasons.'),
      q('Where do you note what you did in quiet time?', ['Your end-of-day note', 'Nowhere'], 0, 'So June sees it.'),
    ] },
  ],
};
