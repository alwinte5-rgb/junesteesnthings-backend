'use strict';

/* The Ads course: the eight hours the ads person walks before changing the
   account on their own (owner, 2026-10-09). They run our paid ads on Google
   (Search first) and Meta, on a small budget, aimed at quote requests and
   orders; June approves every new campaign and budget change.

   What the course teaches comes from what the shop already wrote down or
   built: the "Running our ads" SOP in the Playbook, the ads specialist's
   hiring test (tools/lib/hiring-ads.js), whose model answers are the standard
   we hired against, the quote form's conversion events (generate_lead for
   Google, Lead for Meta) and the service pages under /services. Platform
   practice fills the rest (match types, presence targeting, ad limits).
   Anything only the owner knows is written "[owner to fill in: ...]", which
   the Training page's "Playbook gaps" card asks her for. */

const TEAM = require('./shared-team');

const A = {
  judge:    'Ads course 2a: How we judge an ad',
  week1:    'Ads course 2b: Your first week, no changes',
  convs:    'Ads course 3a: Conversion tracking',
  pages:    'Ads course 3b: Landing pages',
  search:   'Ads course 4a: Google Search campaigns and keywords',
  copy:     'Ads course 4b: Writing ads that are true',
  terms:    'Ads course 5: Search terms, negatives and the $40 rule',
  meta:     'Ads course 6: Facebook and Instagram ads',
  seasons:  'Ads course 7a: Seasons, built early',
  naming:   'Ads course 7b: Names, notes and changes',
  report:   'Ads course 8: The weekly report',
};

const GLOSSARY = {
  'conversion': 'An action we count as a result: a quote request or an online order. Clicks are not conversions.',
  'cost per quote request': 'What we spent divided by the quote requests the ads brought. Our main number.',
  'search term': 'The words someone actually typed before our ad showed. Not the same as our keyword.',
  'keyword': 'The words we bid on. Google matches them to search terms, more or less loosely by match type.',
  'negative keyword': 'A word that stops our ad showing, like "free" or "jobs".',
  'match type': 'How closely a search must match a keyword: broad (loose), phrase (contains the meaning), exact (the same meaning).',
  'ad group': 'A set of keywords and the ads written for them, inside one campaign.',
  'landing page': 'The page someone lands on after clicking the ad.',
  'retargeting': 'Showing ads to people who already visited our site.',
  'impression': 'One time our ad was shown.',
  'ctr': 'Click-through rate: clicks divided by impressions.',
};

