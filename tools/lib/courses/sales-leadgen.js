'use strict';

/* The Lead Generation course: the second eight hours for a salesperson the
   owner gives the Lead Generation role on Staff. It follows the consolidated
   Sales course (sales-core.js) and goes deeper on that one job: find groups
   that need shirts soon, reach the person who decides, and turn replies into
   quote requests.

   Same shape as the Sales course: modules of lessons (playbook articles,
   added once by title so the owner's edits are kept), practice steps, a quiz
   per module at 80%, buffer time, then a final exam and sign-offs.

   Every rule here is one the Sales course or the system already sets. What
   only the owner can decide is written "[owner to fill in: ...]", which the
   Training page's "Playbook gaps" card asks her for. */

const A = {
  job:       'Lead Generation 1: The job',
  calendar:  'Lead Generation 2: Who buys, and when',
  research:  'Lead Generation 3: Where to find prospects',
  decider:   'Lead Generation 4: Finding the person who decides',
  openers:   'Lead Generation 5: Openers that get replies',
  cadence:   'Lead Generation 6: Follow-ups, logging and reading replies',
  handover:  'Lead Generation 7: From a reply to a quote request',
  numbers:   'Lead Generation 8: Your day and your numbers',
};

const GLOSSARY = {
  'pipeline': 'Every prospect and lead you are working, from first found to quote. Lead Generation keeps it full.',
  'decision-maker': 'The person who chooses the shirts and the shop: a PTO chair, a coach, a league coordinator, a business owner.',
  'opener': 'Your first message to a prospect: short, personal, about them, with one easy next step.',
  'reply rate': 'Replies divided by first messages sent. It shows whether your openers and your prospects are good.',
  'cadence': 'The rhythm of follow-ups: the first message, about 3 days later, about 10 days later, then stop.',
  'quote request': 'A prospect who has asked for a price. Now they are a lead like any other, answered within the hour.',
};

