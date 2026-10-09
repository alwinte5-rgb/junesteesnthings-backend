'use strict';

/* The Sales course lessons as pages: each lesson's playbook article is read a
   page at a time, and every page ends with a couple of questions about what
   it just said (multiple choice, answered on the page, never marked).

   `from` is the bold heading a page starts at, so the questions sit beside
   the words they ask about. The first page always starts at the top. If the
   owner renames a heading in the Playbook, the lesson is split evenly into the
   same number of pages instead (lessonPages() in training.js), so an edit can
   never break a lesson. */

const q = (text, choices, answer, why) => ({ q: text, choices, answer, why });

module.exports = {
  's1-welcome': [
    { from: null, checks: [
      q('What does June\'s Tees mostly make?', ['Only shirts sold online', 'Custom apparel (screen print, DTF, embroidery), plus signs, banners and cutouts', 'Blank shirts for other shops'], 1, 'Custom apparel in three methods, and printed products besides.'),
      q('Most of our customers order for…', ['A date: an event, a season or a game', 'No particular reason', 'Resale in their own store'], 0, 'The date drives everything, so you always ask for it.'),
    ] },
    { from: 'What a good day looks like', checks: [
      q('How fast does a quote form get its first reply during your shift?', ['Within 1 hour', 'By the end of the day', 'Within 24 hours'], 0, 'Forms within 1 hour, chats within 15 minutes.'),
      q('Which of these is NOT yours to promise?', ['That a proof comes before printing', 'A refund', 'That you will reply by 2pm'], 1, 'Refunds, discounts, dates and exact colour matches are June\'s.'),
    ] },
    { from: 'How to hand a customer to June', checks: [
      q('A customer asks for 20% off. What do you say first?', ['"Sure!"', '"Let me check with June and get back to you by 3pm"', '"We never give discounts"'], 1, 'Reply now, give a time, ask June, and keep the time.'),
      q('You are unsure of an answer and the Playbook does not have it. What now?', ['Guess', 'Say you will check, ask June in Team chat', 'Skip that question'], 1, 'Asking is never wrong; guessing can be.'),
    ] },
  ],
  's2-tour': [
    { from: null, checks: [
      q('Your shift starts. Where do you go first?', ['Quotes', 'My Day', 'Playbook'], 1, 'My Day lists what needs you, oldest first.'),
      q('What counts as "answered" on a lead?', ['Reading it', 'Logging the call, email, text or chat on the lead', 'Building a quote'], 1, 'Logging is what counts, and what June sees.'),
    ] },
    { from: 'Quotes: the money board', checks: [
      q('Where do you see a job\'s step: artwork, proof, blanks, printing, ready?', ['Quotes', 'Production', 'Leads'], 1, 'Production is the work board.'),
      q('Where do you see everything a customer ordered before?', ['Customers', 'Team chat', 'Training'], 0, 'Search Customers by name, email or phone.'),
    ] },
    { from: 'Playbook', checks: [
      q('A customer asks about deposits. Quickest ready reply?', ['Google it', 'Search the Playbook (or its shortcut)', 'An old email'], 1, 'Copy the Playbook reply, then make it personal.'),
      q('Where do you ask June something private?', ['Direct with June, in Team chat', 'The # Sales channel', 'A customer email'], 0, 'Channels are for the team; Direct is just you and June.'),
    ] },
    { from: 'Your level, and why some things wait', checks: [
      q('Your quote says "waiting for approval". What does it mean?', ['Something broke', 'June checks it before the customer sees it', 'The customer declined'], 1, 'While you are in training, June checks quotes and messages first.'),
      q('Where do shared logins live?', ['In Team chat', 'In the team password manager', 'In a text from June'], 1, 'Never in chat, email or texts.'),
    ] },
  ],
  's3-methods': [
    { from: null, checks: [
      q('How many pieces does screen printing start at?', ['12', '24', '50'], 2, 'Each colour needs its own screen, so small runs cost too much.'),
      q('A 3-colour design on the front only needs how many screens?', ['3', '4: three colours plus the white base', '6'], 1, 'Screens = (ink colours + 1 for the white base) x print places.'),
    ] },
    { from: 'DTF (direct-to-film)', checks: [
      q('A family wants 8 shirts with a full-colour photo. Which method?', ['Screen printing', 'DTF', 'Embroidery'], 1, 'Full colour, no minimum: DTF.'),
      q('What is the one-time fee for embroidery called?', ['Digitizing', 'Screen setup', 'Rush'], 0, 'The logo becomes a stitch file once; reorders reuse it.'),
    ] },
    { from: 'Patches, vinyl and puff print', checks: [
      q('A logo on 20 polos. Best fit?', ['Embroidery', 'Screen printing', 'Vinyl, without asking'], 0, 'Logos on polos, caps and jackets: embroidery.'),
      q('A customer wants a Chicago Bulls logo. What do you do?', ['Quote it', 'Bring it to June and offer an original design', 'Use DTF so it is allowed'], 1, 'Logos the customer does not own always go to June.'),
    ] },
  ],
  's3-products': [
    { from: null, checks: [
      q('How do you find a garment\'s price?', ['Look it up on the supplier site', 'The quote form prices it for you', 'Ask the customer'], 1, 'You never look up a garment price by hand.'),
      q('A coach wants giant photo heads of the players. What is that?', ['A banner', 'Big Head Cutouts', 'A yard sign'], 1, 'Singles or packs; a pack is often cheaper per head.'),
    ] },
    { from: 'Turnaround', checks: [
      q('When does the turnaround clock start?', ['At the first message', 'When the proof is approved and the deposit paid', 'When you send the quote'], 1, 'Late artwork or approval moves the date.'),
      q('Rush for next business day adds…', ['+10%', '+30%', '+80%'], 2, 'Next day +80%, 2 days +50%, 3 days +30%, 4 days +10%.'),
    ] },
    { from: 'Getting the order to the customer', checks: [
      q('Which is NOT one of the ways an order reaches the customer?', ['Free pickup', 'Shipping or local delivery', 'Dropped at any address for free'], 2, 'Pickup, shipping, or local delivery to nearby ZIPs.'),
      q('Why double-check the address before buying a shipping label?', ['A bought label cannot be moved', 'Labels are free', 'The customer pays for it'], 0, 'A label cannot be changed once bought.'),
    ] },
  ],
  's4-leads': [
    { from: null, checks: [
      q('How fast does a website chat get a reply?', ['15 minutes', '1 hour', 'Same day'], 0, 'Chats 15 minutes, forms 1 hour.'),
      q('Which is one of the five details for a quote?', ['Their budget for next year', 'The date they need them by', 'Their favourite colour'], 1, 'Quantity and sizes, garment, placement and colours, artwork, and the date.'),
    ] },
    { from: 'A good first reply', checks: [
      q('A good first reply asks the missing details…', ['Over several messages', 'All in one message, numbered', 'Only on the phone'], 1, 'One friendly message, easy to answer.'),
      q('After a call, what do you do?', ['Nothing', 'Log it on the lead with a short summary and a follow-up date', 'Email June'], 1, 'Log every contact and set a follow-up date.'),
    ] },
    { from: 'When they answer the five questions', checks: [
      q('How do you start the quote?', ['Quotes, New quote', 'The Quote button on their lead', 'Email them a price'], 1, 'The Quote button links the quote to the lead.'),
      q('A gym asks for 20 staff tees. What else might you ask, once?', ['Nothing', 'If they also need polos, hoodies or event shirts', 'For a bigger order to get a discount'], 1, 'Spot the bigger order, without pushing.'),
    ] },
  ],
  's5-quotes': [
    { from: null, checks: [
      q('What goes in "Each $" on a normal item?', ['Your best guess', 'Nothing: leave it blank so the system prices it', 'The garment cost'], 1, 'A typed price is a custom price June checks.'),
      q('The design goes on the front and the back. How?', ['One row with "front and back"', 'Two Where rows, each with its method and ink colours', 'Double the quantity'], 1, 'Each print place is its own row.'),
    ] },
    { from: 'Sizes and details', checks: [
      q('The sizes add up to 45 but the Qty is 50. What is wrong?', ['Nothing', 'Sizes must add up to the Qty', 'The Qty should be 100'], 1, 'Sizes and quantity must match.'),
      q('A customer wants to compare a tee and a hoodie. What do you build?', ['Two quotes', 'One quote with both items ticked Optional', 'An email with two prices'], 1, 'Optional items let the customer tick what they want.'),
    ] },
    { from: 'Dates and notes', checks: [
      q('Why does the real "Needed by" date matter?', ['It does not', 'The form sets the rush from it', 'It sets the deposit'], 1, 'Rush is worked out from the Needed by date.'),
      q('A school asks for no tax. What do you need?', ['Nothing', 'Their Illinois exemption letter (E-number), approved first', 'The principal\'s signature'], 1, 'Tax comes off only with an approved certificate.'),
    ] },
    { from: 'Deposits', checks: [
      q('A $600 quote is accepted. The deposit to start is…', ['$600', '$300', '$0'], 1, '50%, or the full amount under $100.'),
      q('You are waiting on artwork. How do you keep the quote private?', ['Send it anyway', 'Save as draft', 'Delete it'], 1, 'A draft sends nothing and the link does not open.'),
    ] },
  ],
  's5-practice': [
    { from: null, checks: [
      q('Why leave the phone and email blank on a practice quote?', ['To save time', 'So nothing can ever be sent to anyone', 'The form requires it'], 1, 'A practice quote must never reach a real person.'),
      q('Which decoration is the practice order?', ['DTF', 'Screen printing, 1 colour, front only', 'Embroidery'], 1, '50 black tees, white logo on the front.'),
    ] },
    { from: 'Step 4: dates and notes', checks: [
      q('Which button do you press at the end?', ['Finish', 'Save as draft', 'Duplicate'], 1, 'Save as draft, not Finish.'),
      q('Change the Qty to 30. What does the orange warning say?', ['Nothing', 'Screen printing starts at 50: quote DTF', 'Add a rush'], 1, 'Then change it back to 50.'),
    ] },
  ],
  's7-upsell': [
    { from: null, checks: [
      q('Who is the Upsell ideas box for?', ['The customer', 'You: the customer never sees it', 'June only'], 1, 'A private suggestion for you to offer.'),
      q('When do you press Apply & save?', ['Always', 'Only after the customer says yes', 'Never'], 1, 'Otherwise offer it.'),
    ] },
    { from: 'Upsells that fit common orders', checks: [
      q('Which upsell fits a youth baseball team?', ['Names and numbers on the back, or coach hats', 'A discount', 'Bigger sizes for everyone'], 0, 'Natural team add-ons.'),
      q('When is a good time to offer an upsell?', ['After they have paid', 'In the first quote as an option, or in the follow-up', 'Every day until they say yes'], 1, 'Offer it once, at the right time.'),
    ] },
    { from: 'When not to upsell', checks: [
      q('Their budget is fixed. Which upsell is OK?', ['Hoodies for everyone', 'A price break that lowers their per-piece price', 'Rush'], 1, 'Only what saves them money.'),
      q('Which is NEVER OK?', ['Offering it as an optional item', 'Promising a discount to close it', 'Mentioning it in a follow-up'], 1, 'Discounts are June\'s.'),
    ] },
  ],
  's8-prospect': [
    { from: null, checks: [
      q('It is February. Who is most likely to need shirts soon?', ['Spring sports leagues', 'Back-to-school PTOs', 'Homecoming'], 0, 'January to March: spring sports and spring break trips.'),
      q('How long before they need shirts do you reach out?', ['The day before', '4 to 6 weeks', 'A year'], 1, 'While they are deciding.'),
    ] },
    { from: 'What makes a good prospect', checks: [
      q('When do you click "I found this customer"?', ['After they pay', 'When you add them on Leads, before you quote', 'Never'], 1, 'Only then is it your rep lead.'),
      q('Which first message is best?', ['"BUY SHIRTS NOW!"', 'A short personal note naming their team or event, with one easy next step', 'Our full price list'], 1, 'Personal, specific, one easy yes.'),
    ] },
    { from: 'Follow-up', checks: [
      q('How many follow-ups at most?', ['None', 'Two: about 3 days, then about 10', 'Daily until they reply'], 1, 'Then stop.'),
      q('You found a coach\'s phone number online. Do you text them?', ['Yes', 'No: email or DM only', 'Once'], 1, 'Never text or call a number found online.'),
    ] },
  ],
  's9-reorders': [
    { from: null, checks: [
      q('What does the system send by itself?', ['Nothing', 'A reorder email about 90 days after they paid', 'A discount code monthly'], 1, 'You add the personal touch for the best customers.'),
      q('A team reorders with a new year on the design. Proof?', ['No, approved last year', 'Yes, a new proof approved in writing', 'Only if they ask'], 1, 'Changed artwork is approved again.'),
    ] },
    { from: 'Tax-exempt customers', checks: [
      q('A church\'s exemption letter has expired. What do you do?', ['Use the old one', 'Ask for the new one before quoting without tax', 'Ignore it'], 1, 'Tax comes off only with a valid certificate.'),
      q('An angry review comes in. First step?', ['Argue publicly', 'Tell June the same day and draft a calm reply', 'Delete it'], 1, 'June sees it before anything is posted.'),
    ] },
  ],
  's10-money': [
    { from: null, checks: [
      q('No reply 3 days after a quote. Best step?', ['Wait', 'One friendly note, mention the 14 days, set a new follow-up date', 'Offer a discount'], 1, 'Most sales are won on the follow-up.'),
      q('"Another shop is 15% cheaper." You…', ['Match it', 'Ask to see their quote, explain what ours includes, check with June', 'Offer 10%'], 1, 'Price matches are June\'s.'),
    ] },
    { from: 'Artwork and proofs', checks: [
      q('The customer says "looks great" about a proof on a call. Can it print?', ['Yes', 'Not until approval is in writing and logged', 'After 24 hours'], 1, 'Approval must be in writing.'),
      q('What may you paste into ChatGPT?', ['A reply with the customer\'s name and email', 'A reply with names and contact details removed', 'A screenshot of the quote'], 1, 'Never customer details, totals or back-office screenshots.'),
    ] },
    { from: 'Your end-of-day note', checks: [
      q('At 3%, commission on a $1,082.50 rep-lead quote with $82.50 tax is…', ['$32.48', '$30.00', '$0'], 1, '3% of the price before tax ($1,000).'),
      q('A big order came in through the website chat. Commission?', ['Yes', 'No: a shop lead, covered by your wage', 'Half'], 1, 'Only rep leads earn commission.'),
    ] },
  ],
  's10-social': [
    { from: null, checks: [
      q('What does COS use a photo\'s description for?', ['Nothing', 'Matching media to posts', 'Billing'], 1, 'Describe what it is, the method and the group.'),
      q('Before a generated post is scheduled, you…', ['Do nothing', 'Read it: our voice, spelling, details, one clear next step', 'Add more hashtags'], 1, 'Every post is read before it goes out.'),
    ] },
    { from: '4. Calendar', checks: [
      q('May you post a customer\'s team photo?', ['Yes', 'Only with their permission, and a parent\'s OK for any child\'s face', 'Only on Instagram'], 1, 'Never without permission.'),
      q('A post mentions a discount June has not approved. You…', ['Post it', 'Take it out before it is scheduled', 'Post it on one platform only'], 1, 'Nothing about prices or discounts June has not approved.'),
    ] },
  ],
};