const MODULES = [
  /* ── 1 ── */
  TEAM.MODULE,

  /* ── 2 ── */
  {
    key: 'a2', icon: '🎯', title: 'How we judge ads, and your first week',
    goal: 'Know what a good ad looks like for us, what is June\'s to decide, and how to learn an account before you touch it.',
    lessons: [{
      id: 'a2-judge', article: A.judge, minutes: 20, tags: 'ads, cost per quote request, profit, conversions, clicks, budget, approval',
      goals: ['Judge an ad on quote requests, orders and profit', 'Work out whether ads are paying for themselves', 'Know which changes need June first'],
      images: [{ src: '/assets/images/work/storefront-lincoln-ave.jpg', alt: 'Our shop: ads bring Chicago-area customers to it' }],
      body:
`We spend a small amount on ads, and every dollar has to come back as orders. Your job is to make that true, and to show June it is true.

**What we are buying**

Our customers are Chicago-area schools, teams, churches, businesses, families and event organisers who need custom shirts, hoodies, embroidery, banners or signs, plus anyone ordering online from the design studio.

An ad works when one of them asks for a quote or places an order. That is it. Clicks, impressions, likes and a high click-through rate are only signs on the way. A cheap click from someone looking for a free template is worth nothing.

**The numbers we judge on**

- **Cost per quote request:** spend divided by quote requests from the ads. Our main number
- **Orders and their value:** how many quote requests became paid orders
- **Profit:** roughly 40% of an order's value is left after the shirts and printing. So $1,000 of orders is about $400 of profit to set against what the ads cost

Example: $140 spent, 9 quote requests ($15.50 each), 3 orders worth $1,250. About $500 profit for $140 of ads: it is paying for itself.

Our target: [owner to fill in: the cost per quote request we aim for]

**What is June's**

- Every **new campaign** and every **budget change**. You plan it and build it paused; she says yes before it spends
- Our monthly budget: [owner to fill in: the monthly ad budget, and the most any day may spend]
- Any offer, discount or price in an ad
- Turning on anything that spends more by itself: auto-applied recommendations, "maximise" bid settings with no limit, new networks

Within an approved budget, the day-to-day is yours: adding negatives, pausing what does not work, testing new ad text, moving money between ad groups in the same campaign.

**Google's suggestions**

Google Ads constantly recommends raising budgets, broadening keywords and adding networks. Some are good; many mainly spend more. Read each one, and never accept one that raises spend or loosens targeting without asking June. Keep auto-apply recommendations switched off.`,
    }, {
      id: 'a2-week1', article: A.week1, minutes: 20, tags: 'ads, audit, first week, account history, findings, no changes',
      goals: ['Learn an account before changing it', 'Write findings June can read in two minutes', 'Know where you get access'],
      body:
`Your first week is for learning the account, not changing it. A change made before you understand why things are the way they are often undoes something that was working.

**Getting in**

[owner to fill in: how the ads person is given access to Google Ads and Meta, and at what access level]

Use your own login, never a shared password. That way June can see who changed what, and remove access cleanly if you move on.

**What to look at**

Go through the account with the date range set to the last 90 days, then the last 30:

- **Campaigns:** which exist, which are running, their budgets, and what each is for
- **Conversions:** which actions are counted, and whether they look real (a quote request should count once, not three times)
- **Search terms:** what people really typed. Mark the ones that would never order
- **Locations:** Chicago and nearby, and set to people **in** the area, not people "interested in" it
- **Ads and landing pages:** every ad's text, and every page it sends people to, opened on your phone
- **Change history:** what was changed recently, and by whom

**Your findings note**

At the end of the week, send June one short note in your team channel or Direct:

1. What is working, with numbers
2. What is wasting money, with numbers
3. Anything broken (tracking, a dead landing page)
4. The three changes you would make first, and what each should do

Short and plain. "Custom apparel spent $35 on people looking for wholesale blanks" beats "the keyword strategy needs optimisation".

**What not to do yet**

- No pausing, no new campaigns, no budget changes, no accepting recommendations
- The one exception: something plainly broken that is spending money right now (an ad sending people to a page that does not load). Tell June first, then fix it`,
    }],
    practice: [],
    quiz: {
      key: 'ads-2', title: 'Module 2 quiz: how we judge ads, and your first week', minutes: 10,
      questions: [
        { id: 'works', q: 'When has an ad worked for us?',
          choices: ['When it gets lots of clicks', 'When someone asks for a quote or orders', 'When it gets likes', 'When it shows a lot'],
          answer: 1, article: A.judge, why: 'Quote requests and orders; clicks are only a sign on the way.' },
        { id: 'main', q: 'Our main number is…',
          choices: ['Click-through rate', 'Cost per quote request', 'Impressions', 'Followers'],
          answer: 1, article: A.judge, why: 'Spend divided by quote requests from the ads.' },
        { id: 'profit', q: 'Orders from ads come to $2,000. Roughly how much profit is that?',
          choices: ['$2,000', 'About $800', 'About $80', 'Nothing'],
          answer: 1, article: A.judge, why: 'About 40% of an order\'s value.' },
        { id: 'budget', q: 'You want to raise a campaign\'s budget. You…',
          choices: ['Raise it', 'Ask June first', 'Raise it a little', 'Accept Google\'s suggestion'],
          answer: 1, article: A.judge, why: 'Every budget change is June\'s.' },
        { id: 'yours', q: 'Which change is yours to make within an approved budget?',
          choices: ['A new campaign', 'Adding negative keywords', 'A discount in an ad', 'Turning on auto-apply'],
          answer: 1, article: A.judge, why: 'Negatives, pauses, ad tests and moves within a campaign are day-to-day.' },
        { id: 'rec', q: 'Google recommends raising the budget by 50%. You…',
          choices: ['Accept it', 'Ask June: it raises spend', 'Accept half', 'Turn on auto-apply'],
          answer: 1, article: A.judge, why: 'Never accept a suggestion that raises spend without June.' },
        { id: 'first', q: 'What is your first week for?',
          choices: ['Rebuilding the account', 'Learning the account, with no changes', 'New campaigns', 'Doubling the budget'],
          answer: 1, article: A.week1, why: 'Understand before you change.' },
        { id: 'login', q: 'How do you sign in to the ad accounts?',
          choices: ['June\'s password', 'Your own login', 'A shared team password', 'A customer\'s account'],
          answer: 1, article: A.week1, why: 'So June can see who changed what.' },
        { id: 'location', q: 'Locations should target people…',
          choices: ['Interested in Chicago', 'In or regularly in the Chicago area', 'Anywhere in the US', 'Anywhere in the world'],
          answer: 1, article: A.week1, why: 'People elsewhere click but rarely order.' },
        { id: 'note', q: 'Which finding is written best?',
          choices: ['"The keyword strategy needs optimisation"', '"Custom apparel spent $35 on people looking for wholesale blanks"', '"Things look OK"', '"Lots to fix"'],
          answer: 1, article: A.week1, why: 'Plain, specific and with numbers.' },
      ],
    },
    buffer: 7,
  },

  /* ── 3 ── */
  {
    key: 'a3', icon: '📡', title: 'Tracking and landing pages',
    goal: 'Make sure every quote request is counted once, and every click lands where it can become one.',
    lessons: [{
      id: 'a3-convs', article: A.convs, minutes: 20, tags: 'ads, conversion tracking, quote request, test quote, generate_lead, pixel, ga4',
      goals: ['Name the actions we count as conversions', 'Run the monthly test quote', 'Spot tracking that has broken'],
      body:
`An ad account without working tracking is guessing. Google and Meta decide who to show our ads to based on the conversions they see, so wrong tracking does not just give wrong numbers: it teaches them to find the wrong people.

**What we count**

- **Quote requests:** someone sends the quote form on jtees.net. The site tells Google ("generate_lead") and Meta ("Lead") when the form is sent
- **Online orders:** a paid order from the design studio

Nothing else is a conversion: not page views, not time on site, not clicks on the phone number on their own.

What is set up today: [owner to fill in: which conversions are set up in Google Ads and Meta today, and anything known to be broken]

**The monthly test quote**

Once a month, and after any change to the website:

1. On your phone, click one of our ads (or open the landing page with the ad's link), and send a real quote request. Write "TEST from ads, please ignore" in the message
2. Tell sales in # Sales that a test is coming, so nobody answers it
3. Check the next day that it shows as one conversion in Google Ads and one in Meta. Conversions can take a few hours to appear
4. Write the date and the result in your change notes

If it does not appear, or appears twice, tell June the same day. Until it is fixed, judge the ads on the quote requests sales actually received, not on what the platform says.

**Signs tracking has broken**

- Conversions drop to zero overnight while clicks stay the same
- Conversions jump far above the quote requests sales actually received
- One quote request counted two or three times
- A conversion with a strange name you did not set up

Compare the platform's numbers with the real quote requests every week. They will not match exactly (some people find us twice, some block tracking), but they should be close.`,
    }, {
      id: 'a3-pages', article: A.pages, minutes: 20, tags: 'ads, landing page, services, mobile, quote form, url',
      goals: ['Send each ad to the page that matches it', 'Check a landing page on a phone', 'Know which addresses never go in an ad'],
      images: [{ src: '/assets/images/work/custom-printed-banner.jpg', alt: 'A custom printed banner: a banner ad sends people to the banners page, not the home page' }],
      body:
`The best ad wastes its click if the page it lands on does not match, loads slowly, or hides the quote form.

**Match the ad to the page**

Send people to the page about what they searched for:

- Team, school and event shirts: jtees.net/services/custom-tshirts-chicago.html
- Screen printing: /services/screen-printing.html
- Embroidery and business polos: /services/embroidery.html
- DTF transfers: /services/dtf-transfers.html
- Banners and signs: /services/banners-signs.html
- Big-head cutouts: /services/big-head-cutouts.html
- Event decor: /services/event-decor.html
- Graphic design: /services/graphic-design.html

Someone who searched "embroidered polos" and lands on a page about team T-shirts goes back to Google. The home page is rarely the right landing page.

**Never use these in an ad**

- **jtees.net/quote:** it goes to our back office, not to a customer page
- Any page with /admin in it
- A page you have not opened yourself that day

**Check it on a phone**

Most of our clicks come from phones. For every landing page:

- It loads in a few seconds on mobile data, not just on wifi
- The quote form, or a button to it, is one tap away
- What the ad promised is on the page: if the ad says "embroidered polos", the page shows embroidered polos
- Nothing is broken: images load, buttons work, nothing sideways-scrolls

**When a page needs changing**

You do not edit the website. If a landing page is wrong, slow or missing something, tell June with the page, what is wrong and what would fix it. Pause the ads pointing to a page that does not load, and tell her straight away.`,
    }],
    practice: [
      { key: 'signoff:ads-tracking', type: 'signoff', minutes: 5,
        title: 'Runs the monthly test quote and checks it counts', hint: 'Show June your first test quote: sent from an ad\'s link, flagged to sales first, and counted once in Google Ads and Meta.' },
    ],
    quiz: {
      key: 'ads-3', title: 'Module 3 quiz: tracking and landing pages', minutes: 10,
      questions: [
        { id: 'what', q: 'Which is a conversion for us?',
          choices: ['A page view', 'A quote request sent from the form', 'A click on the ad', 'Time on site'],
          answer: 1, article: A.convs, why: 'Quote requests and online orders only.' },
        { id: 'why', q: 'Why does wrong tracking cost money, not just give wrong numbers?',
          choices: ['It does not', 'The platforms use conversions to decide who sees our ads', 'Google charges for it', 'It slows the site'],
          answer: 1, article: A.convs, why: 'Wrong conversions teach them to find the wrong people.' },
        { id: 'monthly', q: 'How often do you run a test quote?',
          choices: ['Never', 'Monthly, and after any website change', 'Every day', 'Once a year'],
          answer: 1, article: A.convs, why: 'Tracking breaks quietly.' },
        { id: 'tell', q: 'Before sending a test quote you…',
          choices: ['Tell nobody', 'Tell sales in # Sales so nobody answers it', 'Email the customer', 'Pause all ads'],
          answer: 1, article: A.convs, why: 'Sales should not chase a test.' },
        { id: 'double', q: 'Your test quote shows as two conversions. You…',
          choices: ['Ignore it', 'Tell June the same day', 'Delete one', 'Raise the budget'],
          answer: 1, article: A.convs, why: 'Counted twice is broken tracking.' },
        { id: 'zero', q: 'Conversions fell to zero overnight while clicks stayed the same. Most likely…',
          choices: ['The ads stopped working', 'Tracking broke', 'It is a holiday', 'Nothing'],
          answer: 1, article: A.convs, why: 'Clicks steady but conversions gone points at tracking.' },
        { id: 'polo', q: 'An ad for "embroidered polos" should land on…',
          choices: ['The home page', 'The embroidery page', 'jtees.net/quote', 'The banners page'],
          answer: 1, article: A.pages, why: 'Match the ad to the page.' },
        { id: 'quote', q: 'Why is jtees.net/quote never an ad link?',
          choices: ['It is slow', 'It goes to our back office, not a customer page', 'It costs more', 'It is too short'],
          answer: 1, article: A.pages, why: 'Never use it, or any /admin page.' },
        { id: 'phone', q: 'Where do you check a landing page?',
          choices: ['On your phone, on mobile data', 'Only on a big screen', 'Never', 'In the ad preview only'],
          answer: 0, article: A.pages, why: 'Most clicks come from phones.' },
        { id: 'edit', q: 'A landing page has a broken button. You…',
          choices: ['Edit the website', 'Tell June what is wrong and what would fix it', 'Ignore it', 'Point the ad at /admin'],
          answer: 1, article: A.pages, why: 'You do not edit the website; pause ads to a page that does not load.' },
      ],
    },
    buffer: 7,
  },

  /* ── 4 ── */
  {
    key: 'a4', icon: '🔎', title: 'Google Search',
    goal: 'Build Search campaigns that show for people ready to order, with ads that say only what is true.',
    lessons: [{
      id: 'a4-search', article: A.search, minutes: 20, tags: 'ads, google search, campaign, ad group, keywords, match types, location, schedule, networks',
      goals: ['Lay out a campaign in tight ad groups', 'Choose keywords and match types', 'Set location, schedule and networks'],
      body:
`Most of our budget goes to Google Search, because someone typing "custom team shirts chicago" is already looking for what we do. Our job is to show up for those searches and not for the rest.

**How a campaign is laid out**

- **Campaign:** one goal and one budget, for example "Team and school shirts"
- **Ad groups:** inside it, one tight theme each, for example "team shirts", "school spirit wear", "hoodies"
- **Keywords** in each ad group, all about that theme, and **ads** written for exactly those words
- One **landing page** per ad group, the page about that theme

Tight ad groups mean the ad matches the search, which means more clicks from the right people and a lower price per click.

**Keywords and match types**

Pick searches likely to order, with a place or a buying word in them:

- custom team shirts chicago, screen printing chicago, embroidered polos for business, shirt printing near me, custom hoodies chicago

Match types decide how loosely Google matches:

- **Exact** [custom team shirts chicago]: searches with the same meaning
- **Phrase** "custom team shirts": searches containing that meaning, with words before or after
- **Broad:** anything Google thinks is related. On a small budget it spends on the wrong people fast, so we start with phrase and exact

**Settings that matter**

- **Location:** Chicago and nearby suburbs, set to **presence**: people in, or regularly in, those places. Not "interest", which shows ads to people anywhere who search about Chicago
- **Networks:** Search only. Untick the Display Network on Search campaigns; it puts our text ads on random websites
- **Schedule:** when someone can get a reply. [owner to fill in: the hours ads should run, when someone answers quote requests]
- **Budget:** a daily budget June approved. Google may spend up to twice the daily budget on a busy day, but not more than about 30 days' worth in a month
- **Bidding:** start simple (maximise clicks with a top limit, or manual) until there are enough conversions to let Google bid for conversions. Ask June before switching`,
    }, {
      id: 'a4-copy', article: A.copy, minutes: 20, tags: 'ads, ad copy, headlines, descriptions, responsive search ads, reviews, claims, policy',
      goals: ['Write headlines and descriptions that fit and convince', 'Use only claims we can prove', 'Test one ad against another'],
      images: [{ src: '/assets/images/work/youth-team-shirts.jpg', alt: 'A youth team in their shirts: real work is the best proof in an ad' }],
      body:
`A Search ad is a few short lines. Every one has to earn its place, and every one has to be true.

**What a Search ad is made of**

A responsive search ad has up to 15 **headlines** of 30 characters and up to 4 **descriptions** of 90 characters. Google mixes them, so each one must make sense on its own, in any order.

Write headlines that cover:

- **What they searched:** "Custom Team Shirts Chicago"
- **Why us:** "Local Chicago Print Shop", "Screen Print, DTF & Embroidery"
- **Proof:** a real review line or star rating, only if it is real and current
- **Next step:** "Get a Free Quote Today"

Descriptions give the detail: what we make, who for, and the next step.

**Only what is true**

Ads are a promise. Every claim must be something we can show:

- Real turnaround, real reviews, local pickup, real services. Check each against the Playbook
- No "cheapest", "best in Chicago", "guaranteed" or "#1" unless June has proof and says yes
- No prices, discounts or deadlines June has not approved
- Nothing about a customer or another shop
- No other brand's name or logo in our ads unless we sell that brand and June says yes

Google and Meta both review ads and can refuse or suspend them for misleading claims. A suspended account takes weeks to fix.

**Testing**

- Keep at least two ads running in each ad group, so there is always something to compare
- Change one thing at a time: a headline about speed against one about reviews
- Judge on quote requests, not clicks. A catchy ad that brings curious clickers loses to a plain one that brings orders
- Give a test enough time: a few weeks, or until each ad has had a few hundred impressions, before you call it`,
    }],
    practice: [],
    quiz: {
      key: 'ads-4', title: 'Module 4 quiz: Google Search', minutes: 10,
      questions: [
        { id: 'adgroup', q: 'An ad group should have…',
          choices: ['Every keyword we can think of', 'One tight theme, with ads written for it', 'One keyword per campaign', 'No ads'],
          answer: 1, article: A.search, why: 'Tight themes let the ad match the search.' },
        { id: 'kw', q: 'Which keyword is most likely to bring an order?',
          choices: ['t-shirt', 'custom team shirts chicago', 'how to screen print at home', 'free shirt templates'],
          answer: 1, article: A.search, why: 'A place or a buying word, and our service.' },
        { id: 'broad', q: 'Why do we start with phrase and exact match?',
          choices: ['They are free', 'Broad match spends on the wrong people fast on a small budget', 'Google requires it', 'They show more'],
          answer: 1, article: A.search, why: 'Broad matches anything Google thinks is related.' },
        { id: 'presence', q: 'Which location setting do we use?',
          choices: ['Interest in Chicago', 'Presence: people in or regularly in the area', 'Whole United States', 'No location'],
          answer: 1, article: A.search, why: 'Interest shows ads to people anywhere.' },
        { id: 'display', q: 'On a Search campaign, the Display Network is…',
          choices: ['On', 'Off: it puts text ads on random websites', 'Only on weekends', 'Required'],
          answer: 1, article: A.search, why: 'Search only.' },
        { id: 'headline', q: 'A Search headline can be at most…',
          choices: ['30 characters', '90 characters', '300 characters', 'Unlimited'],
          answer: 0, article: A.copy, why: 'Headlines 30, descriptions 90.' },
        { id: 'order', q: 'Why must each headline make sense on its own?',
          choices: ['Google mixes them in any order', 'They are read aloud', 'For SEO', 'They do not have to'],
          answer: 0, article: A.copy, why: 'Responsive ads combine headlines automatically.' },
        { id: 'claim', q: 'Which headline may you write without June?',
          choices: ['"Cheapest in Chicago"', '"Local Chicago Print Shop"', '"20% Off This Week"', '"Guaranteed Next-Day"'],
          answer: 1, article: A.copy, why: 'Only claims we can show; prices and offers are June\'s.' },
        { id: 'two', q: 'How many ads run in each ad group?',
          choices: ['One', 'At least two, to compare', 'Ten', 'None'],
          answer: 1, article: A.copy, why: 'Always something to compare.' },
        { id: 'winner', q: 'Ad A gets more clicks; ad B gets more quote requests. Which wins?',
          choices: ['A', 'B', 'Neither', 'Both equally'],
          answer: 1, article: A.copy, why: 'Judge on quote requests, not clicks.' },
      ],
    },
    buffer: 7,
  },

  /* ── 5 ── */
  {
    key: 'a5', icon: '🧹', title: 'Search terms, negatives and the $40 rule',
    goal: 'Keep the budget on searches that order, twice a week, every week.',
    lessons: [{
      id: 'a5-terms', article: A.terms, minutes: 25, tags: 'ads, search terms, negative keywords, pause, $40, budget, routine, twice a week',
      goals: ['Read the search terms report', 'Add negatives at the right level', 'Pause what spends without results, and move the money'],
      body:
`This is the work that makes a small budget pay. Twice a week, every week, you look at what people really searched, and you stop paying for the wrong ones.

**The search terms report**

A keyword is what we bid on; a **search term** is what someone actually typed. Even phrase and exact match show our ads for searches we never meant. The search terms report lists them, with the cost and conversions of each.

For each term with spend, ask: would someone typing this ever order custom shirts from a Chicago shop?

- "custom soccer jerseys chicago": yes. Keep it, and maybe add it as its own keyword
- "how to screen print at home": no. Add a negative
- "screen printing jobs": no. Add a negative

**Negative keywords**

Words that stop our ads showing. Start every account with the common ones and add more every week:

- free, template, jobs, careers, hiring, DIY, how to, at home, machine, equipment, supplies, wholesale blanks, clipart, font

Add each negative at the right level:

- **Account or campaign** for words that are never right for us (jobs, free, DIY)
- **Ad group** for words that belong in another ad group, so searches go to the ad that fits them

Careful: a negative that is too broad blocks good searches. "Cheap" might block "cheap team shirts", which can still order. Check what a negative would block before adding it.

**The $40 rule**

Anything (a keyword, an ad group, an ad) that has spent about **$40 with no quote request** gets paused. That is roughly what one quote request should cost; when something has spent that and brought none, it is unlikely to start.

- Check that tracking works first (Module 3). A $40 keyword with "no conversions" while tracking is broken may be fine
- Pause, do not delete, so the history stays
- Write it in your change notes with the date and the reason

**Moving the money**

Money saved from what you paused goes to what brings quote requests at a good cost, within the same campaign. Moving budget between campaigns, or adding any, is June's call: suggest it in your weekly report.

**Your twice-a-week routine**

1. Search terms for every campaign, last 7 days: add negatives, note good new terms
2. Anything over $40 with no quote request: pause it
3. Spend against the daily budget: anything spending much faster than planned?
4. Write what you changed in your change notes`,
    }],
    practice: [
      { key: 'signoff:ads-terms', type: 'signoff', minutes: 5,
        title: 'Cleans up search terms without blocking good ones', hint: 'Walk June through one search terms review: the negatives you added, at which level, what you paused under the $40 rule, and what you deliberately kept.' },
    ],
    quiz: {
      key: 'ads-5', title: 'Module 5 quiz: search terms, negatives and the $40 rule', minutes: 10,
      questions: [
        { id: 'term', q: 'A search term is…',
          choices: ['The word we bid on', 'What someone actually typed before our ad showed', 'A negative', 'A campaign name'],
          answer: 1, article: A.terms, why: 'Keywords are ours; search terms are theirs.' },
        { id: 'often', q: 'How often do you review search terms?',
          choices: ['Twice a week', 'Once a year', 'Only when June asks', 'Never'],
          answer: 0, article: A.terms, why: 'Twice a week, every week.' },
        { id: 'jobs', q: '"Screen printing jobs chicago" cost us $6. You…',
          choices: ['Keep it', 'Add "jobs" as a negative', 'Raise its bid', 'Make it a keyword'],
          answer: 1, article: A.terms, why: 'Job seekers do not order shirts.' },
        { id: 'good', q: '"Custom soccer jerseys chicago" brought a quote request. You…',
          choices: ['Add it as a negative', 'Keep it, and maybe add it as its own keyword', 'Pause the campaign', 'Ignore it'],
          answer: 1, article: A.terms, why: 'Good terms are worth keeping and building on.' },
        { id: 'level', q: '"Free" is a negative at which level?',
          choices: ['One ad group only', 'Account or campaign: it is never right for us', 'None', 'The ad'],
          answer: 1, article: A.terms, why: 'Never-right words go at account or campaign level.' },
        { id: 'cheap', q: 'Why be careful adding "cheap" as a negative?',
          choices: ['It is too short', 'It can block good searches like "cheap team shirts"', 'Google refuses it', 'It costs money'],
          answer: 1, article: A.terms, why: 'Check what a negative would block.' },
        { id: 'forty', q: 'A keyword has spent $42 with no quote request, and tracking works. You…',
          choices: ['Raise its bid', 'Pause it and note why', 'Delete the campaign', 'Wait six months'],
          answer: 1, article: A.terms, why: 'The $40 rule.' },
        { id: 'checkfirst', q: 'Before applying the $40 rule, check…',
          choices: ['The weather', 'That tracking is working', 'The keyword length', 'Nothing'],
          answer: 1, article: A.terms, why: 'Broken tracking makes everything look like it has no results.' },
        { id: 'delete', q: 'Something is not working. You…',
          choices: ['Delete it', 'Pause it, so the history stays', 'Leave it running', 'Rename it'],
          answer: 1, article: A.terms, why: 'Pause, do not delete.' },
        { id: 'move', q: 'You want to move money from one campaign to another. You…',
          choices: ['Do it', 'Suggest it to June in your weekly report', 'Add a new campaign', 'Double both'],
          answer: 1, article: A.terms, why: 'Within a campaign is yours; between campaigns is June\'s.' },
      ],
    },
    buffer: 7,
  },

  /* ── 6 ── */
  {
    key: 'a6', icon: '📘', title: 'Facebook and Instagram ads',
    goal: 'Use Meta ads for what they do well on a small budget: reminding people who already know us.',
    lessons: [{
      id: 'a6-meta', article: A.meta, minutes: 30, tags: 'ads, meta, facebook, instagram, retargeting, audiences, pixel, creative, comments, frequency',
      goals: ['Know when Meta ads fit and when Search does', 'Set up retargeting with real photos', 'Handle comments on ads'],
      images: [{ src: '/assets/images/work/embroidered-business-apparel.jpg', alt: 'Embroidered business apparel: real work makes the best Meta ad picture' }],
      body:
`On Google, people are searching for us. On Facebook and Instagram, they are scrolling past friends and videos. So Meta ads work differently, and on a small budget we use them mainly for one thing.

**What Meta ads are for**

- **Retargeting:** people who visited jtees.net, the quote page or the design studio in the last 30 days and did not ask for a quote. They know us; a reminder with a real job photo brings some back
- **Seasons:** a few weeks before back to school or team season, local parents, coaches and organisers, with a clear seasonal message
- **Not** cold "everyone in Chicago" ads on a small budget. They get likes and cheap clicks, rarely quote requests

Most of the budget stays on Google Search. Meta gets the smaller share June approves.

**How it is set up**

- The Meta pixel on our site tells Meta when someone visits and when they send the quote form (the "Lead" event). That is what retargeting audiences are built from
- Campaign objective: **Leads** or **Sales**, never "Engagement" or "Traffic" for these ads. Meta finds whatever you ask for, and likes do not pay
- Location: Chicago and nearby, people living in or recently in the area
- Placements: Facebook and Instagram feeds, Stories and Reels. Let Meta choose among those unless something is clearly wasting money

**The pictures and videos**

On Meta, the picture or video is the ad. Use our own:

- Real jobs: finished orders, the press, the embroidery machine, a team in their shirts. The designer makes images and the content person makes videos; ask in your team channel for what you need
- Sizes: 4:5 (1080 x 1350) for feeds, 9:16 (1080 x 1920) for Stories and Reels, with nothing important near the edges
- Customer photos only with their written permission; children only with a parent's or the team's OK
- One clear message and one next step: "Team shirts for spring? Get a free quote"

**Watching it**

- **Frequency:** how many times the same person has seen the ad. Above about 4 a week, people are tired of it: change the picture
- Judge on cost per quote request, the same as Google. Meta often reports more conversions than really happened; compare with what sales received
- Apply the $40 rule to ads and ad sets too

**Comments on ads**

Ads collect comments like posts do, and everyone who sees the ad sees them.

- Reply within the day, friendly and short. Questions about prices or orders: point them to the quote form and post it in # Sales
- Spam and scams: hide them
- Complaints or anything about a real order: tell June the same day, before replying beyond "please message us"
- Never argue in an ad's comments`,
    }],
    practice: [],
    quiz: {
      key: 'ads-6', title: 'Module 6 quiz: Facebook and Instagram ads', minutes: 10,
      questions: [
        { id: 'for', q: 'On a small budget, Meta ads are mainly for…',
          choices: ['Cold ads to everyone in Chicago', 'Retargeting people who already visited our site', 'Getting likes', 'Job ads'],
          answer: 1, article: A.meta, why: 'People who know us come back with a reminder.' },
        { id: 'share', q: 'Most of the ad budget goes to…',
          choices: ['Meta', 'Google Search', 'TikTok', 'Print ads'],
          answer: 1, article: A.meta, why: 'Searchers are already looking for us.' },
        { id: 'pixel', q: 'Retargeting audiences are built from…',
          choices: ['Customer email lists you download', 'The Meta pixel on our site', 'Your friends list', 'Google Ads'],
          answer: 1, article: A.meta, why: 'The pixel reports visits and the Lead event.' },
        { id: 'objective', q: 'Which campaign objective do we use?',
          choices: ['Engagement', 'Leads or Sales', 'Traffic', 'Video views'],
          answer: 1, article: A.meta, why: 'Meta finds what you ask for; likes do not pay.' },
        { id: 'creative', q: 'The best picture for a Meta ad is…',
          choices: ['A stock photo', 'A real job from our shop', 'A meme', 'Our logo on white'],
          answer: 1, article: A.meta, why: 'On Meta, the picture is the ad; real work convinces.' },
        { id: 'size', q: 'A feed ad image is…',
          choices: ['1080 x 1350 (4:5)', '300 x 250', '1920 x 1080', '500 x 500'],
          answer: 0, article: A.meta, why: '4:5 for feeds, 9:16 for Stories and Reels.' },
        { id: 'freq', q: 'Frequency is 6 this week. You…',
          choices: ['Raise the budget', 'Change the picture: people are tired of it', 'Do nothing', 'Delete the account'],
          answer: 1, article: A.meta, why: 'Above about 4 a week, freshen the ad.' },
        { id: 'count', q: 'Meta reports 12 leads; sales received 7 quote requests. You judge on…',
          choices: ['12', 'The 7 sales actually received, and check tracking', 'The average', 'Neither'],
          answer: 1, article: A.meta, why: 'Meta often over-reports; compare with real requests.' },
        { id: 'price', q: 'A comment on an ad asks the price for 30 hoodies. You…',
          choices: ['Give a price', 'Point them to the quote form and post it in # Sales', 'Hide it', 'Ignore it'],
          answer: 1, article: A.meta, why: 'Prices come from sales.' },
        { id: 'complaint', q: 'A comment on an ad complains about an order. You…',
          choices: ['Argue', 'Tell June the same day; reply only "please message us"', 'Hide it and forget it', 'Offer a refund'],
          answer: 1, article: A.meta, why: 'Complaints and real orders go to June.' },
      ],
    },
    buffer: 6,
  },

  /* ── 7 ── */
  {
    key: 'a7', icon: '🗓️', title: 'Seasons, names and change notes',
    goal: 'Have seasonal campaigns ready before customers start looking, and keep the account readable by anyone.',
    lessons: [{
      id: 'a7-seasons', article: A.seasons, minutes: 20, tags: 'ads, seasonal, back to school, sports, graduation, holidays, paused, calendar',
      goals: ['Know our busy seasons and when people start planning', 'Build seasonal campaigns a month early, paused', 'Switch them on and off on time'],
      images: [{ src: '/assets/images/work/kindergarten-back-to-school-tee.jpg', alt: 'A back-to-school tee: a season worth planning a month ahead' }],
      body:
`Custom shirts are seasonal. Schools, teams and families order for a date, and they start looking weeks before it. An ad that goes live the week of the event is too late.

**Our seasons**

When people start planning, roughly:

- **Back to school and spirit wear:** plan in June, ads from July
- **Fall sports and football:** ads from late July and August
- **Homecoming, Halloween, fall events:** ads from September
- **Holidays, staff gifts, end-of-year:** ads from October into early December
- **Spring sports:** ads from January and February
- **Graduation, proms, end of school year:** ads from March and April
- **Summer:** family reunions, camps, church events, Juneteenth and the Fourth of July: ads from April and May

Check with June each quarter: she knows which seasons brought the most work last year.

**Built early, paused**

About a month before each season:

1. Build the campaign: ad groups, keywords, ads that name the season ("Spirit Wear for Back to School"), and the right landing page
2. Leave it **paused**
3. Tell June in your weekly report what is ready, the daily budget you suggest, and the dates
4. When she says yes, switch it on, and put the end date in the campaign so it stops by itself

Building early means there is time to fix mistakes, get ads approved, and ask the designer or content person for seasonal pictures.

**After the season**

- Make sure it stopped. A spirit-wear ad running in November wastes money and looks careless
- Note in your change notes what it spent, the quote requests and orders it brought, and what you would change next year
- Keep the campaign paused rather than deleting it: next year starts from it`,
    }, {
      id: 'a7-naming', article: A.naming, minutes: 20, tags: 'ads, naming convention, change notes, change log, history, handover',
      goals: ['Name campaigns so anyone can read them', 'Keep change notes June can follow', 'Leave the account ready for someone else'],
      body:
`An account is read by June, by you in six months, and maybe by someone after you. Names and notes make it readable; without them, nobody knows why anything is the way it is.

**Naming**

Every campaign, ad group and ad set is named the same way: where, goal, who, and when if it is seasonal.

- GS_Quotes_TeamShirts_Chicago (Google Search, quote requests, team shirts)
- GS_Quotes_Embroidery_Chicago
- META_Leads_Retarget30d
- GS_Quotes_BackToSchool_2026-07

Ad groups are named for their theme: "team shirts", "school spirit wear", "embroidered polos". Ads say what they test: "reviews headline", "speed headline".

Rename anything you inherit to the pattern during your first month, telling June first.

**Change notes**

Every change goes in one running note, newest first, one line each:

- The date
- What changed: "paused keyword 'custom apparel'", "added 6 negatives to GS_Quotes_TeamShirts"
- Why: "$41 spent, no quote requests; search terms were wholesale blanks"
- Who approved it, for anything June approved

Keep the note here: [owner to fill in: where the ads change notes are kept]

Google Ads keeps its own change history, but it says what changed, not why. The why is what June and the next person need.

**Ready for someone else**

If you were off for two weeks, could someone else run the account from what is written down? They should find:

- What each campaign is for and its approved budget
- The negatives and why the big ones are there
- The last test quote date and result
- What is planned next, and what is waiting for June

That is also your handover when you take time off.`,
    }],
    practice: [],
    quiz: {
      key: 'ads-7', title: 'Module 7 quiz: seasons, names and change notes', minutes: 10,
      questions: [
        { id: 'early', q: 'Back-to-school ads should start…',
          choices: ['The first day of school', 'In July, built in June', 'In December', 'After school starts'],
          answer: 1, article: A.seasons, why: 'People start looking weeks before.' },
        { id: 'grad', q: 'Graduation ads start around…',
          choices: ['March and April', 'August', 'November', 'The day before'],
          answer: 0, article: A.seasons, why: 'Graduation and end of school year: March and April.' },
        { id: 'paused', q: 'A seasonal campaign is built…',
          choices: ['The week of the event, running', 'About a month early, paused', 'Never', 'A year early, running'],
          answer: 1, article: A.seasons, why: 'Time to fix mistakes and get approval.' },
        { id: 'switch', q: 'Who decides when a seasonal campaign switches on?',
          choices: ['You alone', 'June, after your weekly report', 'Google', 'The designer'],
          answer: 1, article: A.seasons, why: 'New campaigns and budgets are June\'s.' },
        { id: 'end', q: 'How do you make sure a seasonal campaign stops on time?',
          choices: ['Remember', 'Put the end date in the campaign', 'Delete it later', 'Lower the budget'],
          answer: 1, article: A.seasons, why: 'An end date stops it by itself.' },
        { id: 'after', q: 'After a season you…',
          choices: ['Delete the campaign', 'Keep it paused and note what it spent and brought', 'Leave it running', 'Rename it'],
          answer: 1, article: A.seasons, why: 'Next year starts from it.' },
        { id: 'name', q: 'Which campaign name follows our pattern?',
          choices: ['Campaign #3', 'GS_Quotes_TeamShirts_Chicago', 'new test', 'June\'s ads'],
          answer: 1, article: A.naming, why: 'Where, goal, who, and when if seasonal.' },
        { id: 'why', q: 'What does Google\'s change history not tell you?',
          choices: ['What changed', 'Why it changed', 'When', 'Who'],
          answer: 1, article: A.naming, why: 'The why lives in our change notes.' },
        { id: 'line', q: 'Which change note is best?',
          choices: ['"Fixed stuff"', '"Oct 9: paused \'custom apparel\', $41 spent, no quote requests, searches were wholesale blanks"', '"Paused"', '"Changes made"'],
          answer: 1, article: A.naming, why: 'Date, what, and why.' },
        { id: 'handover', q: 'You are off for two weeks. What lets someone else run the account?',
          choices: ['Your memory', 'What is written: campaign purposes, budgets, negatives, last test quote, what is planned', 'June\'s password', 'Nothing'],
          answer: 1, article: A.naming, why: 'The account is ready for someone else.' },
      ],
    },
    buffer: 7,
  },

  /* ── 8 ── */
  {
    key: 'a8', icon: '📝', title: 'The weekly report',
    goal: 'Tell June every week, in plain English, what the ads cost, what they brought, and what you changed.',
    lessons: [{
      id: 'a8-report', article: A.report, minutes: 25, tags: 'ads, weekly report, summary, spend, quote requests, orders, profit, quiet time',
      goals: ['Write a weekly report June can read in a minute', 'Say whether the ads are paying for themselves', 'Ask for decisions clearly'],
      body:
`June is busy and is not an ads expert. Your weekly report is how she knows her money is working, and how she makes the decisions that are hers.

**What goes in it**

Every week, on the same day, in your team channel or Direct with June:

1. **Spend:** what we spent, against the budget
2. **Results:** quote requests from ads and the cost of each, orders and their value
3. **Is it paying?** About 40% of order value is profit; compare that with the spend
4. **What you changed**, and why, in a line or two
5. **What you need from June:** a decision, with your suggestion

**An example**

"Hi June, this week's ads:

- Spent $140 of $150. 9 quote requests ($15.50 each), 3 orders worth $1,250
- About $500 profit for $140 of ads, so it is paying for itself
- 'Custom apparel' spent $35 with nothing, mostly people looking for wholesale blanks. I paused it and added those searches as negatives
- Next week: I would move that $35 to 'team shirts chicago', our best keyword. OK?
- Back-to-school campaign is built and paused, ready for July 1 at $8 a day. Say yes and I will switch it on."

Five lines, real numbers, plain words. No screenshots of dashboards, no words like "optimise", "leverage" or "synergy".

**Bad weeks**

Say so plainly, with what you think happened and what you will do. "Quote requests fell from 9 to 3. Tracking still works (tested Tuesday). Searches were down across the board, likely the holiday week. I am leaving it alone and watching." A bad week explained is fine; a bad week hidden is not.

**Where the order numbers come from**

The platforms count conversions; sales knows which became orders. Ask in # Sales which quote requests from the week came from ads and whether they paid, or check with June how she wants you to see it: [owner to fill in: how the ads person sees which quote requests came from ads and which became orders]

**Quiet time**

When the account is in good shape:

- Search terms and negatives across all campaigns
- Two new headline tests for the best ad group, using real reviews
- The next seasonal campaign, built and paused
- A test quote, and every landing page on your phone
- Your change notes, so they are ready for anyone`,
    }],
    practice: [
      { key: 'signoff:ads-report', type: 'signoff', minutes: 5,
        title: 'Sends a weekly report June can act on', hint: 'Your first weekly report: spend against budget, quote requests and their cost, orders, whether it paid, what you changed, and a clear question for June.' },
    ],
    quiz: {
      key: 'ads-8', title: 'Module 8 quiz: the weekly report', minutes: 10,
      questions: [
        { id: 'often', q: 'How often does June get your report?',
          choices: ['Every week, same day', 'Once a month', 'When something breaks', 'Never'],
          answer: 0, article: A.report, why: 'Weekly, on the same day.' },
        { id: 'first', q: 'Which goes in every report?',
          choices: ['Spend, quote requests and their cost, orders, changes, decisions needed', 'Only clicks', 'Screenshots of every page', 'Industry news'],
          answer: 0, article: A.report, why: 'The five parts of the report.' },
        { id: 'paying', q: '$200 spent; orders worth $1,000 from ads. Paying?',
          choices: ['Yes: about $400 profit for $200', 'No', 'Cannot tell', 'Only if clicks are high'],
          answer: 0, article: A.report, why: 'About 40% of order value is profit.' },
        { id: 'words', q: 'Which line belongs in a report?',
          choices: ['"Leveraged synergies to optimise reach"', '"Paused \'custom apparel\': $35, no quote requests"', '"Things are fine"', '"See dashboard"'],
          answer: 1, article: A.report, why: 'Real numbers, plain words.' },
        { id: 'ask', q: 'You want a budget increase. In the report you…',
          choices: ['Hide it', 'Ask clearly, with your suggestion and why', 'Just do it', 'Ask Google'],
          answer: 1, article: A.report, why: 'A clear decision with a suggestion.' },
        { id: 'bad', q: 'A bad week: quote requests fell from 9 to 3. You…',
          choices: ['Leave it out', 'Say so, with what you think happened and what you will do', 'Blame the website', 'Double the budget'],
          answer: 1, article: A.report, why: 'A bad week explained is fine; hidden is not.' },
        { id: 'tracking', q: 'Before blaming the ads for a bad week, check…',
          choices: ['Tracking still works', 'The weather only', 'Nothing', 'Your email'],
          answer: 0, article: A.report, why: 'Tracking first.' },
        { id: 'orders', q: 'Who knows which quote requests became orders?',
          choices: ['Google', 'Sales and June', 'Meta', 'The customer only'],
          answer: 1, article: A.report, why: 'The platforms count conversions; sales knows orders.' },
        { id: 'quiet', q: 'A good quiet-time task is…',
          choices: ['Building the next seasonal campaign, paused', 'Raising budgets', 'Deleting old campaigns', 'Nothing'],
          answer: 0, article: A.report, why: 'Prepare the next season ahead.' },
        { id: 'length', q: 'A good weekly report is about…',
          choices: ['Five lines', 'Five pages', 'One word', 'A spreadsheet'],
          answer: 0, article: A.report, why: 'June reads it in a minute.' },
      ],
    },
    buffer: 7,
  },
];

/* The final exam: new questions across the whole course, 80% to pass. */
const FINAL = {
  floating: 15,
  quiz: {
    key: 'ads-final', title: 'Final exam: the Ads course', minutes: 25,
    questions: null, // ads-core-final.js
  },
  signoffs: [
    { key: 'signoff:handoff', type: 'signoff', minutes: 0,
      title: 'Knows what is June\'s to decide', hint: 'New campaigns, budget changes, offers and prices in ads, complaints in ad comments. June signs this off after seeing you do it.' },
    { key: 'signoff:ready', type: 'signoff', minutes: 0,
      title: 'Ready to run the ads day to day', hint: 'The last step. June decides when you run the approved campaigns without her checking each change first.' },
  ],
};
FINAL.quiz.questions = require('./ads-core-final')(A);

const PAGES = require('./ads-core-pages');
for (const l of MODULES.flatMap((m) => m.lessons)) {
  if (l.pages) continue; // the shared module's lessons carry their own
  l.pages = PAGES[l.id] || [{ from: null, checks: [] }];
  l.checks = l.pages.flatMap((pg) => pg.checks);
}

module.exports = { key: 'ads-core', title: 'Ads', track: 'ads', articles: A, glossary: GLOSSARY, modules: MODULES, final: FINAL };
