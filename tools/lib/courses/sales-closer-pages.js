'use strict';

/* The Sales Closer lessons as pages, the same way sales-core-pages.js does
   the Sales course: `from` is the bold heading a page starts at, and every
   page ends with a couple of questions about what it just said. */

const q = (text, choices, answer, why) => ({ q: text, choices, answer, why });

module.exports = {
  'cl1-job': [
    { from: null, checks: [
      q('Which leads are a Closer\'s?', ['Every lead, every channel', 'Only chats', 'Only past customers'], 0, 'Every lead is yours to close.'),
      q('A sent quote is yours until…', ['The deposit is paid', 'You send it', 'It is viewed'], 0, 'Follow it through.'),
    ] },
    { from: 'What you are measured on', checks: [
      q('Conversion is…', ['Accepted ÷ sent', 'Sent ÷ leads', 'Replies ÷ messages'], 0, 'Quotes accepted divided by quotes sent.'),
      q('Where is your reply time shown?', ['My stats', 'Resources', 'Nowhere'], 0, 'My stats.'),
    ] },
    { from: 'What stays June\'s', checks: [
      q('A discount is…', ['June\'s decision', 'Yours', 'The customer\'s'], 0, 'Always June\'s.'),
      q('While you ask June, the customer…', ['Gets a reply now with a time', 'Waits in silence', 'Is told to call June'], 0, 'Reply, give a time, keep it.'),
    ] },
  ],
  'cl2-speed': [
    { from: null, checks: [
      q('Forms get a first reply within…', ['1 hour', '1 day', '1 week'], 0, 'During your shift.'),
      q('Chats get a reply within…', ['15 minutes', '1 hour', '4 hours'], 0, 'Chats are live.'),
    ] },
    { from: 'A first reply that moves it forward', checks: [
      q('The missing details are asked…', ['All in one message', 'One a day', 'By phone only'], 0, 'One message.'),
      q('A first reply ends with…', ['One easy question', 'A price list', 'Nothing'], 0, 'Make replying simple.'),
    ] },
    { from: 'When you cannot answer fully', checks: [
      q('You do not know yet. You…', ['Reply with a time you will update them by', 'Stay quiet', 'Guess'], 0, 'Then keep the time.'),
      q('A reply you did not log counts as…', ['Unanswered', 'Answered', 'Won'], 0, 'Logging is what counts.'),
    ] },
  ],
  'cl3-discovery': [
    { from: null, checks: [
      q('Discovery tells you…', ['Which order to price, and what wins the yes', 'The tax rate', 'The customer\'s address'], 0, 'Beyond the five details.'),
      q('Asking "who wears it" decides…', ['Garment and sizes', 'The deposit', 'Nothing'], 0, 'Kids, adults, workwear differ.'),
    ] },
    { from: 'Listen more than you talk', checks: [
      q('Their words go…', ['Into the quote notes', 'Nowhere', 'Into the price'], 0, 'People say yes to their own words.'),
      q('Who should talk more in discovery?', ['The customer', 'You', 'Nobody'], 0, 'Listen more than you talk.'),
    ] },
    { from: 'Read it back', checks: [
      q('Reading the order back catches…', ['Mistakes before the quote', 'Nothing', 'Tax errors only'], 0, 'And shows you listened.'),
      q('The budget is higher than needed. You…', ['Quote what fits', 'Pad the quote', 'Add rush'], 0, 'Never pad.'),
    ] },
  ],
  'cl4-quote': [
    { from: null, checks: [
      q('The main item is…', ['Your recommendation', 'The cheapest', 'All options'], 0, 'Lead with it.'),
      q('Alternatives go on as…', ['Optional items', 'Required items', 'A second quote'], 0, 'They tick what they want.'),
    ] },
    { from: 'Let the form price it', checks: [
      q('A special price is needed. You…', ['Draft it and leave June a note', 'Type it', 'Use the discount box'], 0, 'Prices are June\'s.'),
      q('Rush comes from…', ['The needed-by date', 'A typed percentage', 'The notes'], 0, 'The form adds it.'),
    ] },
    { from: 'Notes the customer reads', checks: [
      q('Customer notes should be…', ['One or two short lines in their words', 'Internal comments', 'Empty always'], 0, 'They read it on their quote.'),
      q('A quote is good for…', ['14 days', '1 day', 'A year'], 0, 'Re-check after 14 days.'),
    ] },
  ],
  'cl5-upsell': [
    { from: null, checks: [
      q('An upsell is said…', ['In one sentence, in money', 'In a long email', 'Without numbers'], 0, 'Short and specific.'),
      q('The numbers come from…', ['The Upsell ideas box or the form', 'A guess', 'A competitor'], 0, 'Never round in your favour.'),
    ] },
    { from: 'Match the customer', checks: [
      q('A team upsell:', ['Names and numbers', 'Opening banner', 'Staff polos'], 0, 'Teams love names and numbers.'),
      q('A business upsell:', ['Embroidered polos and caps', 'Senior night cutouts', 'Field day banner'], 0, 'Workwear.'),
    ] },
    { from: 'Handling a no', checks: [
      q('After a no, you…', ['Move on', 'Ask again tomorrow', 'Offer a discount'], 0, 'Offer once.'),
      q('Who signs off the role-plays?', ['June', 'Nobody', 'The customer'], 0, 'Two good ones.'),
    ] },
  ],
  'cl6-objection': [
    { from: null, checks: [
      q('"Too expensive": first move?', ['Ask what they compared it with', 'Discount', 'Stop replying'], 0, 'Find the real question.'),
      q('A cheaper honest option is…', ['Fewer colours or one print place', 'Skipping the proof', 'Removing tax'], 0, 'Change the order, not the honesty.'),
    ] },
    { from: '"Another shop is cheaper"', checks: [
      q('A price match is…', ['June\'s decision', 'Yours', 'Automatic'], 0, 'Say you will check, then ask June.'),
      q('You compare quotes…', ['Like with like, kindly', 'By criticising them', 'Not at all'], 0, 'Explain the difference.'),
    ] },
    { from: '"We need to think about it"', checks: [
      q('"We need it sooner": you…', ['Check the board and June first', 'Promise it', 'Refuse'], 0, 'Offer rush only with room.'),
      q('A quiet customer gets…', ['Two follow-ups, then stop', 'Daily messages', 'Nothing'], 0, 'About 3 and 10 days.'),
    ] },
  ],
  'cl7-yes': [
    { from: null, checks: [
      q('The deposit on a $300 order is…', ['$150', '$300', '$30'], 0, '50%.'),
      q('A $90 order is paid…', ['In full', 'Half', 'Nothing up front'], 0, 'Under $100 in full.'),
    ] },
    { from: 'From yes to paid', checks: [
      q('Awaiting deposit: your part is…', ['One friendly message, logged', 'Daily calls', 'A discount'], 0, 'The human touch.'),
      q('Getting paid faster with a discount is…', ['June\'s call, never yours', 'Fine', 'Encouraged'], 0, 'Never offer one.'),
    ] },
    { from: 'Artwork and the proof', checks: [
      q('Proof approval must be…', ['In writing, and logged', 'On a call', 'Assumed'], 0, 'Nothing prints until then.'),
      q('After the deposit, tell them…', ['A proof comes next', 'Nothing', 'A guaranteed date'], 0, 'Customers who know approve faster.'),
    ] },
  ],
  'cl8-pipeline': [
    { from: null, checks: [
      q('The day starts with…', ['My Day, oldest first', 'Finances', 'Social posts'], 0, 'People waiting first.'),
      q('The end-of-day note includes…', ['What is stuck and tomorrow\'s first task', 'Only hours', 'Nothing'], 0, 'A clear list for June.'),
    ] },
    { from: 'Your pipeline, every day', checks: [
      q('A sent quote without a follow-up date…', ['Gets forgotten', 'Closes itself', 'Is fine'], 0, 'Every quote needs a date.'),
      q('Read Quotes as…', ['A list of promises', 'A history', 'A price list'], 0, 'Each has a next step.'),
    ] },
    { from: 'Your numbers', checks: [
      q('Low conversion: look at…', ['Discovery and quote fit', 'The weather', 'Tax'], 0, 'Wrong quotes do not close.'),
      q('To improve, change…', ['One habit a week', 'Everything at once', 'Nothing'], 0, 'One at a time.'),
    ] },
  ],
};
