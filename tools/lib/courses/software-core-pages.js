'use strict';

/* The Software sales course lessons as pages, the same way ads-core-pages.js
   does the Ads course: `from` is the bold heading a page starts at, and every
   page ends with a couple of questions about what it just said (multiple
   choice, answered on the page, never marked). */

const q = (text, choices, answer, why) => ({ q: text, choices, answer, why });

module.exports = {
  'w2-apps': [
    { from: null, checks: [
      q('Who finds the smaller customers?', ['You', 'Our ads', 'Nobody'], 1, 'You spend your time where one sale is worth the most.'),
      q('COS publishes to…', ['Facebook only', 'Facebook, Instagram, Threads, TikTok, YouTube, LinkedIn, Pinterest, X and Google Business Profile', 'Email only'], 1, 'Nine platforms, on a schedule.'),
    ] },
    { from: 'The Agency plan: what you sell', checks: [
      q('Agency yearly costs…', ['$1,290', '$129', '$1,548'], 0, 'Two months free.'),
      q('Who sees white label?', ['The agency\'s team and clients', 'Only us', 'Nobody'], 0, 'Their name and logo instead of ours.'),
    ] },
    { from: 'CartBook and the business dashboard', checks: [
      q('CartBook is for…', ['Food creators with recipes', 'Car dealers', 'Accountants'], 0, 'A cookbook app their followers subscribe to.'),
      q('The dashboard\'s Everything package suits…', ['Contractors and salons with teams', 'Students', 'Large banks'], 0, 'Bookings, quotes, payments, team and website.'),
    ] },
  ],
  'w2-buyer': [
    { from: null, checks: [
      q('Why does fit matter to your pay?', ['Poor fits cancel, and commission goes with them', 'It does not', 'Fit doubles your wage'], 0, 'Customers who stay keep paying.'),
      q('Which buys Agency?', ['A freelancer with 6 clients', 'A single bakery', 'A person with no social media'], 0, 'Several brands.'),
    ] },
    { from: 'The problem they have', checks: [
      q('Where do an agency\'s hours go?', ['Logging in and out, captions, graphics, approvals', 'Printing', 'Taxes'], 0, 'Posting for many brands is slow.'),
      q('What can they not do without COS?', ['Take more clients without hiring', 'Open a website', 'Send email'], 0, 'The work grows with every client.'),
    ] },
    { from: 'Signs of a good fit', checks: [
      q('They pay for Sprout today. That is…', ['A good sign', 'A reason to stop'], 0, 'They buy software.'),
      q('A one-shop owner asks about COS. You…', ['Point them to the website and the free plan', 'Book a long demo'], 0, 'Politely, and move on.'),
    ] },
  ],
  'w3-find': [
    { from: null, checks: [
      q('Good prospects come from…', ['Looking where agencies show their work', 'Bought lists'], 0, 'Research, not lists.'),
      q('In Facebook groups you…', ['Read and help first, never spam', 'Post an ad every day'], 0, 'Groups ban spammers.'),
    ] },
    { from: 'What to write down for each one', checks: [
      q('Without a real detail you…', ['Do not send a first message', 'Send a generic one'], 0, 'The detail makes it personal.'),
      q('Which is a real detail?', ['Their post about hiring a social media assistant', '"They have a website"'], 0, 'Something specific to them.'),
    ] },
    { from: 'What we never do', checks: [
      q('Scraping email addresses is…', ['Never done', 'Fine if quick'], 0, 'Spam that gets us blocked.'),
      q('A good day is…', ['15 to 25 researched prospects', '500 copied messages'], 0, 'Quality first.'),
    ] },
  ],
  'w3-tracker': [
    { from: null, checks: [
      q('The board is how a sale is…', ['Credited to you', 'Hidden'], 0, 'Plus memory and proof.'),
      q('Every open lead has…', ['A next step and a date', 'A discount'], 0, 'No lead without a next step.'),
    ] },
    { from: 'Statuses, in order', checks: [
      q('They paid. The status is…', ['Won', 'Trial'], 0, 'Note the plan and monthly or yearly.'),
      q('A lead goes quiet after your last follow-up. Status?', ['Lost, with why', 'Won'], 0, 'Write the reason.'),
    ] },
    { from: 'Your daily routine', checks: [
      q('First thing each day:', ['Leads due today or earlier', 'New research'], 0, 'Follow-ups first.'),
      q('Your numbers are counted…', ['Each Friday, from the board', 'Never'], 0, 'They go in the weekly report.'),
    ] },
  ],
  'w4-first': [
    { from: null, checks: [
      q('A first message should include prices?', ['No', 'Yes'], 0, 'No feature list, no prices, no attachments.'),
      q('It ends with…', ['One easy question', 'Three questions'], 0, 'A 15-minute look, or the free trial.'),
    ] },
    { from: 'An example', checks: [
      q('The example opens with…', ['Her post about Mondays', 'Our company history'], 0, 'Their detail first.'),
      q('"We are a leading AI platform" as an opener…', ['Loses them', 'Works best'], 0, 'Start with them, not us.'),
    ] },
    { from: 'Email rules', checks: [
      q('Business emails must…', ['Say who you are and stop when asked', 'Use a fake name'], 0, 'Honest sender and an easy way out.'),
      q('How many channels at once?', ['One', 'All three'], 0, 'Where they are most active.'),
    ] },
  ],
  'w4-followup': [
    { from: null, checks: [
      q('When do follow-ups go out with no reply?', ['Days 3, 7 and 14', 'Every day'], 0, 'Then stop.'),
      q('After day 14 with no reply you…', ['Mark it lost, with a 3-month reminder if a good fit', 'Keep messaging'], 0, 'Close the loop.'),
    ] },
    { from: 'Each follow-up adds something', checks: [
      q('"Just checking in" gives them…', ['Nothing', 'A reason to reply'], 0, 'Add an idea or a short video.'),
      q('The last message is…', ['Kind, and closes the loop', 'Angry'], 0, 'People often reply to it.'),
    ] },
    { from: 'After a demo', checks: [
      q('The recap goes out…', ['Within one working day', 'In a month'], 0, 'While it is fresh.'),
      q('They say no. You…', ['Thank them and stop', 'Argue'], 0, 'Never argue with a no.'),
    ] },
  ],
  'w5-discovery': [
    { from: null, checks: [
      q('People buy…', ['A fix for their own problem', 'A feature list'], 0, 'Discovery finds the problem.'),
      q('Which is a discovery question?', ['"Where does the time go?"', '"Want a discount?"'], 0, 'Five questions before the pitch.'),
    ] },
    { from: 'Listen more than you talk', checks: [
      q('Their exact words are for…', ['Showing the fix in their terms', 'Nothing'], 0, '"You said captions take your Mondays."'),
      q('Who decides matters because…', ['The person on the call may not be the buyer', 'It does not'], 0, 'Offer to show both.'),
    ] },
    { from: 'When COS is not the answer', checks: [
      q('An honest "not the right fit" builds…', ['Trust and referrals', 'Nothing'], 0, 'Point them somewhere useful.'),
      q('They need an ad agency, not a tool. You…', ['Say so', 'Sell Agency anyway'], 0, 'Honesty first.'),
    ] },
  ],
  'w5-demo': [
    { from: null, checks: [
      q('Once a demo time is agreed, you…', ['Mark the lead "Demo booked" on the board the same day', 'Keep it in your head'], 0, 'The board is how the lead is credited to you.'),
      q('You demo from…', ['The demo account', 'A customer\'s account'], 0, 'Never a real customer\'s.'),
    ] },
    { from: 'The order', checks: [
      q('How long is the showing part?', ['About 8 minutes', 'An hour'], 0, '5, 8, 2.'),
      q('You end with…', ['"Would you like to try it with two clients for 14 days?"', '"Let me know"'], 0, 'Ask directly.'),
    ] },
    { from: 'What not to do', checks: [
      q('The price is said…', ['Plainly when it matters', 'Never'], 0, '$129 a month, or $1,290 a year.'),
      q('They want more time. You…', ['Offer a second call', 'Run 45 minutes over'], 0, 'Respect the 15 minutes.'),
    ] },
  ],
  'w6-objections': [
    { from: null, checks: [
      q('An objection is…', ['A question in disguise', 'The end of the sale'], 0, 'Answer it calmly.'),
      q('The last of the four steps is…', ['Lower the risk with a next step', 'Discount'], 0, 'Agree, ask, answer, lower the risk.'),
    ] },
    { from: '"We already use Later / Hootsuite / Buffer"', checks: [
      q('You talk about their current tool…', ['Without knocking it', 'By calling it bad'], 0, 'Ask what they like and don\'t.'),
      q('A good next step here is…', ['A side-by-side trial with two clients', 'Cancelling their tool today'], 0, 'Low risk.'),
    ] },
    { from: '"Let me think about it"', checks: [
      q('You reply…', ['"What would you want to be sure of?"', '"Fine, bye"'], 0, 'Then answer it or agree a date.'),
      q('Which is never allowed?', ['An unapproved discount', 'Agreeing it is fair'], 0, 'Offers are controlled.'),
    ] },
  ],
  'w6-offers': [
    { from: null, checks: [
      q('How many offers may you make without asking?', ['Three', 'Any'], 0, 'Free plan, 14-day trial, yearly.'),
      q('The free plan needs…', ['No card', 'A card'], 0, 'Good for small businesses.'),
    ] },
    { from: 'What needs June first', checks: [
      q('A 30-day trial is…', ['June\'s decision', 'Yours'], 0, 'Longer than 14 days needs June.'),
      q('While June decides you tell the prospect…', ['"I\'ll check with June and come back today"', 'Nothing'], 0, 'Honest and quick.'),
    ] },
    { from: 'Saying no to a discount', checks: [
      q('Instead of a discount you offer…', ['The 14-day trial and the yearly saving', 'A bigger discount'], 0, 'Keeps the sale moving.'),
      q('A customer won by discount is…', ['More likely to cancel', 'More loyal'], 0, 'Value at full price keeps them.'),
    ] },
  ],
  'w7-trial': [
    { from: null, checks: [
      q('On day 0 they…', ['Add two brands and plan a week', 'Do nothing'], 0, 'See the value early.'),
      q('Their passwords are…', ['Never yours to take', 'Fine to write down'], 0, 'They connect accounts themselves.'),
    ] },
    { from: 'Check-ins', checks: [
      q('Day 12 is for…', ['Asking for the decision', 'Saying goodbye'], 0, 'Monthly or yearly.'),
      q('Check-ins are logged…', ['On the board', 'Nowhere'], 0, 'Every contact.'),
    ] },
    { from: 'If they are not using it', checks: [
      q('A quiet trial gets…', ['An honest question and a setup call offer', 'Pressure'], 0, 'Find what got in the way.'),
      q('Extending a trial is…', ['June\'s decision', 'Yours'], 0, 'Never promise it.'),
    ] },
  ],
  'w7-handoff': [
    { from: null, checks: [
      q('Setting things up for a customer is…', ['A paid service', 'Always free'], 0, 'June runs it.'),
      q('Showing them how on a screen share is…', ['Free', 'Paid'], 0, 'Showing is free.'),
    ] },
    { from: 'Paid setup', checks: [
      q('A setup price June has not set…', ['Is never quoted', 'Is guessed'], 0, 'Pass it to June.'),
      q('Paid setup covers things like…', ['Texting, card payments, a website domain', 'Our hiring'], 0, 'Connecting other accounts.'),
    ] },
    { from: 'Handing over', checks: [
      q('In the first month you check in at…', ['Weeks 2 and 4', 'Every day'], 0, 'Friendly, not pushy.'),
      q('A referral becomes…', ['A new lead, noting who referred them', 'Nothing'], 0, 'Log it.'),
    ] },
  ],
  'w8-pay': [
    { from: null, checks: [
      q('Your wage is paid…', ['Weekly by Wise', 'Yearly'], 0, 'The wage and hours in your offer.'),
      q('Hours count when you…', ['Clock in and out on the Timeclock', 'Remember them'], 0, 'Every hour on the Timeclock.'),
    ] },
    { from: 'Your commission', checks: [
      q('A refund on a payment…', ['Takes back the commission on that payment', 'Doubles it'], 0, 'Commission follows payments.'),
      q('Monthly Agency for 6 months earns you…', ['$77.40', '$7.74'], 0, '$12.90 × 6.'),
    ] },
    { from: 'Why customers who stay matter', checks: [
      q('Yearly is good for you because…', ['Your commission comes at once', 'It is cheaper for you'], 0, 'Paid up front, in the first 6 months.'),
      q('A pay question goes…', ['Directly to June', 'In a team channel'], 0, 'Pay is between you and June.'),
    ] },
  ],
  'w8-report': [
    { from: null, checks: [
      q('A customer\'s card number may be…', ['Never taken or typed by you', 'Kept safely in your notes'], 0, 'Never.'),
      q('Customer details may go into an AI tool?', ['No', 'Yes'], 0, 'They stay in our tools.'),
    ] },
    { from: 'Your weekly report', checks: [
      q('The report is…', ['Five lines, every Friday', 'A long monthly document'], 0, 'June reads it in a minute.'),
      q('A decision you need goes…', ['In the report, clearly', 'Nowhere'], 0, 'Line five.'),
    ] },
    { from: 'Reading your numbers', checks: [
      q('Few replies means…', ['Change the first message or the prospects', 'Give discounts'], 0, 'The start of the funnel.'),
      q('Demos but no trials means…', ['Discovery missed their real problem', 'They loved it'], 0, 'Ask better questions.'),
    ] },
  ],
};
