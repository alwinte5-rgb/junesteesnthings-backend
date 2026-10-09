'use strict';

/* The Lead Generation lessons as pages, the same way sales-core-pages.js does
   the Sales course: `from` is the bold heading a page starts at, and every
   page ends with a couple of questions about what it just said (multiple
   choice, answered on the page, never marked). */

const q = (text, choices, answer, why) => ({ q: text, choices, answer, why });

module.exports = {
  'lg1-job': [
    { from: null, checks: [
      q('Which part of a customer\'s life is Lead Generation\'s?', ['Finding them and the first contact', 'Collecting the balance', 'Reorders'], 0, 'You fill the pipeline; the Closer and Account Manager take it from there.'),
      q('A prospect you found asks for a price. Now they are…', ['Still a prospect', 'A lead, answered within the hour', 'The Account Manager\'s'], 1, 'A price question is a lead like any other.'),
    ] },
    { from: 'What you are measured on', checks: [
      q('Reply rate is…', ['Replies divided by first messages', 'Messages per hour', 'Quotes accepted'], 0, 'It shows whether openers and prospects are good.'),
      q('Which is worth more?', ['Ten pages with nobody behind them', 'One prospect with a person, a date and a reason to buy now'], 1, 'Quality beats count.'),
    ] },
    { from: 'What never changes', checks: [
      q('How do you contact a prospect?', ['Text or call', 'Email or DM only', 'Any way that works'], 1, 'Never text or call a number you found online.'),
      q('When do you register a prospect on Leads?', ['Before you quote them', 'After they pay', 'Only if they reply'], 0, 'Register first.'),
    ] },
  ],
  'lg2-calendar': [
    { from: null, checks: [
      q('On any day, you prospect for what happens…', ['Today', '4 to 6 weeks from now', 'Next year'], 1, 'Groups decide 4 to 6 weeks before.'),
      q('In late July you look for…', ['Back to school and fall sports', 'Summer camps', 'Holiday gifts'], 0, 'Reach them while they decide.'),
    ] },
    { from: 'The calendar', checks: [
      q('January to March brings…', ['Spring sports sign-ups and spring break trips', 'Homecoming', 'Graduation'], 0, 'Spring sports, business kickoffs, spring break.'),
      q('Which groups order all year?', ['Businesses, churches and clubs', 'Only schools', 'Only leagues'], 0, 'Businesses, churches, clubs, Greek life, birthdays and memorials.'),
    ] },
    { from: 'What each customer type orders', checks: [
      q('A league usually orders…', ['Uniforms with names and numbers, and fan shirts', 'Opening banners', 'Reunion shirts'], 0, 'Every season.'),
      q('A small family group usually suits…', ['DTF', 'Screen printing', 'Embroidery only'], 0, 'Small runs suit DTF.'),
    ] },
    { from: 'Picking today\'s search', checks: [
      q('A good search has…', ['One type, one area, one date 4 to 6 weeks out', 'Everyone in Chicago', 'No date'], 0, 'Focused searches find better prospects.'),
      q('Past customers are useful because…', ['They show which types already buy', 'They are your rep leads', 'They need no follow-up'], 0, 'Find more like them; the customers are the Account Manager\'s.'),
    ] },
  ],
  'lg3-research': [
    { from: null, checks: [
      q('A Maps listing is worth a look when it has…', ['Recent reviews, photos and a website', 'Only a name', 'A closed sign'], 0, 'Check it is alive.'),
      q('A business that opened recently needs…', ['Staff shirts and opening signs', 'Graduation cutouts', 'Nothing'], 0, 'New businesses need both.'),
    ] },
    { from: 'School, league and PTO websites', checks: [
      q('The best reason to write is…', ['A date on their own page', 'Their logo', 'Their address'], 0, 'A date gives your message a reason.'),
      q('A Facebook group bans selling. You…', ['Do not sell there', 'Post once anyway', 'Post in comments'], 0, 'Respect the group\'s rules; message the organiser instead.'),
    ] },
    { from: 'Eventbrite and city calendars', checks: [
      q('On Eventbrite, who decides on event shirts?', ['The organiser listed on the event', 'The runners', 'The venue'], 0, 'The organiser.'),
      q('A ribbon cutting on the Chamber page means…', ['A business is opening', 'A school event', 'A reunion'], 0, 'Staff shirts, polos and a banner.'),
    ] },
    { from: 'What to write on the lead', checks: [
      q('The phone box on a found prospect is…', ['Left blank', 'Filled from their page', 'Required'], 0, 'We never call or text a number found online.'),
      q('When do you register them?', ['Before you send anything', 'After they reply', 'After the quote'], 0, 'Register first; the first registration wins.'),
    ] },
  ],
  'lg4-decider': [
    { from: null, checks: [
      q('Who decides on spirit wear at a school?', ['The PTO or booster president, or spirit wear chair', 'A student', 'The janitor'], 0, 'Spirit wear runs through the PTO.'),
      q('At a bigger business, staff shirts often go through…', ['The office or HR manager', 'A customer', 'The landlord'], 0, 'Or the owner in a small one.'),
    ] },
    { from: 'Finding their contact', checks: [
      q('Which contact may you use?', ['One the group publishes for this', 'A guessed email', 'A bought list'], 0, 'Published contacts only.'),
      q('May you use a phone number you found?', ['No', 'Yes', 'Only for businesses'], 0, 'Email or DM only.'),
    ] },
    { from: 'When you cannot find a person', checks: [
      q('Only a general inbox. You…', ['Address the role and ask who the right person is', 'Skip them', 'Call the front desk'], 0, 'Write to the role.'),
      q('They give you a name. Next?', ['Update the lead with it', 'Remember it', 'Start a new lead'], 0, 'Keep the lead current.'),
    ] },
  ],
  'lg5-openers': [
    { from: null, checks: [
      q('How does an opener end?', ['With one easy next step', 'With a price list', 'With a discount'], 0, '"Want a couple of design ideas and a price?"'),
      q('How long is an opener?', ['Under 70 words', 'A page', 'As long as needed'], 0, 'Short and personal gets read.'),
    ] },
    { from: 'Templates: schools, leagues and teams', checks: [
      q('Which template fits a league taking sign-ups?', ['League uniforms', 'Family reunion', 'New business'], 0, 'Names and numbers for the season.'),
      q('A graduation opener can offer…', ['Shirts, banners and Big Head Cutouts', 'Vehicle magnets', 'Nothing extra'], 0, 'Graduations suit cutouts and banners.'),
    ] },
    { from: 'Templates: churches, events and businesses', checks: [
      q('A run or walk opener mentions…', ['Sponsors on the back and start-line banners', 'Graduation', 'Reunions'], 0, 'Events often carry sponsors.'),
      q('An established business opener offers…', ['A mockup with their logo and a price', 'A reunion shirt', 'Field day shirts'], 0, 'Embroidered polos, caps and staff shirts.'),
    ] },
    { from: 'Templates: families and groups', checks: [
      q('Before you send a template, every [blank] is…', ['Replaced with something true for them', 'Left in', 'Deleted'], 0, 'A template is a starting point.'),
      q('Who reads your first five openers?', ['June', 'Nobody', 'The Closer'], 0, 'June signs this step off.'),
    ] },
  ],
  'lg6-cadence': [
    { from: null, checks: [
      q('The follow-ups go at about…', ['3 days and 10 days', 'Every day', '1 month and 2 months'], 0, 'Then stop.'),
      q('A good follow-up…', ['Adds something new', 'Repeats the opener', 'Says "just checking in"'], 0, 'A design idea, a photo, their date.'),
    ] },
    { from: 'Logging every touch', checks: [
      q('After each message you…', ['Log it and set the follow-up date', 'Do nothing', 'Text them'], 0, 'So it counts and comes back on time.'),
      q('A message you did not log…', ['Did not happen, as far as the shop can tell', 'Still counts', 'Emails June'], 0, 'Log everything.'),
    ] },
    { from: 'Reading the replies', checks: [
      q('"Next season" means…', ['Note it and follow up 4 to 6 weeks before it', 'Delete the lead', 'Follow up weekly'], 0, 'They asked you to come back.'),
      q('"Remove me" means…', ['Never contact them again', 'One more try', 'Ask why'], 0, 'Never contact anyone who said no.'),
    ] },
  ],
  'lg7-handover': [
    { from: null, checks: [
      q('A yes gets answered…', ['Within the hour', 'Tomorrow', 'Next week'], 0, 'It is a lead now.'),
      q('How many messages to ask the five details?', ['One', 'Five', 'As many as needed'], 0, 'All in one message.'),
    ] },
    { from: 'Handing over', checks: [
      q('With no Closer on the team, who quotes?', ['You', 'Nobody', 'The designer'], 0, 'As in the Sales course.'),
      q('What goes on the lead before the quote?', ['Everything you know', 'Only the name', 'A discount'], 0, 'Whoever quotes starts with the whole story.'),
    ] },
    { from: 'Getting the credit right', checks: [
      q('A prospect is your rep lead when you registered them…', ['Before they were quoted', 'After the quote', 'After they paid'], 0, 'Registering after the quote is too late.'),
      q('Credit looks wrong. You…', ['Ask June', 'Change the owner yourself', 'Re-register'], 0, 'Never change a lead\'s owner yourself.'),
    ] },
  ],
  'lg8-numbers': [
    { from: null, checks: [
      q('What comes first in the day?', ['Replies on My Day', 'Research', 'Openers'], 0, 'People waiting on you first.'),
      q('Your end-of-day note includes…', ['Your counts, what is stuck, and tomorrow\'s first task', 'Only your hours', 'Nothing'], 0, 'So June starts with a list.'),
    ] },
    { from: 'Your numbers', checks: [
      q('3 replies from 30 openers is…', ['10%', '30%', '3%'], 0, '3 ÷ 30.'),
      q('Many prospects, few replies: look at…', ['Your openers and the contact', 'The quote form', 'Nothing'], 0, 'Low replies point at the opener or the person.'),
    ] },
    { from: 'Getting better each week', checks: [
      q('To test an opener you change…', ['One thing at a time', 'Everything at once', 'Nothing'], 0, 'So you can tell what worked.'),
      q('An opener works really well. You…', ['Tell June', 'Keep it secret', 'Stop using it'], 0, 'It can become a Playbook reply for everyone.'),
    ] },
  ],
};