const MODULES = [
  /* ── 1 ── */
  {
    key: 'lg1', icon: '🎯', title: 'The Lead Generation job',
    goal: 'Know what the role is for, how it is measured, and which rules never change.',
    lessons: [{
      id: 'lg1-job', article: A.job, minutes: 20, tags: 'lead generation, role, pipeline, prospects, reply rate, targets, rules',
      goals: ['Say what Lead Generation does that the other sales roles do not', 'Name the three numbers the role is measured on', 'List the outreach rules that never change'],
      tryIt: [{ label: 'My Day', href: '/admin/my-day' }, { label: 'Leads', href: '/admin/leads' }],
      body:
`You finished the Sales course, so you already know the shop, the products and how a quote is built. This course is about one job: keeping the pipeline full.

**Three sales jobs**

The shop has three sales roles. Each one owns a different part of a customer's life:

- **Lead Generation (you):** find groups that need shirts soon, make the first personal contact, and turn replies into quote requests
- **Sales Closer:** turns every lead into a paid order: fast replies, the right quote, follow-ups and the deposit
- **Account Manager:** keeps past customers ordering: reorders, yearly accounts and reviews

Until every role is filled, you may still do all of it. When a prospect you found asks for a price, they become a lead like any other: answered within the hour.

**What you are measured on**

- **Prospects registered:** groups you found and added on Leads with "I found this customer"
- **Reply rate:** replies divided by first messages sent. A good opener to the right person gets replies; a generic one to a general inbox does not
- **Prospects that reach a quote:** the number that matters most to the shop

Quality beats count. One prospect with a real person, a real date and a reason to buy now is worth more than ten Facebook pages with nobody behind them.

Your targets: [owner to fill in: prospects registered per day, and first messages sent per day, for Lead Generation]

**What never changes**

Every rule from the Sales course still applies, and in this job they matter most:

- Register a prospect on Leads **before** you quote them
- Email or DM only. Never text or call a number you found online
- One personal message, then two follow-ups at most, then stop
- Never add anyone to the newsletter who did not sign up
- Never post the same message across many groups
- Never contact anyone who has said no
- Dates, discounts and logos the customer does not own are still June's`,
    }],
    practice: [],
    quiz: {
      key: 'leadgen-1', title: 'Module 1 quiz: the job', minutes: 10,
      questions: [
        { id: 'role', q: 'What is the Lead Generation job?',
          choices: ['Answer every inbound chat', 'Find groups that need shirts soon, make the first personal contact, and turn replies into quote requests', 'Collect balances', 'Reply to reviews'],
          answer: 1, article: A.job, why: 'Lead Generation fills the pipeline: finding, first contact, and turning replies into quote requests.' },
        { id: 'closer', q: 'Whose job is turning leads into paid orders, once that role is filled?',
          choices: ['Lead Generation', 'The Sales Closer', 'The Account Manager', 'The designer'],
          answer: 1, article: A.job, why: 'The Closer turns leads into paid orders.' },
        { id: 'accounts', q: 'Who looks after reorders and yearly accounts?',
          choices: ['The Account Manager', 'Lead Generation', 'Nobody', 'The Closer'],
          answer: 0, article: A.job, why: 'Past customers are the Account Manager\'s.' },
        { id: 'measure', q: 'Which number matters most to the shop?',
          choices: ['Facebook pages followed', 'Prospects that reach a quote', 'Hours online', 'Emails opened'],
          answer: 1, article: A.job, why: 'Prospects and replies matter because they lead to quotes.' },
        { id: 'rate', q: 'You sent 20 first messages and got 4 replies. Your reply rate is…',
          choices: ['4%', '20%', '80%', '5%'],
          answer: 1, article: A.job, why: 'Replies divided by first messages: 4 ÷ 20 = 20%.' },
        { id: 'quality', q: 'Which prospect is better?',
          choices: ['A Facebook page with no posts in a year', 'A league with a named coordinator, an email, and a season starting in five weeks', 'A list of 50 businesses with no contacts', 'A school in another state'],
          answer: 1, article: A.job, why: 'A real person, a date and a reason to buy now beats a long list.' },
        { id: 'reply', q: 'A prospect replies "yes, what would 40 shirts cost?". How fast do they get an answer during your shift?',
          choices: ['Within 1 hour, like any lead', 'Tomorrow', 'When the Closer is free', 'Within a week'],
          answer: 0, article: A.job, why: 'A reply asking for a price is a lead: answered within the hour.' },
        { id: 'text', q: 'You found a coach\'s mobile number on a league site. May you text it?',
          choices: ['Yes, it is public', 'No. Email or DM only', 'Once', 'Only after 5pm'],
          answer: 1, article: A.job, why: 'Never text or call a number you found online.' },
        { id: 'news', q: 'May you add a prospect to the newsletter so they hear about deals?',
          choices: ['Yes', 'Only businesses', 'No, never unless they signed up', 'Only after a follow-up'],
          answer: 2, article: A.job, why: 'Only people who signed up get the newsletter.' },
        { id: 'discount', q: 'A prospect says they will order if you give 15% off. You…',
          choices: ['Agree, a sale is a sale', 'Say you will check with June and reply by a set time', 'Offer 10%', 'Refuse'],
          answer: 1, article: A.job, why: 'Discounts are always June\'s decision.' },
      ],
    },
    buffer: 7,
  },

  /* ── 2 ── */
  {
    key: 'lg2', icon: '📅', title: 'Who buys, and when',
    goal: 'Know which groups need shirts in each season, what each one orders, and who to look for today.',
    lessons: [{
      id: 'lg2-calendar', article: A.calendar, minutes: 35, tags: 'seasonal calendar, customer types, schools, leagues, churches, businesses, families, timing',
      goals: ['Name who needs shirts 4 to 6 weeks from any date', 'Match each customer type to what they order', 'Pick one search for today'],
      tryIt: [{ label: 'Customers: who ordered last year', href: '/admin/customers' }],
      body:
`Timing is most of this job. The right group, reached while they are still deciding, says yes far more often than the same group reached the week of their event.

**The four-to-six-week rule**

Groups decide on shirts 4 to 6 weeks before they need them. So on any day, you prospect for what happens 4 to 6 weeks from now, not for what is happening today.

- In late July you look for back-to-school and fall sports, not summer camps
- In February you look for spring sports and spring break trips, not holiday gifts
- In April you look for field day, graduation and summer camps

**The calendar**

- **August to September:** back to school, fall sports, PTO spirit wear, homecoming
- **October to December:** fall festivals, charity runs and walks, holiday staff gifts, winter sports
- **January to March:** spring sports sign-ups, business kickoffs, spring break trips
- **April to June:** field day, graduation, end-of-year staff shirts, summer camps, family reunions
- **All year:** businesses (staff shirts, uniforms, openings), churches, clubs, Greek life, birthdays and memorials

**What each customer type orders**

- **Schools, PTOs and booster clubs:** spirit wear, field day, graduation and staff shirts. Graduations also suit Big Head Cutouts and banners
- **Sports leagues and teams:** uniforms with names and numbers, and fan shirts, every season. Cutouts for games
- **Churches, camps, runs and walks:** event shirts and volunteer shirts, often with sponsors on the back. Banners for the start line
- **Small businesses:** staff shirts, embroidered polos and caps, uniforms, and opening-day signs and banners
- **Families and groups:** reunions, birthdays, memorials, trips and Greek life. Usually small runs, which suit DTF

Knowing what they order lets your first message offer the right thing.

**Picking today's search**

Pick one customer type, one area and one date coming up 4 to 6 weeks out. "Youth soccer leagues on the North Side, spring season" is a search. "Anyone who needs shirts" is not.

Where to start: [owner to fill in: which customer types and which neighborhoods or suburbs to prospect first]

Past customers on Customers show which types already buy from us. Those are the best types to find more of. The past customers themselves belong to the Account Manager.`,
    }],
    practice: [],
    quiz: {
      key: 'leadgen-2', title: 'Module 2 quiz: who buys, and when', minutes: 10,
      questions: [
        { id: 'rule', q: 'Groups decide on shirts how long before they need them?',
          choices: ['The week before', '4 to 6 weeks before', 'Six months before', 'The day after'],
          answer: 1, article: A.calendar, why: 'Reach them 4 to 6 weeks out, while they are deciding.' },
        { id: 'july', q: 'It is late July. What do you prospect for?',
          choices: ['Summer camps', 'Back to school, fall sports and homecoming', 'Graduation', 'Spring break'],
          answer: 1, article: A.calendar, why: 'August to September is back to school and fall sports, so late July is when you reach them.' },
        { id: 'feb', q: 'It is February. Best prospects?',
          choices: ['Spring sports leagues and spring break trips', 'Holiday staff gifts', 'Homecoming', 'Fall festivals'],
          answer: 0, article: A.calendar, why: 'January to March is spring sports and spring break.' },
        { id: 'april', q: 'It is April. Which group fits?',
          choices: ['Winter sports', 'Field day, graduation and summer camps', 'Back to school', 'Holiday gifts'],
          answer: 1, article: A.calendar, why: 'April to June is field day, graduation and camps.' },
        { id: 'oct', q: 'Which group is in season October to December?',
          choices: ['Charity runs and holiday staff gifts', 'Spring break trips', 'Graduation', 'Field day'],
          answer: 0, article: A.calendar, why: 'Fall festivals, runs and walks, holiday gifts and winter sports.' },
        { id: 'biz', q: 'What does a small business usually order?',
          choices: ['Field day shirts', 'Staff shirts, embroidered polos and caps, and opening signs', 'Cutouts of players', 'Reunion shirts'],
          answer: 1, article: A.calendar, why: 'Businesses buy staff wear, embroidery and opening signage.' },
        { id: 'grad', q: 'A school graduation suits which add-ons?',
          choices: ['Big Head Cutouts and banners', 'Vehicle magnets', 'Embroidered jackets only', 'Nothing'],
          answer: 0, article: A.calendar, why: 'Graduations suit cutouts and banners.' },
        { id: 'family', q: 'A family reunion of 20 people usually suits…',
          choices: ['Screen printing', 'DTF: a small run', 'Embroidery', 'Vinyl banners only'],
          answer: 1, article: A.calendar, why: 'Small runs suit DTF.' },
        { id: 'search', q: 'Which is a good search for today?',
          choices: ['Anyone who needs shirts', 'Youth soccer leagues on the North Side, spring season', 'Every business in Illinois', 'Last year\'s customers'],
          answer: 1, article: A.calendar, why: 'One type, one area, one date 4 to 6 weeks out.' },
        { id: 'past', q: 'Past customers on Customers are useful to you because…',
          choices: ['You should email them all', 'They show which customer types already buy, so you find more like them', 'They are your rep leads', 'They need no proofs'],
          answer: 1, article: A.calendar, why: 'Find more of the types that buy. The customers themselves are the Account Manager\'s.' },
      ],
    },
    buffer: 7,
  },

  /* ── 3 ── */
  {
    key: 'lg3', icon: '🔎', title: 'Where to find prospects',
    goal: 'Find real prospects in five places, and register each one on Leads with what makes them worth a message.',
    lessons: [{
      id: 'lg3-research', article: A.research, minutes: 40, tags: 'prospect research, google maps, school websites, league websites, facebook groups, eventbrite, chamber of commerce, register lead',
      goals: ['Search five kinds of source for prospects', 'Tell a live prospect from a dead page', 'Register a prospect on Leads with the link, the reason and the date'],
      tryIt: [{ label: 'Leads: Add a lead', href: '/admin/leads' }, { label: 'Google Maps: youth leagues near Chicago', href: 'https://www.google.com/maps/search/youth+sports+league+chicago' }],
      body:
`A prospect is a group that will probably need shirts soon and has a person you can reach. Each source below finds a different kind.

**Google Maps**

Search a type of place plus an area: "youth soccer league Logan Square", "dance studio Evanston", "new restaurant Pilsen", "church Oak Park".

- Open each result and check it is alive: recent reviews, recent photos, opening hours, a website
- The website and the reviews tell you what they run (teams, classes, events) and when
- Businesses that opened in the last few months need staff shirts and opening signs

**School, league and PTO websites**

- **Calendars and events pages:** field day, spirit week, fun runs, graduation, season start dates
- **Staff, board and contact pages:** the PTO chair, the athletic director, the league coordinator
- **Registration pages:** a league taking sign-ups now needs uniforms within weeks

A date on one of these pages is the best reason to write that exists.

**Facebook groups and events**

- Local parent groups, neighborhood groups and events pages show fun runs, festivals, reunions and school events
- Read each group's rules before you post anything. If a group bans selling, do not sell there
- Prefer a direct message to the organiser over a public post. Never post the same message across many groups

**Eventbrite and city calendars**

Search for runs, walks, festivals and fundraisers in the next two months. The organiser is listed on every event, often with a page or a contact button. Volunteer and participant shirts are the usual order.

**The Chamber of Commerce and business directories**

Chambers list members, new members and ribbon cuttings. A ribbon cutting is a business opening: staff shirts, polos and a banner.

**What to write on the lead**

On **Leads**, open **Add a lead** and choose **I found this customer**. Then:

- **Platform:** where you found them (Google, Facebook, Instagram, or Other)
- **Name and email:** the person, if you have found them (module 4), or the organisation
- **Phone:** leave it blank. We never call or text a number found online
- **Link:** the page that shows why they need shirts: the events page, the registration page, the ribbon cutting
- **What they asked for:** why now, and the date. "Spring season starts April 6, about 120 players, coordinator listed on the board page"

Register before you send anything. If the shop already knew them, it stays a shop lead and the page tells you why. When two people register the same new customer, the first one wins.`,
    }],
    practice: [
      { key: 'do:prospects-10', type: 'do', fact: 'prospects', need: 10, minutes: 30,
        title: 'Register 10 real prospects', hint: 'On Leads, Add a lead, "I found this customer", each with the link and why they need shirts now. The 3 from the Sales course count. This ticks itself at 10.' },
    ],
    quiz: {
      key: 'leadgen-3', title: 'Module 3 quiz: where to find prospects', minutes: 10,
      questions: [
        { id: 'maps', q: 'Which is a useful Google Maps search?',
          choices: ['"shirts"', '"youth soccer league Logan Square"', '"Chicago"', '"print shop"'],
          answer: 1, article: A.research, why: 'A type of place plus an area.' },
        { id: 'alive', q: 'How do you tell a Maps listing is still alive?',
          choices: ['It has a name', 'Recent reviews and photos, opening hours and a website', 'It is near the shop', 'It has five stars'],
          answer: 1, article: A.research, why: 'Recent activity shows a real, running group.' },
        { id: 'best', q: 'What is the best reason to write to a prospect?',
          choices: ['They exist', 'A date on their own page: a season start, field day, a fun run', 'They have a logo', 'They are near the shop'],
          answer: 1, article: A.research, why: 'A date gives your message a reason, and them a deadline.' },
        { id: 'reg', q: 'A league\'s registration page says sign-ups close next week. What does that tell you?',
          choices: ['Nothing', 'They will need uniforms within weeks', 'They already have shirts', 'They are closing down'],
          answer: 1, article: A.research, why: 'A league taking sign-ups needs uniforms soon.' },
        { id: 'group', q: 'A Facebook parent group\'s rules say "no selling". You…',
          choices: ['Post anyway, once', 'Do not sell there; message an event organiser directly if one is listed', 'Post in the comments instead', 'Make a second account'],
          answer: 1, article: A.research, why: 'Respect each group\'s rules. Prefer a direct message to the organiser.' },
        { id: 'chamber', q: 'A Chamber page lists a ribbon cutting next month. That business probably needs…',
          choices: ['Nothing', 'Staff shirts, polos and a banner for opening day', 'Graduation cutouts', 'Reunion shirts'],
          answer: 1, article: A.research, why: 'A ribbon cutting is an opening.' },
        { id: 'eventbrite', q: 'On Eventbrite, a 5K is in seven weeks. Who do you look for?',
          choices: ['The runners', 'The organiser listed on the event', 'The venue cleaner', 'Nobody, it is too early'],
          answer: 1, article: A.research, why: 'The organiser decides on volunteer and participant shirts, and seven weeks is the right time.' },
        { id: 'phone', q: 'When you register a found prospect, the phone box is…',
          choices: ['Filled with any number on their page', 'Left blank: we never call or text a number found online', 'Required', 'For their cell'],
          answer: 1, article: A.research, why: 'Email or DM only for prospects.' },
        { id: 'why', q: 'What goes in the "What they asked for" box for a found prospect?',
          choices: ['Nothing', 'Why now and the date, e.g. "spring season starts April 6, about 120 players"', 'Our price list', 'Their address'],
          answer: 1, article: A.research, why: 'The reason and the date make the lead useful to anyone who opens it.' },
        { id: 'first', q: 'You and a teammate both register the same new league. Whose is it?',
          choices: ['Whoever quotes first', 'The first one registered', 'Shared', 'June decides by coin toss'],
          answer: 1, article: A.research, why: 'When two people register the same new customer, the first one wins.' },
      ],
    },
    buffer: 7,
  },

  /* ── 4 ── */
  {
    key: 'lg4', icon: '🧑‍💼', title: 'Finding the person who decides',
    goal: 'Know who chooses the shirts in each kind of group, find their public contact, and know what to do when there is none.',
    lessons: [{
      id: 'lg4-decider', article: A.decider, minutes: 30, tags: 'decision maker, contact, PTO chair, coach, league coordinator, business owner, organiser, email',
      goals: ['Name the decision-maker for each customer type', 'Find a public contact the group gives for that purpose', 'Write to a role when no name is listed'],
      tryIt: [{ label: 'Leads', href: '/admin/leads' }],
      body:
`A message to the right person gets read. The same message to a general inbox often does not. Spend a few minutes finding who decides before you write.

**Who decides, by customer type**

- **Schools:** the PTO or booster club president, the spirit wear chair, the athletic director, or the teacher running the event
- **Sports leagues:** the league coordinator or board for uniforms; each team's coach for fan shirts
- **Churches:** the office administrator, the youth pastor, or whoever runs the event
- **Runs, walks and festivals:** the race director or event organiser
- **Businesses:** the owner, or the office or HR manager in a bigger one
- **Families and groups:** the organiser, usually the one posting about the event

**Finding their contact**

Use the contact the group itself publishes for this kind of question:

- Staff, board and contact pages on school, league and church websites
- The organiser listed on an Eventbrite or Facebook event
- A business's own website contact page, or its page's message button

Never guess personal email addresses, buy contact lists, or copy contacts from a site that does not offer them. And never a phone number: email or DM only.

**When you cannot find a person**

Write to the group's general email or page, and address the role: "Hi! I'm hoping to reach whoever looks after spirit wear at Lincoln Elementary." Ask who the right person is. When they tell you, update the lead with the name and email.

Note on the lead who decides and how you found them. If someone else picks up the lead later, they start from there.`,
    }],
    practice: [],
    quiz: {
      key: 'leadgen-4', title: 'Module 4 quiz: the person who decides', minutes: 10,
      questions: [
        { id: 'school', q: 'Who usually decides on spirit wear at a school?',
          choices: ['The janitor', 'The PTO president or spirit wear chair', 'A student', 'The district office'],
          answer: 1, article: A.decider, why: 'Spirit wear runs through the PTO or booster club.' },
        { id: 'league', q: 'Who decides on uniforms for a whole league?',
          choices: ['Each parent', 'The league coordinator or board', 'The referee', 'The field owner'],
          answer: 1, article: A.decider, why: 'League uniforms are the coordinator\'s or board\'s.' },
        { id: 'fan', q: 'Fan shirts for one team are usually chosen by…',
          choices: ['The team\'s coach', 'The league board', 'The city', 'The school principal'],
          answer: 0, article: A.decider, why: 'Each team\'s coach handles fan shirts.' },
        { id: 'run', q: 'For a charity 5K, you look for…',
          choices: ['The race director or organiser', 'A runner', 'The sponsor\'s accountant', 'The timing company'],
          answer: 0, article: A.decider, why: 'The organiser decides on event shirts.' },
        { id: 'biz', q: 'At a 60-person company, who often handles staff shirts?',
          choices: ['A new hire', 'The office or HR manager', 'A customer', 'The landlord'],
          answer: 1, article: A.decider, why: 'In bigger businesses, the office or HR manager.' },
        { id: 'source', q: 'Which contact may you use?',
          choices: ['A personal email you guessed', 'A bought list', 'The contact the group publishes for questions like this', 'A number from a directory'],
          answer: 2, article: A.decider, why: 'Use the contact the group itself gives for this.' },
        { id: 'guess', q: 'You think the coach is probably jsmith@ the school domain. May you write to it?',
          choices: ['Yes, it is likely right', 'No. Never guess personal emails; use a published contact', 'Only once', 'Yes, if you BCC June'],
          answer: 1, article: A.decider, why: 'No guessed emails.' },
        { id: 'none', q: 'No person is listed, only a general email. You…',
          choices: ['Skip them', 'Write to it, address the role, and ask who the right person is', 'Call the front desk', 'Post on their wall'],
          answer: 1, article: A.decider, why: 'Write to the role and ask for the right person.' },
        { id: 'update', q: 'They reply with the spirit wear chair\'s name and email. Next?',
          choices: ['Keep it in your head', 'Update the lead with the name and email, then write to them', 'Make a new lead', 'Add them to the newsletter'],
          answer: 1, article: A.decider, why: 'Keep the lead current so anyone can pick it up.' },
        { id: 'note', q: 'Why note on the lead who decides and how you found them?',
          choices: ['It is required by law', 'Anyone who picks up the lead later starts from there', 'It changes the price', 'It sends an email'],
          answer: 1, article: A.decider, why: 'A lead others can pick up without starting over.' },
      ],
    },
    buffer: 7,
  },

  /* ── 5 ── */
  {
    key: 'lg5', icon: '✉️', title: 'Openers that get replies',
    goal: 'Write a first message in four parts, and adapt ten templates so each one reads as written for that group.',
    lessons: [{
      id: 'lg5-openers', article: A.openers, minutes: 35, tags: 'opener, first message, templates, email, dm, subject line, schools, leagues, churches, businesses, families',
      goals: ['Write an opener in four parts', 'Pick the right template for a customer type', 'Make a template personal in under two minutes'],
      tryIt: [{ label: 'Playbook: search "opener"', href: '/admin/playbook?q=opener' }],
      body:
`Your first message decides whether you get a reply. Short and personal beats long and polished.

**The four parts of every opener**

- **Their name and their thing:** the person, and their team, school, event or business by name
- **One specific detail:** the season start, the event date, the opening, something from their page
- **One line on what we do for groups like them:** not a price list
- **One easy next step:** "Want a couple of design ideas and a price?" A yes should take them five seconds

Sign with your first name and June's Tees. For email, the subject line names them: "Shirts for Lincoln Park Youth Soccer's spring season".

Under 70 words. No attachments, no links to a price list, no capital letters shouting.

**Templates: schools, leagues and teams**

1. **PTO spirit wear:** "Hi [name], I saw Lincoln Elementary's spirit week is coming up on [date]. We make spirit wear for Chicago schools and PTOs, and can send a couple of design ideas with a price per shirt. Would that help? — [your name], June's Tees"
2. **Field day or graduation:** "Hi [name], congrats to the class of [year]! We make graduation shirts, banners and Big Head Cutouts for local schools. Want a few ideas and prices for [school]? — [your name], June's Tees"
3. **League uniforms:** "Hi [name], I saw [league]'s [season] sign-ups are open. We make team shirts with names and numbers for local leagues. Want a quick design idea and a price for your teams? — [your name], June's Tees"
4. **Team fan shirts:** "Hi Coach [name], congrats on the season so far! Families often want fan shirts to match the team. Want a design idea and a price for [team] parents? — [your name], June's Tees"

**Templates: churches, events and businesses**

5. **Church event:** "Hi [name], I saw [church]'s [event] on [date]. We make event and volunteer shirts for local churches. Would a couple of design ideas and a price help? — [your name], June's Tees"
6. **Run, walk or festival:** "Hi [name], [event] on [date] looks great! We make participant and volunteer shirts, with sponsors on the back if you like, plus start-line banners. Want ideas and a price? — [your name], June's Tees"
7. **New business:** "Hi [name], congratulations on opening [business]! We make staff shirts, embroidered polos and opening-day banners for local businesses. Want a couple of ideas and prices? — [your name], June's Tees"
8. **Established business:** "Hi [name], we make embroidered polos, caps and staff shirts for Chicago businesses like [business]. Would a mockup with your logo and a price be useful? — [your name], June's Tees"

**Templates: families and groups**

9. **Family reunion:** "Hi [name], I saw the [family] reunion is coming up on [date]! We make reunion shirts in any size and colour, even for small groups. Want a couple of design ideas and a price? — [your name], June's Tees"
10. **Clubs and Greek life:** "Hi [name], congrats on [event or milestone]! We make shirts and hoodies for clubs and chapters, with no minimum on full-colour designs. Want an idea and a price? — [your name], June's Tees"

**Making a template personal**

A template is a starting point, never the message. Before you send:

- Replace every [blank] with something true for them
- Change the first line so it could only be about them: something from their page, their event or their news
- Read it out loud. If it sounds like an ad, cut it
- Check the date: never promise one. "Ideas and a price" is the offer, not a delivery date

June reads your first five openers before you work alone.`,
    }],
    practice: [
      { key: 'signoff:openers', type: 'signoff', minutes: 15,
        title: 'June reads your first five openers', hint: 'Send June five openers in Team chat, each for a real prospect you registered. She signs this off once they read as personal and follow the four parts.' },
    ],
    quiz: {
      key: 'leadgen-5', title: 'Module 5 quiz: openers', minutes: 10,
      questions: [
        { id: 'parts', q: 'Which are the four parts of an opener?',
          choices: ['Greeting, price list, catalogue, signature', 'Their name and thing, one specific detail, what we do for groups like them, one easy next step', 'Subject, logo, discount, deadline', 'Hello, prices, link, phone number'],
          answer: 1, article: A.openers, why: 'Personal, specific, relevant, and easy to say yes to.' },
        { id: 'next', q: 'Which is the best next step to end with?',
          choices: ['"Call us today!"', '"Want a couple of design ideas and a price?"', '"See our catalogue attached"', '"Reply STOP to opt out"'],
          answer: 1, article: A.openers, why: 'A yes should take five seconds.' },
        { id: 'length', q: 'How long should an opener be?',
          choices: ['Under 70 words', 'A full page', 'One word', 'As long as it takes to list every product'],
          answer: 0, article: A.openers, why: 'Short and personal gets read.' },
        { id: 'subject', q: 'Best email subject line?',
          choices: ['"CUSTOM SHIRTS!!!"', '"Shirts for Lincoln Park Youth Soccer\'s spring season"', '"Hello"', '"Price list inside"'],
          answer: 1, article: A.openers, why: 'Name them in the subject.' },
        { id: 'attach', q: 'Should an opener include our price list as an attachment?',
          choices: ['Yes, always', 'No: no attachments and no price list', 'Only for businesses', 'Only on Fridays'],
          answer: 1, article: A.openers, why: 'Offer ideas and a price for them, not a list.' },
        { id: 'pick', q: 'A dental office just opened. Which template fits?',
          choices: ['Family reunion', 'New business', 'League uniforms', 'Graduation'],
          answer: 1, article: A.openers, why: 'Openings: staff shirts, polos and an opening banner.' },
        { id: 'run', q: 'Which template mentions sponsors on the back?',
          choices: ['Run, walk or festival', 'PTO spirit wear', 'Established business', 'Clubs and Greek life'],
          answer: 0, article: A.openers, why: 'Event shirts often carry sponsors.' },
        { id: 'blank', q: 'Before sending a template, every [blank] must be…',
          choices: ['Left for the customer to fill in', 'Replaced with something true for them', 'Deleted', 'Written in capitals'],
          answer: 1, article: A.openers, why: 'A template is a starting point, never the message.' },
        { id: 'date', q: 'A prospect\'s event is in three weeks. Your opener may say…',
          choices: ['"We guarantee them by your date"', '"Want ideas and a price?" (no promised date)', '"Free rush"', '"10% off if you order today"'],
          answer: 1, article: A.openers, why: 'Never promise a date or a discount in an opener.' },
        { id: 'review', q: 'Who reads your first five openers before you work alone?',
          choices: ['Nobody', 'June', 'The prospect', 'The Closer'],
          answer: 1, article: A.openers, why: 'June signs this step off.' },
      ],
    },
    buffer: 7,
  },

  /* ── 6 ── */
  {
    key: 'lg6', icon: '🔁', title: 'Follow-ups, logging and reading replies',
    goal: 'Follow up at the right pace, log every touch so it counts, and answer each kind of reply the right way.',
    lessons: [{
      id: 'lg6-cadence', article: A.cadence, minutes: 30, tags: 'follow up, cadence, logging, follow-up date, replies, not now, no thanks, next season',
      goals: ['Follow up twice, on time, with something new', 'Log every message and set the next follow-up date', 'Answer yes, not now, and no correctly'],
      tryIt: [{ label: 'My Day: follow-ups due', href: '/admin/my-day' }, { label: 'Leads', href: '/admin/leads' }],
      body:
`Most replies come from a follow-up, not the first message. But a third, fourth and fifth message turns a friendly shop into spam.

**The follow-up cadence**

- **Day 0:** your opener
- **About 3 days later:** follow-up one
- **About 10 days later:** follow-up two
- Then stop. No reply after two follow-ups is an answer

Each follow-up adds something new instead of "just checking in":

- A design idea in one line ("navy with a gold number on the back?")
- A photo of similar work we made, from the shop's own pictures
- Their date, gently: "With the season starting April 6, I wanted to make sure you had options." Never a promised delivery date

Keep it shorter than the opener.

**Logging every touch**

Log every message on the lead, and set the **follow up** date each time. Then:

- The prospect comes back on My Day on the right day, so nothing is forgotten
- Your messages and replies are counted, which is how your reply rate is worked out
- Anyone who opens the lead sees the whole story

A message you did not log did not happen, as far as the shop can tell.

**Reading the replies**

- **"Yes, send ideas" or "how much?":** they are now a quote request. Reply within the hour and ask the five details (module 7)
- **"Not now" or "next season":** thank them, note the season on the lead, and set the follow-up date 4 to 6 weeks before it. They asked you to come back, so that message is welcome
- **"We already have a printer":** thank them, say you are happy to quote whenever they want a second option, and stop
- **"No thanks", "remove me", or no reply after two follow-ups:** thank them if they replied, note it on the lead, and never contact them again
- **An upset reply:** apologise once, stop, and tell June`,
    }],
    practice: [],
    quiz: {
      key: 'leadgen-6', title: 'Module 6 quiz: follow-ups and replies', minutes: 10,
      questions: [
        { id: 'first', q: 'When does the first follow-up go?',
          choices: ['The same day', 'About 3 days after the opener', 'A month later', 'Never'],
          answer: 1, article: A.cadence, why: 'About 3 days, then about 10 days, then stop.' },
        { id: 'second', q: 'When does the second follow-up go?',
          choices: ['About 10 days after the opener', 'The next day', 'Every week after', 'After 6 months'],
          answer: 0, article: A.cadence, why: 'About 10 days after the opener.' },
        { id: 'third', q: 'No reply after two follow-ups. Next?',
          choices: ['A third, more urgent one', 'Stop', 'Call them', 'Message a different person there'],
          answer: 1, article: A.cadence, why: 'No reply after two follow-ups is an answer.' },
        { id: 'new', q: 'Which follow-up is best?',
          choices: ['"Just checking in!"', '"Navy with a gold number on the back? Happy to send a mockup and a price."', 'Your opener again, word for word', '"Last chance!"'],
          answer: 1, article: A.cadence, why: 'Each follow-up adds something new.' },
        { id: 'log', q: 'Why log every message on the lead?',
          choices: ['It is optional', 'It brings the lead back on My Day, counts toward your reply rate, and shows the whole story', 'It emails June', 'It changes the price'],
          answer: 1, article: A.cadence, why: 'An unlogged message did not happen, as far as the shop can tell.' },
        { id: 'date', q: 'After each message you also…',
          choices: ['Set the follow-up date on the lead', 'Add them to the newsletter', 'Send a text', 'Close the lead'],
          answer: 0, article: A.cadence, why: 'The follow-up date brings them back on the right day.' },
        { id: 'yes', q: 'A prospect replies "how much for 60 shirts?". This is now…',
          choices: ['A prospect still', 'A quote request: reply within the hour and ask the five details', 'Spam', 'An Account Manager\'s customer'],
          answer: 1, article: A.cadence, why: 'A price question is a lead.' },
        { id: 'later', q: '"Not this season, maybe the fall." You…',
          choices: ['Delete the lead', 'Thank them, note the fall season, and set a follow-up date 4 to 6 weeks before it', 'Follow up every week until fall', 'Offer a discount now'],
          answer: 1, article: A.cadence, why: 'They asked you to come back, so come back at the right time.' },
        { id: 'printer', q: '"We already have a printer." You…',
          choices: ['Argue on price', 'Thank them, say you are happy to quote whenever they want a second option, and stop', 'Keep following up', 'Report them'],
          answer: 1, article: A.cadence, why: 'Leave a door open, then stop.' },
        { id: 'no', q: '"Please remove me." You…',
          choices: ['Send one last offer', 'Thank them, note it on the lead, and never contact them again', 'Ignore it', 'Ask why'],
          answer: 1, article: A.cadence, why: 'Never contact anyone who has said no.' },
      ],
    },
    buffer: 7,
  },

  /* ── 7 ── */
  {
    key: 'lg7', icon: '🤝', title: 'From a reply to a quote request',
    goal: 'Turn a yes into a complete quote request, hand it over cleanly, and keep the credit straight.',
    lessons: [{
      id: 'lg7-handover', article: A.handover, minutes: 30, tags: 'quote request, five details, hand off, closer, credit, rep lead, commission',
      goals: ['Collect the five details in one message', 'Hand a quote request over with everything on the lead', 'Know when a sale is credited to you'],
      tryIt: [{ label: 'The /quote reply in the Playbook', href: '/admin/playbook?q=quote' }],
      body:
`A reply that says yes is the moment the job pays off. Answer it within the hour, like any lead, and make it easy for the quote to be right first time.

**The five details, again**

You cannot quote without these, so ask for all of them in one message (the /quote reply in the Playbook does it):

- How many pieces, and the size mix
- The garment (or the vibe and budget, and you suggest some)
- Where the design goes (front, back, sleeve) and how many colours
- Their artwork, or a description of it
- The date they need them by

Add what you already know from your research, so they do not have to repeat it: "For the 120 players starting April 6, could you tell me…"

**Handing over**

When the five details are in, the lead is ready to quote. Everything you know goes on the lead first: who decides, the date, the size mix, the artwork, and your notes.

- If a Sales Closer is on the team, they build the quote: [owner to fill in: how a quote request passes to a Closer, and whether the sale stays credited to you]
- Until then, you build the quote yourself, exactly as in the Sales course

Tell the customer who will send their quote and when: "You'll have your quote from me by 3pm today."

**Getting the credit right**

- A prospect you registered with "I found this customer" **before** they were quoted is your rep lead. It earns your commission, and so do their reorders for 12 months after your first sale to them
- A customer the shop already knew stays a shop lead, even if you found them again
- Registering after the quote is too late

When something about credit looks wrong, ask June. Never change a lead's owner yourself.`,
    }],
    practice: [
      { key: 'do:leadgen-message', type: 'do', fact: 'messages', need: 5, minutes: 10,
        title: 'Send 5 messages from the back office', hint: 'Emails or texts to customers sent from a lead or a quote count. Sent from the back office, they are logged for you. This ticks itself at 5.' },
    ],
    quiz: {
      key: 'leadgen-7', title: 'Module 7 quiz: reply to quote request', minutes: 10,
      questions: [
        { id: 'speed', q: 'A prospect says "yes, send a price". You reply…',
          choices: ['Within 1 hour during your shift', 'Tomorrow', 'When you have time', 'After two follow-ups'],
          answer: 0, article: A.handover, why: 'A yes is a lead: within the hour.' },
        { id: 'five', q: 'Which is NOT one of the five details?',
          choices: ['How many pieces and the size mix', 'Their home address', 'Where the design goes and how many colours', 'The date they need them by'],
          answer: 1, article: A.handover, why: 'Pieces and sizes, garment, placement and colours, artwork, date.' },
        { id: 'one', q: 'How do you ask for the five details?',
          choices: ['One at a time over a week', 'All in one message (the /quote reply)', 'By phone only', 'You do not ask, you guess'],
          answer: 1, article: A.handover, why: 'One message, so the customer answers once.' },
        { id: 'known', q: 'You already know the league has 120 players starting April 6. In your message you…',
          choices: ['Ask them again anyway', 'Say what you already know, and ask only for the rest', 'Leave it out', 'Promise April 6 delivery'],
          answer: 1, article: A.handover, why: 'Use your research so they do not repeat themselves.' },
        { id: 'lead', q: 'Before the quote is built, what goes on the lead?',
          choices: ['Nothing', 'Everything you know: who decides, the date, sizes, artwork, notes', 'Only the name', 'A discount'],
          answer: 1, article: A.handover, why: 'Whoever quotes starts with the whole story.' },
        { id: 'noclose', q: 'There is no Closer on the team yet. Who builds the quote?',
          choices: ['Nobody', 'You, as in the Sales course', 'The customer', 'The designer'],
          answer: 1, article: A.handover, why: 'Until every role is filled, you do all of it.' },
        { id: 'tell', q: 'What do you tell the customer once you have the five details?',
          choices: ['Nothing', 'Who will send their quote and by when', 'A guessed price', 'A delivery date'],
          answer: 1, article: A.handover, why: 'Give a time and keep it.' },
        { id: 'credit', q: 'When is a found prospect your rep lead?',
          choices: ['Whenever you talk to them', 'When you registered them with "I found this customer" before they were quoted', 'After they pay', 'Only if they order over $500'],
          answer: 1, article: A.handover, why: 'Register before the quote.' },
        { id: 'reorder', q: 'Your rep lead orders again 8 months after your first sale to them. Commission?',
          choices: ['No', 'Yes: reorders count for 12 months after your first sale', 'Half', 'Only if June agrees'],
          answer: 1, article: A.handover, why: 'Reorders from your rep lead count for 12 months.' },
        { id: 'wrong', q: 'A sale you found shows as a shop lead and you think that is wrong. You…',
          choices: ['Change the owner yourself', 'Ask June', 'Re-register it', 'Ignore it'],
          answer: 1, article: A.handover, why: 'Never change a lead\'s owner yourself.' },
      ],
    },
    buffer: 7,
  },

  /* ── 8 ── */
  {
    key: 'lg8', icon: '📈', title: 'Your day and your numbers',
    goal: 'Run a Lead Generation day in the right order, read your own numbers, and get better each week.',
    lessons: [{
      id: 'lg8-numbers', article: A.numbers, minutes: 25, tags: 'daily routine, my day, targets, reply rate, numbers, end of day note, improve',
      goals: ['Plan a day in the right order', 'Work out your own reply rate and quote rate', 'Change one thing a week and see if it works'],
      tryIt: [{ label: 'My Day', href: '/admin/my-day' }],
      body:
`A good Lead Generation day has a set order: people waiting on you first, then new prospects.

**A sample day**

- **Start on My Day.** Replies from prospects are leads: answer each within the hour
- **Follow-ups due today.** Each with something new, each logged with the next follow-up date
- **Research block.** One search (one type, one area, one date 4 to 6 weeks out). Register each prospect as you find them
- **Opener block.** Personal openers to the prospects you just registered, logged on each lead
- **Check My Day again** before you finish, so no reply waits overnight
- **End-of-day note to June:** prospects registered, openers sent, follow-ups sent, replies, quote requests, what is stuck, and your first task tomorrow

Your targets are in lesson 1 of this course.

**Your numbers**

- **Prospects registered:** how many you added as "I found this customer"
- **Openers and follow-ups sent:** every one logged
- **Reply rate:** replies divided by openers. 3 replies from 30 openers is 10%
- **Quote requests:** prospects who asked for a price
- **Quotes accepted:** the ones that became orders

If prospects are high and replies are low, look at your openers and whether you reached the person who decides. If replies are high and quote requests are low, look at what you offered as the next step.

**Getting better each week**

- Each week, look at which customer type and which opener got the most replies. Do more of what works
- Change one thing at a time (the subject line, the first line, the next step), so you can tell what made the difference
- Share what you learn with June in your end-of-day note. A good opener becomes a Playbook reply for everyone`,
    }],
    practice: [],
    quiz: {
      key: 'leadgen-8', title: 'Module 8 quiz: your day and numbers', minutes: 10,
      questions: [
        { id: 'start', q: 'What do you do first each day?',
          choices: ['Research new prospects', 'Open My Day and answer replies from prospects', 'Write openers', 'Read the news'],
          answer: 1, article: A.numbers, why: 'People waiting on you first.' },
        { id: 'order', q: 'Which order is right?',
          choices: ['Openers, research, replies', 'Replies, follow-ups due, research, openers, check My Day, end-of-day note', 'Research all day', 'End-of-day note first'],
          answer: 1, article: A.numbers, why: 'People waiting, then follow-ups, then new prospects.' },
        { id: 'rate', q: '3 replies from 30 openers is a reply rate of…',
          choices: ['3%', '10%', '30%', '90%'],
          answer: 1, article: A.numbers, why: '3 ÷ 30 = 10%.' },
        { id: 'low', q: 'Lots of prospects, very few replies. What do you look at first?',
          choices: ['Your openers, and whether you reached the person who decides', 'The quote form', 'The price list', 'Nothing, keep going'],
          answer: 0, article: A.numbers, why: 'Low replies point at the opener or the contact.' },
        { id: 'noquote', q: 'Lots of replies, few quote requests. What do you look at?',
          choices: ['Your research', 'The next step you offered', 'Your hours', 'The newsletter'],
          answer: 1, article: A.numbers, why: 'Replies that do not turn into requests point at the offer.' },
        { id: 'eod', q: 'Which goes in your end-of-day note?',
          choices: ['Only hours worked', 'Prospects, openers, follow-ups, replies, quote requests, what is stuck, and tomorrow\'s first task', 'A list of every page you visited', 'Nothing'],
          answer: 1, article: A.numbers, why: 'Counts plus what is stuck, so June starts with a list.' },
        { id: 'one', q: 'Why change one thing at a time in your openers?',
          choices: ['It is faster', 'So you can tell what made the difference', 'June requires it', 'It lowers prices'],
          answer: 1, article: A.numbers, why: 'One change at a time shows what works.' },
        { id: 'share', q: 'An opener gets twice the usual replies. You…',
          choices: ['Keep it to yourself', 'Tell June; a good opener can become a Playbook reply for everyone', 'Send it to every group', 'Stop using it'],
          answer: 1, article: A.numbers, why: 'Share what works.' },
        { id: 'night', q: 'Why check My Day again before you finish?',
          choices: ['To log off', 'So no reply waits overnight', 'To send the newsletter', 'To delete old leads'],
          answer: 1, article: A.numbers, why: 'A reply waiting overnight can go to another shop.' },
        { id: 'search', q: 'Your research block should be…',
          choices: ['One type, one area, one date 4 to 6 weeks out', 'Anything that comes up', 'Only Facebook', 'Last year\'s customers'],
          answer: 0, article: A.numbers, why: 'A focused search finds better prospects.' },
      ],
    },
    buffer: 7,
  },
];

