'use strict';

/* The Ads course final exam: forty new questions across every module, 80%
   to pass. `A` is the course's article titles; Team basics questions name
   that module's articles. */

const TEAM = require('./shared-team').articles;

const f = (id, q, choices, answer, article, why) => ({ id, q, choices, answer, article, why });

module.exports = (A) => [
  // Team basics
  f('f1', 'You paused a keyword that sales relies on for team leads. Where do you say so?',
    ['Nowhere', 'Your team channel, with why', 'A customer email', 'Your own social media'], 1, TEAM.chat,
    'Things more than one person needs go in a channel.'),
  f('f2', 'You said the seasonal campaign would be built by Thursday. It is not. You…',
    ['Stay quiet', 'Post why, and a new time', 'Switch it on unfinished', 'Mark it done'], 1, TEAM.chat,
    'Keep the time you gave, even when the news is a delay.'),
  f('f3', 'A question about your hours goes…',
    ['In # Everyone', 'Direct with June', 'In an ad comment', 'Nowhere'], 1, TEAM.chat,
    'Pay and hours are just between you and June.'),
  f('f4', 'Which is June\'s decision?',
    ['Adding the negative "jobs"', 'A 15% discount in an ad', 'Pausing a $45 keyword with no results', 'Renaming an ad group'], 1, TEAM.questions,
    'Offers, prices and discounts are June\'s.'),
  f('f5', 'You want ChatGPT to suggest headlines. What do you paste?',
    ['A customer\'s review with their name and email', 'Our services and the real review words, no customer details', 'Our account password', 'A sales order'], 1, TEAM.customers,
    'Customer details never go into any AI tool.'),

  // Judging and week one
  f('f6', 'Campaign A: 400 clicks, 2 quote requests. Campaign B: 90 clicks, 6 quote requests. Same spend. Better?',
    ['A', 'B', 'Equal', 'Cannot tell'], 1, A.judge, 'Quote requests, not clicks.'),
  f('f7', '$250 spent; ad orders worth $500. Is it paying for itself?',
    ['Yes, easily', 'No: about $200 profit for $250 of ads', 'Cannot tell', 'Only if CTR is high'], 1, A.judge,
    'About 40% of $500 is $200, less than the spend.'),
  f('f8', 'Google suggests switching on the Display Network. You…',
    ['Accept it', 'Ask June: it loosens targeting and spends more', 'Accept and tell nobody', 'Turn on auto-apply'], 1, A.judge,
    'Never accept a suggestion that raises spend or loosens targeting without June.'),
  f('f9', 'Day 2 of your first week, you spot a keyword wasting money. You…',
    ['Pause it now', 'Note it for your findings at the end of the week', 'Delete the campaign', 'Raise its bid'], 1, A.week1,
    'Week one is for learning; the exception is something broken.'),
  f('f10', 'Which belongs in your week-one findings?',
    ['"Needs optimisation"', '"Location set to interest: 30% of clicks were outside Illinois"', '"Looks fine"', '"Lots of work"'], 1, A.week1,
    'Specific, with numbers.'),

  // Tracking and pages
  f('f11', 'After the website was updated, you…',
    ['Do nothing', 'Run a test quote and check it counts once', 'Raise budgets', 'Pause everything'], 1, A.convs,
    'Monthly and after any website change.'),
  f('f12', 'Tracking is broken for a week. How do you judge the ads meanwhile?',
    ['By platform conversions', 'By the quote requests sales actually received', 'By clicks', 'You cannot'], 1, A.convs,
    'Real requests until tracking is fixed.'),
  f('f13', 'Which is NOT a conversion for us?',
    ['A sent quote form', 'A paid design studio order', 'A visit to the home page', 'A quote request from an ad'], 2, A.convs,
    'Page views are not conversions.'),
  f('f14', 'An ad about hoodies for teams points to the home page. Better?',
    ['The custom T-shirts and team page', 'jtees.net/quote', 'An /admin page', 'Leave it'], 0, A.pages,
    'Send people to what they searched for; never /quote.'),
  f('f15', 'A landing page takes 12 seconds on mobile data. You…',
    ['Ignore it', 'Tell June what is slow and what would fix it', 'Edit the website', 'Raise bids'], 1, A.pages,
    'You report; June or the developer fixes.'),

  // Search
  f('f16', 'Which ad group is tight?',
    ['"Everything": shirts, banners, mugs, jobs', '"Embroidered polos": embroidered polos for business, logo polos chicago', '"Misc"', 'One keyword per account'], 1, A.search,
    'One theme, with ads written for it.'),
  f('f17', '"custom team shirts" in quotes is…',
    ['Exact match', 'Phrase match', 'Broad match', 'A negative'], 1, A.search, 'Quotes mean phrase match.'),
  f('f18', 'Clicks are coming from Texas. Most likely the location is set to…',
    ['Presence', 'Interest', 'Exact', 'Off'], 1, A.search, 'Interest shows ads to people anywhere.'),
  f('f19', 'Daily budget $10. One busy day Google spends $18. That is…',
    ['A bug', 'Normal: up to twice the daily budget, evened out over the month', 'Fraud', 'A refund'], 1, A.search,
    'Monthly spend stays about 30 days of budget.'),
  f('f20', 'A headline reads "Custom Team Shirts In Chicago Area Today" (39 characters). It is…',
    ['Fine', 'Too long: headlines are 30 characters', 'Too short', 'A description'], 1, A.copy, 'Headlines 30, descriptions 90.'),
  f('f21', 'Which headline can go live without June?',
    ['"Lowest Prices Guaranteed"', '"Screen Print, DTF & Embroidery"', '"Free Shirts This Week"', '"#1 Shop In Chicago"'], 1, A.copy,
    'A true description of what we do.'),
  f('f22', 'Your new ad got 3 days and 40 impressions. You…',
    ['Declare a winner', 'Give it more time', 'Delete the old ad', 'Double the budget'], 1, A.copy,
    'A few weeks or a few hundred impressions.'),

  // Search terms
  f('f23', '"screen printing machine for sale" cost $9. You…',
    ['Keep it', 'Add "machine" and "for sale" as negatives', 'Make it a keyword', 'Raise its bid'], 1, A.terms,
    'People buying equipment do not order shirts.'),
  f('f24', '"hoodies" searches keep landing in the T-shirt ad group. You…',
    ['Add "hoodies" as a negative in the T-shirt ad group, so they go to the hoodies ad group', 'Add it at account level', 'Ignore it', 'Delete the hoodies ad group'], 0, A.terms,
    'Ad-group negatives send searches to the ad that fits.'),
  f('f25', 'Adding "cheap" as an account negative would…',
    ['Be perfect', 'Possibly block good searches like "cheap team shirts"', 'Raise costs', 'Change nothing'], 1, A.terms,
    'Check what a negative would block.'),
  f('f26', 'An ad group spent $44 with no quote request, and the test quote counted fine. You…',
    ['Keep waiting', 'Pause it and note why', 'Delete it', 'Raise its budget'], 1, A.terms, 'The $40 rule.'),
  f('f27', 'Search terms are reviewed…',
    ['Twice a week', 'Monthly', 'Yearly', 'Never'], 0, A.terms, 'Twice a week, every week.'),

  // Meta
  f('f28', 'Who is a good Meta retargeting audience?',
    ['Everyone in Illinois', 'People who visited the quote page in the last 30 days', 'People who like shirts', 'Other print shops'], 1, A.meta,
    'People who know us.'),
  f('f29', 'A Meta campaign set to "Engagement" will find…',
    ['Quote requests', 'People who like and comment', 'Orders', 'Nobody'], 1, A.meta, 'Meta finds what you ask for.'),
  f('f30', 'A customer\'s team photo for an ad needs…',
    ['Nothing', 'Their written permission, and a parent\'s or team\'s OK for children', 'A filter', 'A watermark'], 1, A.meta,
    'Permission first.'),
  f('f31', 'Frequency is 7. You…',
    ['Leave it', 'Change the picture', 'Double the budget', 'Turn off comments'], 1, A.meta, 'People are tired of it.'),

  // Seasons and notes
  f('f32', 'It is June 1. Which campaign should you be building, paused?',
    ['Christmas', 'Back to school and spirit wear', 'Graduation', 'Spring sports'], 1, A.seasons,
    'Plan in June, ads from July.'),
  f('f33', 'A seasonal campaign is approved. When you switch it on you also…',
    ['Set an end date', 'Raise every budget', 'Delete last year\'s', 'Turn on Display'], 0, A.seasons,
    'It stops by itself.'),
  f('f34', 'Which name follows our pattern?',
    ['GS_Quotes_Graduation_2027-03', 'grad stuff', 'Campaign 12', 'New campaign (copy)'], 0, A.naming, 'Where, goal, who, when.'),
  f('f35', 'Google\'s change history shows you paused a keyword. What else does June need?',
    ['Nothing', 'Why, in your change notes', 'A screenshot', 'Your password'], 1, A.naming, 'The why is in the notes.'),

  // Weekly report
  f('f36', 'Which opening line is best for a weekly report?',
    ['"Leveraged our funnel synergies"', '"Spent $140 of $150; 9 quote requests at $15.50 each; 3 orders worth $1,250"', '"All good"', '"See attached"'], 1, A.report,
    'Real numbers, plain words.'),
  f('f37', 'Quote requests halved this week. In the report you…',
    ['Leave it out', 'Say so, what you checked (tracking), what you think happened, and what you will do', 'Blame June', 'Double the budget'], 1, A.report,
    'A bad week explained is fine.'),
  f('f38', 'You want a bigger budget for a keyword that brings cheap quote requests. You…',
    ['Raise it', 'Ask June in the report, with the numbers', 'Wait until she notices', 'Accept a Google recommendation'], 1, A.report,
    'Budget changes are June\'s; ask clearly.'),
  f('f39', 'Where do you learn which ad quote requests became orders?',
    ['Google Ads', 'Sales and June', 'Meta', 'Guess'], 1, A.report, 'The platforms count conversions; sales knows orders.'),
  f('f40', 'The account is in good shape and it is quiet. You…',
    ['Raise budgets', 'Build the next season paused, test headlines, run a test quote', 'Delete old campaigns', 'Nothing'], 1, A.report,
    'Prepare, test and check.'),
];
