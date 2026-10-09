'use strict';

/* The Account Manager lessons as pages, the same way sales-core-pages.js does
   the Sales course: `from` is the bold heading a page starts at, and every
   page ends with a couple of questions about what it just said. */

const q = (text, choices, answer, why) => ({ q: text, choices, answer, why });

module.exports = {
  'am1-job': [
    { from: null, checks: [
      q('Which customers are yours?', ['Everyone who has ordered before', 'Only new leads', 'Only businesses'], 0, 'Past customers.'),
      q('A new customer becomes yours…', ['After their first order is done', 'On their first message', 'Never'], 0, 'Lead Gen and the Closer bring them in.'),
    ] },
    { from: 'What the system already does', checks: [
      q('About 90 days after payment the system sends…', ['A reorder email', 'A refund', 'Nothing'], 0, 'The automatic nudge.'),
      q('What do you add?', ['The personal touch', 'More automatic emails', 'Discounts'], 0, 'The right note, to the right person, at the right time.'),
    ] },
  ],
  'am2-calendar': [
    { from: null, checks: [
      q('Leagues order…', ['Every season', 'Once ever', 'Every ten years'], 0, 'Spring and fall.'),
      q('Schools order spirit wear…', ['For back to school', 'Never', 'Only in December'], 0, 'August.'),
    ] },
    { from: 'Four to six weeks before', checks: [
      q('Write a reorder note…', ['4 to 6 weeks before', 'The week of', 'Six months before'], 0, 'When they decide.'),
      q('After an order, set…', ['A follow-up date for their next need', 'Nothing', 'A discount'], 0, 'My Day brings them back.'),
    ] },
  ],
  'am3-history': [
    { from: null, checks: [
      q('Where is a customer\'s history?', ['Customers', 'Resources', 'Training'], 0, 'Search by name, email or phone.'),
      q('When they ordered tells you…', ['Their season', 'Their tax', 'Nothing'], 0, 'The calendar.'),
    ] },
    { from: 'What went well, and what to fix', checks: [
      q('Something went wrong last time. You…', ['Fix it and say so', 'Hope they forgot', 'Blame someone'], 0, 'Show you learned.'),
      q('What you learn goes…', ['On their lead', 'In your head', 'Nowhere'], 0, 'The account keeps it.'),
    ] },
  ],
  'am4-reorder': [
    { from: null, checks: [
      q('A reorder note has…', ['What we made, their season, one easy step', 'A price list', 'A discount'], 0, 'Three parts.'),
      q('May the note promise a date?', ['No', 'Yes', 'Sometimes'], 0, 'Check timing when they reply.'),
    ] },
    { from: 'The reorder quote', checks: [
      q('The reorder quote starts from…', ['Their last order', 'A blank form', 'A guess'], 0, 'So it matches.'),
      q('What usually changes?', ['Quantities and sizes', 'Nothing', 'The shop name'], 0, 'Always check.'),
    ] },
    { from: 'When a new proof is needed', checks: [
      q('The year on the design changes. A new proof is…', ['Needed, in writing', 'Not needed', 'Optional'], 0, 'Any artwork change.'),
      q('Who reads your first five notes?', ['June', 'Nobody', 'The customer'], 0, 'June signs off.'),
    ] },
  ],
  'am5-yearly': [
    { from: null, checks: [
      q('For each yearly account keep…', ['A main contact, a backup and their calendar', 'Only an email', 'Nothing'], 0, 'One contact, one calendar.'),
      q('A new contact replies. You…', ['Welcome them and update the lead', 'Ignore them', 'Write to the old contact'], 0, 'Volunteers change.'),
    ] },
    { from: 'Tax paperwork', checks: [
      q('An expired certificate means…', ['Ask for the new one before quoting', 'Untick tax', 'Nothing'], 0, 'June approves exemptions.'),
      q('Who takes tax off?', ['June, after the certificate', 'You', 'The customer'], 0, 'Never you.'),
    ] },
    { from: 'Make ordering again effortless', checks: [
      q('The first option is…', ['The same as last time', 'A new design', 'A discount'], 0, 'Only sizes to confirm.'),
      q('A yearly account messages. Reply…', ['The same day', 'Next week', 'Whenever'], 0, 'They are worth many orders.'),
    ] },
  ],
  'am6-reviews': [
    { from: null, checks: [
      q('Reply to a review within…', ['Two days', 'Two weeks', 'Never'], 0, 'Every review.'),
      q('Who approves replies?', ['June', 'The customer', 'Nobody'], 0, 'Before they go live.'),
    ] },
    { from: 'A bad review', checks: [
      q('A bad review goes first to…', ['June, the same day', 'A public reply', 'The bin'], 0, 'June sees it first.'),
      q('A public reply may offer a refund?', ['No, never', 'Yes', 'Only for 1-star'], 0, 'June handles that privately.'),
    ] },
    { from: 'Asking for reviews', checks: [
      q('May you offer a gift for a review?', ['Never', 'Yes', 'Small ones'], 0, 'Nothing in return.'),
      q('A happy customer: you may…', ['Ask once, kindly', 'Ask daily', 'Write it for them'], 0, 'Once, kindly.'),
    ] },
  ],
  'am7-upgrades': [
    { from: null, checks: [
      q('A business with tees might upgrade to…', ['Embroidered polos', 'Graduation cutouts', 'Reunion shirts'], 0, 'More professional.'),
      q('Before winter, offer…', ['Hoodies', 'Field day shirts', 'Nothing'], 0, 'Seasonal.'),
    ] },
    { from: 'How to offer it', checks: [
      q('Upgrades go on the quote as…', ['Optional items', 'Required items', 'Hidden lines'], 0, 'They tick it.'),
      q('Upgrade prices come from…', ['The form or Upsell ideas box', 'A guess', 'Last year'], 0, 'Never guess.'),
    ] },
    { from: 'When not to', checks: [
      q('Their budget is fixed. You…', ['Skip upgrades', 'Offer everything', 'Add them anyway'], 0, 'Respect the budget.'),
      q('They say no. You…', ['Drop it and note it', 'Ask again', 'Discount it'], 0, 'Offer once.'),
    ] },
  ],
  'am8-quiet': [
    { from: null, checks: [
      q('A quiet customer gets…', ['One personal note, then a follow-up date', 'Weekly emails', 'Texts'], 0, 'No chasing.'),
      q('First, you look at…', ['Their history', 'The newsletter', 'Discounts'], 0, 'Know them first.'),
    ] },
    { from: 'What never to do', checks: [
      q('Bulk emails from your own account are…', ['Never allowed', 'Fine', 'Fine on Fridays'], 0, 'Campaigns are June\'s.'),
      q('Texting someone who has not agreed is…', ['Never allowed', 'Fine once', 'Fine for schools'], 0, 'Texts need their agreement.'),
    ] },
    { from: 'A sample day', checks: [
      q('The day starts with…', ['My Day, oldest first', 'Reviews', 'Upgrades'], 0, 'People waiting first.'),
      q('Reorder notes this week are for…', ['Seasons in the next six weeks', 'Last year', 'Nobody'], 0, 'Look ahead.'),
    ] },
  ],
};