/* The final exam: new questions across the whole course, 80% to pass. */
const FINAL = {
  floating: 15,
  quiz: {
    key: 'leadgen-final', title: 'Final exam: Lead Generation', minutes: 25,
    questions: [
      { id: 'f1', q: 'It is mid-March. Which search is best today?',
        choices: ['Holiday staff gifts', 'Schools with field day or graduation in late April and May', 'Back-to-school PTOs', 'Fall festivals'], answer: 1, article: A.calendar, why: '4 to 6 weeks out from mid-March is late April to May.' },
      { id: 'f2', q: 'It is early November. Which group is in its window?',
        choices: ['Spring sports', 'Winter sports and holiday staff gifts', 'Graduation', 'Summer camps'], answer: 1, article: A.calendar, why: 'October to December: runs, festivals, holiday gifts, winter sports.' },
      { id: 'f3', q: 'A church\'s site lists a youth retreat in 5 weeks. Who do you look for?',
        choices: ['The youth pastor or whoever runs the retreat', 'A member', 'The building owner', 'Nobody'], answer: 0, article: A.decider, why: 'The person running the event decides.' },
      { id: 'f4', q: 'A new coffee shop had its ribbon cutting last week. Best template?',
        choices: ['New business', 'Family reunion', 'League uniforms', 'Graduation'], answer: 0, article: A.openers, why: 'An opening: staff shirts and signs.' },
      { id: 'f5', q: 'You find a league coordinator\'s email on the board page. Steps, in order?',
        choices: ['Email, then register', 'Register on Leads as "I found this customer" with the link and why now, then a personal opener, then set a follow-up date', 'Text them', 'Add them to the newsletter'], answer: 1, article: A.research, why: 'Register first, then write, then follow-up date.' },
      { id: 'f6', q: 'Which detail belongs in the first line of an opener?',
        choices: ['Our address', 'Something only true of them: their season start, event or news', 'Our prices', 'A discount code'], answer: 1, article: A.openers, why: 'The first line should be about them.' },
      { id: 'f7', q: 'Your opener is 140 words with a price list link. Fix it how?',
        choices: ['Add more products', 'Cut it under 70 words, drop the link, end with one easy next step', 'Add an attachment', 'Send it twice'], answer: 1, article: A.openers, why: 'Short, personal, one next step.' },
      { id: 'f8', q: 'Day 3, no reply. Your follow-up says…',
        choices: ['"Just checking in"', 'Something new: a design idea or a photo of similar work', 'The opener again', '"Why haven\'t you answered?"'], answer: 1, article: A.cadence, why: 'Each follow-up adds something new.' },
      { id: 'f9', q: 'Day 10, second follow-up sent. Day 20, no reply. Next?',
        choices: ['A third follow-up', 'Stop, and note it on the lead', 'Call', 'DM a different person there'], answer: 1, article: A.cadence, why: 'Two follow-ups at most.' },
      { id: 'f10', q: 'A prospect replies "next spring". You set the follow-up date for…',
        choices: ['Tomorrow', '4 to 6 weeks before spring starts', 'Next week', 'Never'], answer: 1, article: A.cadence, why: 'Come back while they are deciding.' },
      { id: 'f11', q: 'You emailed a prospect from your own inbox and did not log it. On the lead…',
        choices: ['It shows anyway', 'Nothing shows: it does not count and the lead will not come back on time', 'June sees it', 'It counts double'], answer: 1, article: A.cadence, why: 'A message you did not log did not happen, as far as the shop can tell.' },
      { id: 'f12', q: 'Which contact may you use for a prospect?',
        choices: ['A guessed personal email', 'A contact the group publishes for questions like this', 'A bought list', 'A mobile number from a directory'], answer: 1, article: A.decider, why: 'Published contacts only, and never a phone.' },
      { id: 'f13', q: 'Only a general inbox is listed. Your opener starts…',
        choices: ['"Dear Sir"', '"Hi! I\'m hoping to reach whoever looks after spirit wear at Lincoln Elementary."', '"To whom it may concern, buy now"', 'With a price'], answer: 1, article: A.decider, why: 'Address the role and ask for the right person.' },
      { id: 'f14', q: 'A Facebook group bans selling. A fun run is announced there with the organiser named. You…',
        choices: ['Post in the group anyway', 'Message the organiser directly', 'Comment under the post with prices', 'Skip it'], answer: 1, article: A.research, why: 'Respect the group\'s rules; write to the organiser.' },
      { id: 'f15', q: 'Which Maps result is worth registering?',
        choices: ['A dance studio with recent reviews, photos and a recital date on its site', 'A listing marked permanently closed', 'A page with no reviews since 2019', 'A school in another state'], answer: 0, article: A.research, why: 'Alive, local, with a date.' },
      { id: 'f16', q: 'The "What they asked for" box on a found prospect should say…',
        choices: ['"Shirts"', 'Why now and the date: "Recital May 18, about 60 dancers, owner listed on the site"', 'Nothing', 'Our prices'], answer: 1, article: A.research, why: 'The reason and the date.' },
      { id: 'f17', q: 'A prospect writes back "how much for hoodies?". You…',
        choices: ['Send the cheapest hoodie price', 'Thank them and ask the five details in one message, within the hour', 'Wait for the Closer', 'Ignore it until they send more'], answer: 1, article: A.handover, why: 'A price question is a lead: the five details, fast.' },
      { id: 'f18', q: 'You registered a league after June had already quoted them. Whose lead is it?',
        choices: ['Yours', 'A shop lead: register before the quote', 'Shared', 'Nobody\'s'], answer: 1, article: A.handover, why: 'Registering after the quote is too late, and the shop already knew them.' },
      { id: 'f19', q: 'Your rep lead reorders 14 months after your first sale to them. Commission on the reorder?',
        choices: ['Yes', 'No: reorders count for 12 months after your first sale', 'Half', 'Double'], answer: 1, article: A.handover, why: 'The 12-month window has passed.' },
      { id: 'f20', q: 'A prospect asks if you can guarantee shirts by their event in 10 days. You…',
        choices: ['Promise it', 'Say you will check the production board and June, and reply by a set time', 'Say no', 'Offer free rush'], answer: 1, article: A.job, why: 'Dates are June\'s; give a time and keep it.' },
      { id: 'f21', q: 'A prospect wants the Chicago Cubs logo on 80 shirts. You…',
        choices: ['Quote it', 'Bring it to June and suggest an original design on the theme', 'Redraw it a little', 'Use DTF so it is fine'], answer: 1, article: A.job, why: 'Logos the customer does not own go to June.' },
      { id: 'f22', q: 'Which is never allowed?',
        choices: ['A personal email to a published contact', 'A DM to an organiser', 'Adding a prospect to the newsletter', 'Logging a message'], answer: 2, article: A.job, why: 'Only people who signed up get the newsletter.' },
      { id: 'f23', q: 'You sent 40 openers this week and got 6 replies. Reply rate?',
        choices: ['6%', '15%', '40%', '24%'], answer: 1, article: A.numbers, why: '6 ÷ 40 = 15%.' },
      { id: 'f24', q: 'Many replies say "not now". What does that tell you?',
        choices: ['Your openers are bad', 'You may be reaching them too late or too early: check the 4 to 6 week timing', 'Stop prospecting', 'Offer discounts'], answer: 1, article: A.calendar, why: 'Timing drives "not now".' },
      { id: 'f25', q: 'You want to test a new subject line. You…',
        choices: ['Change the subject, first line and next step together', 'Change only the subject line and compare replies', 'Change nothing', 'Ask the prospects which they prefer'], answer: 1, article: A.numbers, why: 'One change at a time.' },
      { id: 'f26', q: 'A business replies "we already use another printer". You…',
        choices: ['Undercut their price', 'Thank them, offer to quote whenever they want a second option, and stop', 'Follow up weekly', 'Ask who it is'], answer: 1, article: A.cadence, why: 'Leave a door open, then stop.' },
      { id: 'f27', q: 'A prospect replies angrily that they never asked to be contacted. You…',
        choices: ['Argue', 'Apologise once, stop, note it, and tell June', 'Send a discount', 'Ignore it'], answer: 1, article: A.cadence, why: 'Apologise, stop, tell June.' },
      { id: 'f28', q: 'A league\'s fan shirts for one team are chosen by…',
        choices: ['The league board', 'That team\'s coach', 'The referee', 'The city'], answer: 1, article: A.decider, why: 'Fan shirts: the team\'s coach.' },
      { id: 'f29', q: 'A charity walk wants volunteer shirts. Which upsell fits naturally?',
        choices: ['Sponsors on the back, and a start-line banner', 'Embroidered jackets', 'Cutouts of every walker', 'Nothing'], answer: 0, article: A.calendar, why: 'Events often carry sponsors and need banners.' },
      { id: 'f30', q: 'Which part of the day comes before research?',
        choices: ['Answering replies and sending follow-ups due', 'The end-of-day note', 'Lunch', 'Nothing'], answer: 0, article: A.numbers, why: 'People waiting on you first.' },
      { id: 'f31', q: 'Before you hand a quote request over, the lead must have…',
        choices: ['Only the name', 'Who decides, the date, sizes, artwork and your notes', 'A discount', 'A delivery date'], answer: 1, article: A.handover, why: 'Whoever quotes starts with the whole story.' },
      { id: 'f32', q: 'You send a template without changing the first line. The risk?',
        choices: ['None', 'It reads like an ad, and replies drop', 'It costs money', 'It breaks the system'], answer: 1, article: A.openers, why: 'A template is a starting point, never the message.' },
      { id: 'f33', q: 'Which opener is best for a PTO?',
        choices: ['"Need shirts? We\'re the best!"', '"Hi Maria, I saw Lincoln Elementary\'s spirit week is on May 2. We make spirit wear for Chicago PTOs. Want a couple of design ideas and a price? — Christine, June\'s Tees"', 'Our price list', '"Order by Friday for 20% off"'], answer: 1, article: A.openers, why: 'Name, detail, what we do, one easy step.' },
      { id: 'f34', q: 'Where do past customers who are due a reorder belong?',
        choices: ['To Lead Generation', 'To the Account Manager', 'To nobody', 'To the newsletter'], answer: 1, article: A.job, why: 'Past customers are the Account Manager\'s.' },
      { id: 'f35', q: 'A teammate registered the same new studio an hour before you. Whose is it?',
        choices: ['Yours, you wrote first', 'Theirs: the first one registered wins', 'Split', 'June\'s'], answer: 1, article: A.research, why: 'The first registration wins.' },
      { id: 'f36', q: 'A Maps listing shows a phone number and no email or page. You…',
        choices: ['Text it', 'Call it', 'Look for their website, page or event listing for a published email or message button; if none, move on', 'Guess an email'], answer: 2, article: A.decider, why: 'Email or DM only, from a published contact.' },
      { id: 'f37', q: 'What makes a follow-up welcome rather than spam?',
        choices: ['Capital letters', 'It adds something useful, is short, and stops after two', 'It is sent daily', 'It repeats the opener'], answer: 1, article: A.cadence, why: 'Something new, short, and at most two.' },
      { id: 'f38', q: 'What is the most important number for the shop?',
        choices: ['Pages browsed', 'Prospects that reach a quote', 'Hours logged', 'Groups joined'], answer: 1, article: A.job, why: 'The pipeline matters because it leads to quotes.' },
      { id: 'f39', q: 'You promised a quote "by 3pm today". At 2:45 it is not ready. You…',
        choices: ['Say nothing', 'Message the customer before 3pm with an update and a new time', 'Send a guessed price', 'Wait until tomorrow'], answer: 1, article: A.handover, why: 'Give a time and keep it, even when the answer is "still working on it".' },
      { id: 'f40', q: 'Who reviews your first five openers?',
        choices: ['June', 'The Closer', 'Nobody', 'The prospect'], answer: 0, article: A.openers, why: 'June signs off your first openers.' },
    ],
  },
  signoffs: [
    { key: 'signoff:leadgen-ready', type: 'signoff', minutes: 0,
      title: 'Ready to prospect on their own', hint: 'June signs this off after reading a week of openers and seeing prospects reach quote requests.' },
  ],
};

