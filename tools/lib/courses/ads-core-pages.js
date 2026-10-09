'use strict';

/* The Ads course lessons as pages, the same way design-core-pages.js does
   the Design course: `from` is the bold heading a page starts at, and every
   page ends with a couple of questions about what it just said (multiple
   choice, answered on the page, never marked). */

const q = (text, choices, answer, why) => ({ q: text, choices, answer, why });

module.exports = {
  'a2-judge': [
    { from: null, checks: [
      q('A cheap click from someone wanting a free template is worth…', ['A lot', 'Nothing', 'One quote request'], 1, 'Only quote requests and orders count.'),
      q('Who are our customers?', ['Chicago-area schools, teams, churches, businesses, families and organisers', 'Other print shops', 'Anyone anywhere'], 0, 'Plus online orders from the design studio.'),
    ] },
    { from: 'The numbers we judge on', checks: [
      q('$300 spent, 10 quote requests. Cost per quote request?', ['$3', '$30', '$300'], 1, 'Spend divided by quote requests.'),
      q('Roughly what share of an order is profit?', ['About 40%', 'About 4%', 'All of it'], 0, 'After the shirts and printing.'),
    ] },
    { from: 'What is June\'s', checks: [
      q('A new campaign spends money when…', ['You build it', 'June says yes', 'Google suggests it'], 1, 'Build it paused; she approves.'),
      q('Auto-apply recommendations stay…', ['On', 'Off'], 1, 'They can raise spend by themselves.'),
    ] },
  ],
  'a2-week1': [
    { from: null, checks: [
      q('Why no changes in week one?', ['A change can undo something that was working', 'Google forbids it', 'No reason'], 0, 'Understand before you change.'),
      q('You sign in with…', ['Your own login', 'A shared password'], 0, 'June can see who changed what.'),
    ] },
    { from: 'What to look at', checks: [
      q('Which date ranges do you check?', ['Last 90 days, then 30', 'Today only', 'Last 5 years'], 0, 'Long enough to see patterns.'),
      q('One quote request counted three times is…', ['Fine', 'Broken tracking'], 1, 'It should count once.'),
    ] },
    { from: 'Your findings note', checks: [
      q('How many first changes do you suggest?', ['Three, with what each should do', 'Thirty', 'None'], 0, 'Short and plain.'),
      q('An ad points to a page that does not load. You…', ['Wait a week', 'Tell June first, then fix it', 'Ignore it'], 1, 'The one exception in week one.'),
    ] },
  ],
  'a3-convs': [
    { from: null, checks: [
      q('The quote form tells Google…', ['"generate_lead"', '"purchase"', 'Nothing'], 0, 'And "Lead" to Meta.'),
      q('Is a click on our phone number alone a conversion?', ['Yes', 'No'], 1, 'Quote requests and online orders only.'),
    ] },
    { from: 'The monthly test quote', checks: [
      q('What do you write in a test quote?', ['"TEST from ads, please ignore"', 'A real order', 'Nothing'], 0, 'So nobody treats it as a customer.'),
      q('How long can a conversion take to appear?', ['A few hours', 'A month', 'It is instant always'], 0, 'Check the next day.'),
    ] },
    { from: 'Signs tracking has broken', checks: [
      q('Platform conversions far above real quote requests means…', ['Great week', 'Tracking may be counting wrong'], 1, 'Compare with what sales received.'),
      q('How often do you compare the platform with real requests?', ['Every week', 'Never'], 0, 'They should be close.'),
    ] },
  ],
  'a3-pages': [
    { from: null, checks: [
      q('A banner ad lands on…', ['The banners and signs page', 'The home page', 'The embroidery page'], 0, 'Match the ad to the page.'),
      q('Is the home page usually the right landing page?', ['Yes', 'Rarely'], 1, 'Send people to what they searched for.'),
    ] },
    { from: 'Never use these in an ad', checks: [
      q('jtees.net/quote goes to…', ['The back office', 'The quote form'], 0, 'Never put it in an ad.'),
      q('Before an ad uses a page, you…', ['Open it yourself that day', 'Trust it'], 0, 'Never a page you have not opened.'),
    ] },
    { from: 'Check it on a phone', checks: [
      q('The quote form should be…', ['One tap away', 'At the bottom of a long page', 'Hidden'], 0, 'Most clicks come from phones.'),
      q('Who edits the website?', ['You', 'Not you: tell June'], 1, 'You report what is wrong and what would fix it.'),
    ] },
  ],
  'a4-search': [
    { from: null, checks: [
      q('A campaign has…', ['One goal and one budget', 'Every goal', 'No budget'], 0, 'Ad groups sit inside it.'),
      q('Tight ad groups bring…', ['The right people at a lower price per click', 'More spam', 'Nothing'], 0, 'The ad matches the search.'),
    ] },
    { from: 'Keywords and match types', checks: [
      q('[custom team shirts chicago] in brackets is…', ['Exact match', 'Broad match', 'A negative'], 0, 'Searches with the same meaning.'),
      q('Which match type spends on the wrong people fastest?', ['Exact', 'Phrase', 'Broad'], 2, 'Broad matches anything related.'),
    ] },
    { from: 'Settings that matter', checks: [
      q('Location option we use:', ['Presence', 'Interest'], 0, 'People in or regularly in the area.'),
      q('Switching to bidding for conversions needs…', ['Enough conversions, and June\'s OK', 'Nothing'], 0, 'Start simple; ask before switching.'),
    ] },
  ],
  'a4-copy': [
    { from: null, checks: [
      q('Up to how many headlines in a responsive search ad?', ['15', '3', '50'], 0, '15 headlines, 4 descriptions.'),
      q('A description can be up to…', ['90 characters', '30 characters', '500 characters'], 0, 'Headlines 30, descriptions 90.'),
    ] },
    { from: 'Only what is true', checks: [
      q('"Best in Chicago" needs…', ['June\'s proof and yes', 'Nothing'], 0, 'No unproven superlatives.'),
      q('Misleading claims can get the account…', ['Suspended for weeks', 'A bonus'], 0, 'Both platforms review ads.'),
    ] },
    { from: 'Testing', checks: [
      q('A good test changes…', ['One thing at a time', 'Everything at once'], 0, 'So you know what made the difference.'),
      q('How long before calling a test?', ['A few weeks, or a few hundred impressions each', 'One hour'], 0, 'Give it enough time.'),
    ] },
  ],
  'a5-terms': [
    { from: null, checks: [
      q('Do phrase and exact match ever show for searches we did not mean?', ['Yes', 'No'], 0, 'That is why we read the report.'),
      q('The question for each search term is…', ['Would someone typing this ever order from us?', 'Is it long?'], 0, 'Keep or block.'),
    ] },
    { from: 'Negative keywords', checks: [
      q('"Jobs" as a negative goes at…', ['Account or campaign level', 'One ad only'], 0, 'Never right for us.'),
      q('Before adding a negative, check…', ['What good searches it would block', 'Its color'], 0, 'Too broad blocks good searches.'),
    ] },
    { from: 'The $40 rule', checks: [
      q('Spent about $40, no quote request:', ['Pause it', 'Double it'], 0, 'Unlikely to start now.'),
      q('After pausing, you…', ['Write it in your change notes', 'Forget it'], 0, 'Date and reason.'),
    ] },
  ],
  'a6-meta': [
    { from: null, checks: [
      q('People on Instagram are mostly…', ['Searching for shirts', 'Scrolling past friends and videos'], 1, 'So Meta works differently from Search.'),
      q('Cold "everyone in Chicago" ads on a small budget bring…', ['Mostly likes and cheap clicks', 'Lots of orders'], 0, 'We use retargeting instead.'),
    ] },
    { from: 'How it is set up', checks: [
      q('Which objective?', ['Leads or Sales', 'Engagement'], 0, 'Meta finds what you ask for.'),
      q('What reports a sent quote form to Meta?', ['The pixel\'s Lead event', 'An email'], 0, 'Retargeting is built from the pixel.'),
    ] },
    { from: 'The pictures and videos', checks: [
      q('Who makes ad videos?', ['The content person', 'You alone', 'The customer'], 0, 'Ask in your team channel.'),
      q('Stories and Reels size:', ['1080 x 1920 (9:16)', '1080 x 1350'], 0, '4:5 for feeds.'),
    ] },
    { from: 'Watching it', checks: [
      q('Frequency above about 4 a week means…', ['Change the picture', 'Raise the budget'], 0, 'People are tired of it.'),
      q('Spam in an ad\'s comments:', ['Hide it', 'Reply to it'], 0, 'Everyone who sees the ad sees comments.'),
    ] },
  ],
  'a7-seasons': [
    { from: null, checks: [
      q('Holiday and staff gift ads start…', ['October', 'December 24'], 0, 'October into early December.'),
      q('Who knows which seasons brought most work?', ['June', 'Google'], 0, 'Check with her each quarter.'),
    ] },
    { from: 'Built early, paused', checks: [
      q('How early do you build a seasonal campaign?', ['About a month before', 'The day before'], 0, 'Time to fix and get approval.'),
      q('Seasonal pictures come from…', ['The designer or content person', 'Other shops\' ads'], 0, 'Ask early.'),
    ] },
    { from: 'After the season', checks: [
      q('A spirit-wear ad in November is…', ['Wasted money', 'Fine'], 0, 'Make sure it stopped.'),
      q('Last season\'s campaign is…', ['Kept paused', 'Deleted'], 0, 'Next year starts from it.'),
    ] },
  ],
  'a7-naming': [
    { from: null, checks: [
      q('"META_Leads_Retarget30d" is…', ['A Meta retargeting campaign for leads', 'A Google keyword'], 0, 'Where, goal, who.'),
      q('Renaming inherited campaigns happens…', ['In your first month, telling June first', 'Never'], 0, 'So everything follows one pattern.'),
    ] },
    { from: 'Change notes', checks: [
      q('Each change note has…', ['Date, what, why, and who approved', 'Just a smiley'], 0, 'The why matters most.'),
      q('Notes are kept…', ['Newest first, in one running note', 'Scattered in chats'], 0, 'One place.'),
    ] },
    { from: 'Ready for someone else', checks: [
      q('Your change notes double as…', ['Your handover', 'Ad copy'], 0, 'When you take time off.'),
      q('Should the last test quote date be written down?', ['Yes', 'No'], 0, 'Someone else needs it.'),
    ] },
  ],
  'a8-report': [
    { from: null, checks: [
      q('Where does the weekly report go?', ['Your team channel or Direct with June', 'A customer email'], 0, 'Same day every week.'),
      q('The report ends with…', ['What you need from June, with your suggestion', 'Nothing'], 0, 'Decisions are hers.'),
    ] },
    { from: 'An example', checks: [
      q('A good report has…', ['Real numbers and plain words', 'Dashboard screenshots'], 0, 'Five lines.'),
      q('"Optimise" and "leverage" in a report are…', ['Words to avoid', 'Required'], 0, 'Plain English.'),
    ] },
    { from: 'Bad weeks', checks: [
      q('A bad week goes in the report…', ['Plainly, with a reason and a plan', 'Never'], 0, 'Hidden is not fine.'),
      q('Who knows which requests became orders?', ['Sales and June', 'Meta'], 0, 'Ask in # Sales.'),
    ] },
    { from: 'Quiet time', checks: [
      q('Quiet time is for…', ['Negatives, tests, the next season, a test quote', 'Raising budgets'], 0, 'Keep the account in shape.'),
      q('New headline tests use…', ['Real reviews', 'Made-up reviews'], 0, 'Only what is true.'),
    ] },
  ],
};