/* Photos for each lesson, from the shop's own work. Its pages and their
   questions are in sales-leadgen-pages.js. */
const W = (f) => `/assets/images/work/${f}.jpg`;
const LESSON_EXTRAS = {
  'lg1-job': { images: [{ src: W('storefront-lincoln-ave'), alt: 'The June\'s Tees shop on Lincoln Avenue' }] },
  'lg2-calendar': { images: [{ src: W('kindergarten-back-to-school-tee'), alt: 'A back-to-school class shirt' }, { src: W('family-reunion-bulk-order'), alt: 'A family reunion order' }] },
  'lg3-research': { images: [{ src: W('youth-team-shirts'), alt: 'A youth team in their custom shirts' }] },
  'lg4-decider': { images: [{ src: W('barber-business-shirts'), alt: 'Staff shirts for a local business' }] },
  'lg5-openers': { images: [{ src: W('full-color-team-logo-print'), alt: 'A team logo print: the kind of idea an opener offers' }] },
  'lg6-cadence': { images: [{ src: W('custom-printed-banner'), alt: 'A custom banner: something new to show in a follow-up' }] },
  'lg7-handover': { images: [{ src: W('company-zip-hoodies'), alt: 'Company hoodies, quoted from a complete request' }] },
  'lg8-numbers': { images: [{ src: W('corporate-anniversary-shirts'), alt: 'Anniversary shirts for a business' }] },
};
const PAGES = require('./sales-leadgen-pages');
for (const l of MODULES.flatMap((m) => m.lessons)) {
  Object.assign(l, LESSON_EXTRAS[l.id] || {});
  l.pages = PAGES[l.id] || [{ from: null, checks: [] }];
  l.checks = l.pages.flatMap((pg) => pg.checks);
}

module.exports = { key: 'sales-leadgen', title: 'Lead Generation', track: 'sales', articles: A, glossary: GLOSSARY, modules: MODULES, final: FINAL };
