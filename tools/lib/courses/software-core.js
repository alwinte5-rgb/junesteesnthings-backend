'use strict';

/* The Software sales course: the eight hours the software sales agent walks
   before selling on their own (owner, 2026-10-16). They sell the TOP plans of
   the owner's own apps (COS Creator Studio Agency first) to agencies and teams,
   through personal outreach, short demos, free trials and follow-up. The low
   end of the market is won with ads, not agents.

   What the course teaches comes from what is already decided or built: the
   software sales hiring test (tools/lib/hiring-software.js), whose model
   answers are the standard we hired against; COS's plans as the code sells
   them (cos-plus-saas app/tier_limits.py: Agency $129 a month or $1,290 a
   year, 5 seats with client roles, white label, 12 non-Meta connections, AI
   visuals and video); the agent's pay (10% of a new customer's payments for
   their first 6 months); and the approved offers (free plan, 14-day free
   trial, yearly plan). Anything only the owner knows is written
   "[owner to fill in: ...]", which the Training page's "Playbook gaps" card
   asks her for. */

const TEAM = require('./shared-team');

const A = {
  apps:       'Software sales course 2a: Our apps and their top plans',
  buyer:      'Software sales course 2b: Who buys, and why',
  find:       'Software sales course 3a: Finding agencies worth contacting',
  tracker:    'Software sales course 3b: The software leads board',
  first:      'Software sales course 4a: The first message',
  followup:   'Software sales course 4b: Following up without nagging',
  discovery:  'Software sales course 5a: Discovery: questions before the pitch',
  demo:       'Software sales course 5b: The 15-minute demo',
  objections: 'Software sales course 6a: Objections',
  offers:     'Software sales course 6b: What you may offer, and what is June\'s',
  trial:      'Software sales course 7a: From free trial to paying customer',
  handoff:    'Software sales course 7b: Setup help and handing over',
  pay:        'Software sales course 8a: How you are paid',
  report:     'Software sales course 8b: Rules, data and your weekly report',
};

const GLOSSARY = {
  'agency plan': 'COS Creator Studio\'s top plan: $129 a month or $1,290 a year, made for people posting for several client brands.',
  'seat': 'One person\'s login inside a COS account. Agency includes 5.',
  'white label': 'The agency\'s own name and logo shown inside COS to their team and clients, instead of ours.',
  'non-meta': 'Platforms other than Facebook, Instagram and Threads: TikTok, YouTube, LinkedIn, Pinterest, X and Google Business Profile.',
  'discovery': 'The questions you ask before showing anything, to learn what the prospect actually needs.',
  'trial': 'A free 14-day period on a paid plan. The customer starts paying after it unless they cancel.',
  'churn': 'Customers cancelling. A customer who cancels in month two earns little; one who stays earns every month.',
  'prospect': 'A person or business you think could buy, who has not bought yet.',
};

const MODULES = [
  /* ── 1 ── */
  TEAM.MODULE,

  /* ── 2 ── */
  {
    key: 'w2', icon: '🧭', title: 'Our apps, and who buys the top plans',
    goal: 'Know each app, its top plan and its price, and which customers get the most from it.',
    lessons: [{
      id: 'w2-apps', article: A.apps, minutes: 20, tags: 'software sales, cos creator studio, agency plan, cartbook, business dashboard, prices',
      goals: ['Explain COS Creator Studio in two sentences', 'Know what the Agency plan includes and costs', 'Know what CartBook and the business dashboard are for'],
      body:
`We build our own software. Your job is to sell the top plans to the customers who get the most from them. Smaller customers find us through ads, so you spend your time where one sale is worth the most.

**COS Creator Studio**

COS plans and posts social media for a business. It writes captions in the brand's voice, makes graphics and short AI videos, and publishes to Facebook, Instagram, Threads, TikTok, YouTube, LinkedIn, Pinterest, X and Google Business Profile on a schedule. It also has analytics and an inbox for comments and messages.

In two sentences: "COS plans a month of posts for each brand in one sitting and publishes them for you. It writes the captions and makes the graphics and videos, so posting stops being the thing that slips."

**The Agency plan: what you sell**

Agency is $129 a month, or $1,290 a year (two months free). It is made for people posting for several brands:

- Unlimited posts, and up to 150 content plans a month across every client brand
- 5 seats: logins for their team, with roles (owner, admin, editor, client), so they can invite a client to review their own brand
- White label: their own name and logo inside the app, so their clients see the agency, not us
- Up to 12 connections to platforms other than Facebook, Instagram and Threads (those three are unlimited)
- 100 AI graphics and 60 AI videos (up to 2 minutes) a month, plus X posting included

The cheaper plans (Starter $19, Pro $49) exist, but they are for single businesses who come from ads. If a prospect only runs one small brand, send them to the website and spend your time on the next agency.

**CartBook and the business dashboard**

CartBook turns a food creator's recipes into a cookbook app their followers subscribe to. Its top creator plan is Pro, $19.99 a month, for creators who sell their cookbooks. Ask June whether CartBook creator plans are open for sign-up before you offer it. Until she says so, sell COS.

The business dashboard runs a service business: bookings, quotes and payments, team and jobs, and a website. Its Everything package is for contractors and salons with teams. June sets the Everything price and its setup fee: check the current price with her before you quote it.`,
    }, {
      id: 'w2-buyer', article: A.buyer, minutes: 20, tags: 'software sales, ideal customer, agency, freelancer, multi-location, fit',
      goals: ['Spot a good-fit prospect in a minute', 'Know the problem the Agency plan solves', 'Walk away from a poor fit politely'],
      body:
`One good-fit agency is worth more than twenty poor fits. A customer who fits uses the app every week and stays. One who does not cancels in a month, and your commission goes with them.

**Who buys Agency**

- Social media and marketing agencies posting for 5 or more client brands
- Freelancers managing several clients on their own
- Businesses with several locations or brands, each needing its own posts
- Web design or branding studios that also post for their clients

**The problem they have**

Posting for many brands is slow. Every client means logging in and out, writing captions in a different voice, making graphics, and chasing approval. The hours go on Mondays and late evenings, and they cannot take more clients without hiring.

What COS changes: one place for every brand, captions written in each brand's voice, graphics and videos made for them, clients approving inside the app, and posts that go out on time.

**Signs of a good fit**

- They list several clients on their website, LinkedIn or portfolio
- They post for clients on more than one platform
- They talk about time, workload or hiring
- They already pay for a tool (Later, Hootsuite, Buffer, Sprout): they buy software, and switching is a real conversation

**Signs to move on**

- One small business posting for itself: point them to the website and the free plan
- No social media work at all
- They want something COS does not do. Say so honestly and pass the request to June

Moving on politely is part of the job: "Sounds like the free plan on our site is the right start for you. Here's the link, and I'm here if you grow into more brands."`,
    }],
    practice: [],
    quiz: {
      key: 'software-2', title: 'Module 2 quiz: our apps, and who buys the top plans', minutes: 8,
      questions: [
        { id: 'price', q: 'What does the COS Agency plan cost?',
          choices: ['$19 a month', '$129 a month, or $1,290 a year', '$49 a month', '$129 a year'],
          answer: 1, article: A.apps, why: 'Agency is $129 a month; yearly is $1,290, two months free.' },
        { id: 'seats', q: 'How many seats does Agency include?',
          choices: ['1', '5', 'Unlimited', '2'],
          answer: 1, article: A.apps, why: '5 seats, with owner, admin, editor and client roles.' },
        { id: 'white', q: 'What does white label mean in COS?',
          choices: ['The app turns white', 'The agency\'s own name and logo inside the app', 'No logos on posts', 'A free plan'],
          answer: 1, article: A.apps, why: 'Their team and clients see the agency\'s brand, not ours.' },
        { id: 'meta', q: 'Which platforms are unlimited on Agency?',
          choices: ['TikTok and YouTube', 'Facebook, Instagram and Threads', 'LinkedIn only', 'None'],
          answer: 1, article: A.apps, why: 'The Meta three are unlimited; other platforms up to 12 connections.' },
        { id: 'who', q: 'Which prospect fits the Agency plan best?',
          choices: ['A café posting for itself', 'A freelancer posting for 8 client brands', 'Someone with no social media', 'A student'],
          answer: 1, article: A.buyer, why: 'Agency is for people posting for several brands.' },
        { id: 'small', q: 'A single small shop wants COS. You…',
          choices: ['Spend an hour on a demo', 'Point them to the website and the free plan, politely', 'Ignore them', 'Offer Agency at half price'],
          answer: 1, article: A.buyer, why: 'Small businesses come from ads; your time goes to agencies.' },
        { id: 'problem', q: 'The main problem COS solves for an agency is…',
          choices: ['Printing shirts', 'Hours lost posting for many brands', 'Accounting', 'Website hosting'],
          answer: 1, article: A.buyer, why: 'One place for every brand, captions, graphics and on-time posts.' },
        { id: 'signal', q: 'Which is a sign of a good fit?',
          choices: ['They list several clients on their website', 'They have no website', 'They post once a year', 'They want a printing quote'],
          answer: 0, article: A.buyer, why: 'Several clients means the Agency plan saves real time.' },
        { id: 'tool', q: 'A prospect already pays for Hootsuite. That means…',
          choices: ['Give up', 'They buy software: switching is a real conversation', 'They cannot use COS', 'Offer a discount at once'],
          answer: 1, article: A.buyer, why: 'Paying for a tool shows the need and the budget.' },
        { id: 'missing', q: 'A prospect wants a feature COS does not have. You…',
          choices: ['Say it is coming next week', 'Say so honestly and pass the request to June', 'Say yes', 'Change the subject'],
          answer: 1, article: A.buyer, why: 'Honest answers; requests go to June.' },
      ],
    },
    buffer: 6,
  },

  /* ── 3 ── */
  {
    key: 'w3', icon: '🔎', title: 'Finding agencies, and tracking every lead',
    goal: 'Build a list of good-fit agencies from real sources, and keep every lead on the board.',
    lessons: [{
      id: 'w3-find', article: A.find, minutes: 20, tags: 'software sales, prospecting, linkedin, clutch, directories, facebook groups, research',
      goals: ['Know where agencies can be found', 'Research one detail before contacting anyone', 'Avoid bought lists and scraping'],
      body:
`Good prospects come from looking, not from lists. You find agencies where they show their work, read a little about each one, and write down one real detail before you contact them.

**Where to look**

- LinkedIn: search "social media agency" or "social media manager" with a city or state. Founders often post about workload and clients
- Clutch, UpCity and Google Maps: agency directories with client lists and reviews
- Facebook groups for social media managers and agency owners: read and help first, never spam the group
- Instagram: agencies show client work on their own pages
- Our own leads: people on the free plan who post for more than one brand. June shares these with you when she has them

**What to write down for each one**

Before you contact anyone, note on the leads board:

- Name, company and where you found them
- How many clients they seem to have, and what kind
- One real detail you can mention: a recent post, a client, a hiring ad, a complaint about workload
- Which platforms they post on

That detail is what makes your first message personal. Without it, do not send one.

**What we never do**

- Buy email lists or scrape addresses. It is spam, it breaks the law in many places, and it gets our domain blocked
- Add people to a newsletter without asking
- Use automation tools that send messages or connection requests for you. LinkedIn bans accounts for it
- Pretend to be a customer or hide that you sell COS

**How many**

Quality first. A good day is 15 to 25 researched prospects contacted, not 200 copied messages. The numbers that matter are replies, demos and trials.`,
    }, {
      id: 'w3-tracker', article: A.tracker, minutes: 20, tags: 'software sales, leads board, tracker, status, next step, follow-up date',
      goals: ['Log every prospect and every contact', 'Keep a next step and date on every open lead', 'Read your own numbers from the board'],
      body:
`If it is not on the board, it did not happen. The board is how you remember who to follow up, how June sees your work, and how a sale is credited to you.

**What every lead has**

- Company, contact name, where you found them and your one detail
- Product and plan you are aiming for (usually COS Agency)
- Status: new, contacted, replied, demo booked, trial, won or lost
- Next step and its date. Every open lead has one
- Notes from every message and call, with the date

All of this lives on **Software leads** in the back office (in the menu under Sales). Add each prospect there with the link where you found them and your one detail, and log every message and call on the lead. Its **Find leads with AI** button searches the web for people who post for several brands; check each result before you add it. A lead counts once a contact is logged.

**Statuses, in order**

- **New:** researched, not contacted yet
- **Contacted:** first message sent
- **Replied:** they answered, yes or no
- **Demo booked:** a time is agreed and on your calendar
- **Trial:** they started the 14-day free trial
- **Won:** they paid. Note the plan and monthly or yearly
- **Lost:** they said no, or went quiet after your last follow-up. Write why

**Your daily routine**

- Start with every lead whose next-step date is today or earlier
- Then new research and first messages
- End by setting a next step and date on every lead you touched

**Your numbers**

Each Friday, count from the board: messages sent, replies, demos, trials started, customers won. Those numbers go in your weekly report (module 8) and show what to change.`,
    }],
    practice: [
      { key: 'signoff:software-list', type: 'signoff', minutes: 5,
        title: 'Builds a researched prospect list', hint: 'Show June 20 good-fit agencies on the leads board, each with where you found them, client count and one real detail.' },
    ],
    quiz: {
      key: 'software-3', title: 'Module 3 quiz: finding agencies, and tracking every lead', minutes: 8,
      questions: [
        { id: 'where', q: 'Which is a good place to find agencies?',
          choices: ['A bought email list', 'Clutch and LinkedIn', 'Random phone numbers', 'Scraped addresses'],
          answer: 1, article: A.find, why: 'Directories and LinkedIn show real agencies and their clients.' },
        { id: 'detail', q: 'Before contacting a prospect you write down…',
          choices: ['Nothing', 'One real detail you can mention', 'Their home address', 'Their password'],
          answer: 1, article: A.find, why: 'The detail makes the first message personal.' },
        { id: 'list', q: 'Someone offers you 5,000 agency emails for $50. You…',
          choices: ['Buy them', 'Say no: bought lists are spam and get us blocked', 'Buy half', 'Ask a friend to buy them'],
          answer: 1, article: A.find, why: 'We never buy or scrape lists.' },
        { id: 'bot', q: 'A tool can send 300 LinkedIn requests a day for you. You…',
          choices: ['Use it', 'Do not: LinkedIn bans accounts for automation', 'Use it at night', 'Use it on weekends'],
          answer: 1, article: A.find, why: 'No automation that sends messages for you.' },
        { id: 'day', q: 'A good day of new outreach is about…',
          choices: ['200 copied messages', '15 to 25 researched prospects', '1 message', 'None'],
          answer: 1, article: A.find, why: 'Quality first; replies and demos matter.' },
        { id: 'board', q: 'If a contact is not on the leads board…',
          choices: ['It still counts', 'It did not happen: log it', 'June will guess', 'It is private'],
          answer: 1, article: A.tracker, why: 'The board is memory, proof and credit.' },
        { id: 'next', q: 'Every open lead must have…',
          choices: ['A discount', 'A next step and a date', 'A phone call every day', 'Nothing'],
          answer: 1, article: A.tracker, why: 'Next step and date on every open lead.' },
        { id: 'trial', q: 'A prospect starts the free trial. Their status becomes…',
          choices: ['Won', 'Trial', 'Lost', 'New'],
          answer: 1, article: A.tracker, why: 'Won only once they pay.' },
        { id: 'start', q: 'Your day starts with…',
          choices: ['New research', 'Leads whose next-step date is today or earlier', 'Social media', 'The report'],
          answer: 1, article: A.tracker, why: 'Follow-ups first, then new outreach.' },
        { id: 'lost', q: 'A lead says no. You…',
          choices: ['Delete it', 'Mark it lost and write why', 'Keep messaging', 'Mark it won'],
          answer: 1, article: A.tracker, why: 'Why we lose teaches us what to change.' },
      ],
    },
    buffer: 6,
  },

  /* ── 4 ── */
  {
    key: 'w4', icon: '✉️', title: 'First messages and follow-ups',
    goal: 'Write short, personal first messages that get replies, and follow up without nagging.',
    lessons: [{
      id: 'w4-first', article: A.first, minutes: 20, tags: 'software sales, first message, outreach, linkedin, email, personal, template',
      goals: ['Write a first message under 80 words', 'Lead with their problem, not our features', 'End with one easy question'],
      body:
`A first message has one job: get a reply. Not a sale, not a demo, a reply.

**The shape**

1. Their detail: one real thing about them, so they know it is not a copy
2. Their problem, in their words: time, workload, too many logins
3. One line on what COS does about it
4. One easy question: a 15-minute look, or the free trial

Under 80 words. No feature list, no prices, no attachments.

**An example**

"Hi Dana, your post about scheduling eating your Mondays stuck with me. With 12 clients across dentists, gyms and restaurants, that's a lot of logging in and out. COS Creator Studio lets your team plan every client's month in one place, with captions and graphics drafted for each brand. Would it be worth 15 minutes to see if it could give you your Mondays back?"

**What goes wrong**

- Starting with us: "We are a leading AI platform…" They stop reading
- Long messages: if it scrolls, it is too long
- Two questions: they answer neither
- Fake familiarity: "Hope you're well, friend!" from a stranger
- Promises we cannot keep: "double your clients", "never post again"

**Email rules**

Business email is allowed, with conditions: say who you are and that you work with COS Creator Studio, use your real name, no misleading subject lines, and stop when someone asks you to. Add one line at the end: "If this isn't relevant, just say so and I won't follow up."

**Where to send it**

Where they are most active: LinkedIn message if they post there, email from their website, or Instagram DM if that is where they show work. One channel at a time, not all three at once.`,
    }, {
      id: 'w4-followup', article: A.followup, minutes: 20, tags: 'software sales, follow-up, cadence, reminder, no reply, polite',
      goals: ['Follow up three times, spaced out', 'Add something useful each time', 'Close the loop politely'],
      body:
`Most replies come after the first message, not to it. Most people are busy, not uninterested. A polite, useful follow-up is part of the service.

**The schedule**

- **Day 3:** a short nudge with something new: a one-line idea for their kind of client, or a short video of COS doing that
- **Day 7:** a different angle: the trial, or what another agency type does with it
- **Day 14:** the last one, closing the loop kindly
- Then mark the lead lost with a note, and a reminder to check back in 3 months if they seemed a good fit

**Each follow-up adds something**

"Just checking in" gives them nothing. Instead:

"Hi Dana, one more thought: for your restaurant clients, COS can turn a menu photo into a week of posts, captions included. Happy to show you in 15 minutes, or you can try it free for 14 days."

**The last message**

"Hi Dana, I don't want to fill your inbox, so this is my last note. If giving your team back some Monday hours becomes a priority, just reply and I'll set it up. Good luck with the new clients!"

People often reply to this one. Either way, you leave a good impression.

**After a demo**

A different schedule: a recap within one working day (what they said they needed, what you showed, the next step), then day 3 and day 7. Never more than three without a reply.

**When they say no**

Thank them, mark the lead lost with the reason, and stop. Never argue with a no.`,
    }],
    practice: [],
    quiz: {
      key: 'software-4', title: 'Module 4 quiz: first messages and follow-ups', minutes: 8,
      questions: [
        { id: 'job', q: 'The job of a first message is…',
          choices: ['To close the sale', 'To get a reply', 'To list every feature', 'To send prices'],
          answer: 1, article: A.first, why: 'A reply first; the sale comes later.' },
        { id: 'length', q: 'A first message should be…',
          choices: ['Under 80 words', 'Two pages', 'A video only', 'A price list'],
          answer: 0, article: A.first, why: 'If it scrolls, it is too long.' },
        { id: 'start', q: 'The best first line is…',
          choices: ['"We are a leading AI platform"', 'A real detail about them', '"Dear Sir/Madam"', 'Our prices'],
          answer: 1, article: A.first, why: 'Their detail shows it is not a copy.' },
        { id: 'ask', q: 'How many questions does a first message ask?',
          choices: ['One easy one', 'Five', 'None', 'Three'],
          answer: 0, article: A.first, why: 'Two questions get neither answered.' },
        { id: 'promise', q: 'Which line may you write?',
          choices: ['"COS will double your clients"', '"COS drafts captions and graphics for each brand"', '"You will never post again"', '"Guaranteed sales"'],
          answer: 1, article: A.first, why: 'Only what COS really does.' },
        { id: 'email', q: 'In a business email you must…',
          choices: ['Hide who you work for', 'Say who you are and stop when asked', 'Use a fake name', 'Use a misleading subject'],
          answer: 1, article: A.first, why: 'Honest sender, honest subject, stop on request.' },
        { id: 'checkin', q: 'Which follow-up is better?',
          choices: ['"Just checking in"', 'A one-line idea for their kind of client', 'The first message again', 'A discount'],
          answer: 1, article: A.followup, why: 'Each follow-up adds something useful.' },
        { id: 'count', q: 'With no reply, how many follow-ups do you send?',
          choices: ['Three, then close the loop', 'Every day until they answer', 'None', 'Ten'],
          answer: 0, article: A.followup, why: 'Day 3, day 7, day 14, then stop.' },
        { id: 'recap', q: 'After a demo, the recap goes out…',
          choices: ['Within one working day', 'After a month', 'Never', 'Only if they ask'],
          answer: 0, article: A.followup, why: 'While the demo is fresh.' },
        { id: 'no', q: 'A prospect says "no thanks". You…',
          choices: ['Argue', 'Thank them, mark lost with the reason, and stop', 'Offer 50% off', 'Message their colleague'],
          answer: 1, article: A.followup, why: 'Never argue with a no.' },
      ],
    },
    buffer: 6,
  },

  /* ── 5 ── */
  {
    key: 'w5', icon: '🎥', title: 'Discovery and the demo',
    goal: 'Ask before you show, then run a focused 15-minute demo that ends with a clear next step.',
    lessons: [{
      id: 'w5-discovery', article: A.discovery, minutes: 20, tags: 'software sales, discovery, questions, needs, listening',
      goals: ['Ask the five discovery questions', 'Listen for the problem worth solving', 'Know when COS is not the answer'],
      body:
`People buy a fix for their own problem, not a list of features. Discovery is how you find the problem. It takes the first five minutes of every call.

**The five questions**

1. "How many brands or clients do you post for, and on which platforms?"
2. "Walk me through how a week of posting works for you now."
3. "Where does the time go? What's the part you'd most like to hand off?"
4. "What do you use today, and what do you like or not like about it?"
5. "If this worked, what would change for you? More clients, fewer evenings, less hiring?"

**Listen more than you talk**

Write down their words. Use them later: "You said captions for 12 brands take your Mondays. Let me show you that part."

Ask "tell me more" when something sounds important. Do not jump in with features while they talk.

**What you are listening for**

- **Volume:** how many brands and posts. More brands, more value from Agency
- **Pain:** time, missed posts, client approvals, inconsistent quality
- **Current tool and cost:** what they pay today, and what annoys them
- **Who decides:** the founder, a partner, or a team lead. If it is not the person on the call, ask how they decide and offer to show both

**When COS is not the answer**

If they post for one brand, need a feature we do not have, or really need an ad agency rather than a tool, say so. "Honestly, COS isn't the right fit for that." Point them somewhere useful if you can. An honest no builds the trust that gets referrals.`,
    }, {
      id: 'w5-demo', article: A.demo, minutes: 20, tags: 'software sales, demo, screen share, demo account, booking page, next step',
      goals: ['Run a 15-minute demo from the demo account', 'Show only what solves their problem', 'End every demo with a next step'],
      body:
`A demo is 15 minutes: 5 of questions, 8 of showing, 2 of next steps. Book it on your booking page once June has set one up for you (until then, agree a time in your messages and send a Google Meet invite). Either way, mark the lead "Demo booked" on the board the same day, because the board is how the lead is credited to you.

**Before the call**

- Re-read your notes and their detail
- Sign in to the demo account, never a customer's. June shares its login with you once, from Resources: keep it safe and never share it
- Pick the two or three things you will show, based on what they told you
- Close other tabs and silence notifications: you will share your screen

**The order**

1. **Questions (5 min):** the five discovery questions if they were not answered before
2. **Show their problem being solved (8 min):** usually:
   - Several client brands side by side, each with its own voice
   - A month of posts planned for one brand in a few clicks, captions written
   - Graphics or a short video made for a post
   - A client invited on a seat to approve, and the agency's own logo (white label)
3. **Next step (2 min):** ask directly: "Would you like to try it with two of your clients for 14 days?"

**What not to do**

- Show every feature. Show only what solves what they said
- Read the pricing page. Say the price plainly when it matters: "$129 a month, or $1,290 a year"
- Let it run long. Respect the 15 minutes; offer a second call if they want more
- Promise anything you have not seen COS do

**After the call**

Update the board the same day: what they need, what you showed, objections, next step and date. Send the recap within one working day.`,
    }],
    practice: [
      { key: 'signoff:software-demo', type: 'signoff', minutes: 5,
        title: 'Runs a 15-minute demo June would sign off', hint: 'Run the demo for June as if she were an agency with 10 clients: discovery first, only what solves her problem, a clear next step, under 15 minutes.' },
    ],
    quiz: {
      key: 'software-5', title: 'Module 5 quiz: discovery and the demo', minutes: 8,
      questions: [
        { id: 'first', q: 'The first five minutes of a call are for…',
          choices: ['Showing every feature', 'Discovery questions', 'Prices', 'Small talk only'],
          answer: 1, article: A.discovery, why: 'Find the problem before you show anything.' },
        { id: 'count', q: 'Why ask how many brands they post for?',
          choices: ['To be polite', 'More brands means more value from Agency', 'To fill time', 'It is a legal requirement'],
          answer: 1, article: A.discovery, why: 'Volume tells you whether Agency fits.' },
        { id: 'words', q: 'Why write down their exact words?',
          choices: ['To use them when you show the fix', 'For June to grade', 'To post online', 'No reason'],
          answer: 0, article: A.discovery, why: '"You said captions take your Mondays. Let me show you that part."' },
        { id: 'decider', q: 'The person on the call is not the one who decides. You…',
          choices: ['Give up', 'Ask how they decide and offer to show both', 'Pressure them', 'Skip the demo'],
          answer: 1, article: A.discovery, why: 'Know who decides, and include them.' },
        { id: 'nofit', q: 'COS is not the right fit. You…',
          choices: ['Sell it anyway', 'Say so honestly', 'Offer a discount', 'Hang up'],
          answer: 1, article: A.discovery, why: 'An honest no builds trust and referrals.' },
        { id: 'length', q: 'A demo lasts about…',
          choices: ['15 minutes', '2 hours', '2 minutes', 'As long as possible'],
          answer: 0, article: A.demo, why: '5 questions, 8 showing, 2 next steps.' },
        { id: 'account', q: 'Which account do you demo from?',
          choices: ['A customer\'s', 'The demo account', 'Your own personal one', 'June\'s'],
          answer: 1, article: A.demo, why: 'Never show a real customer\'s account.' },
        { id: 'show', q: 'In the demo you show…',
          choices: ['Every feature', 'Only what solves what they told you', 'The pricing page', 'Our code'],
          answer: 1, article: A.demo, why: 'Focused on their problem.' },
        { id: 'end', q: 'Every demo ends with…',
          choices: ['A clear next step, asked directly', '"Let me know"', 'Silence', 'A discount'],
          answer: 0, article: A.demo, why: 'For example the 14-day trial with two clients.' },
        { id: 'after', q: 'After a demo you update the board…',
          choices: ['The same day', 'Next month', 'Never', 'Only if they buy'],
          answer: 0, article: A.demo, why: 'Needs, objections, next step and date, the same day.' },
      ],
    },
    buffer: 6,
  },

  /* ── 6 ── */
  {
    key: 'w6', icon: '🛡️', title: 'Objections, and what you may offer',
    goal: 'Answer the common objections honestly, and offer only what is approved.',
    lessons: [{
      id: 'w6-objections', article: A.objections, minutes: 20, tags: 'software sales, objections, price, hootsuite, later, switching, think about it',
      goals: ['Use the four-step answer to any objection', 'Answer price, switching and "we use another tool"', 'Never argue or invent'],
      body:
`An objection is a question in disguise. Answer it calmly and honestly, and it often moves the sale forward.

**The four steps**

1. **Agree where it's fair:** "That's fair, switching is real work."
2. **Ask what's behind it:** "Is it the time to move, or the cost?"
3. **Answer with their own words and a fact:** "You said captions take your Mondays. That's what COS does."
4. **Lower the risk with a next step:** "Try it with two clients for 14 days."

**"We already use Later / Hootsuite / Buffer"**

Do not knock the other tool. Ask what they like and what they don't. Our difference for agencies: captions in each brand's voice, graphics and short videos made inside the app, client approval on seats, their own logo, all for one price instead of per channel or per user. Then: "Keep your current tool and try two clients in COS for 14 days, side by side."

**"$129 is too much"**

Check what it is compared with. For an agency billing clients for social media, one extra client usually pays for it. The yearly plan gives two months free ($1,290). If they truly post for one or two brands, Agency is the wrong plan: send them to the website for Starter or Pro rather than discounting.

**"Moving everything sounds like a lot of work"**

"Don't move everything. Start with your two busiest clients, and I'll help you set them up." Small first steps beat a big switch.

**"Let me think about it"**

"Of course. What would you want to be sure of before deciding?" Then answer that, or agree a date to follow up.

**Never**

Argue, put down a competitor, invent a feature, or offer a discount that is not approved (next lesson).`,
    }, {
      id: 'w6-offers', article: A.offers, minutes: 20, tags: 'software sales, offers, free plan, trial, yearly, discount, approval, june',
      goals: ['Know the three approved offers', 'Know what needs June first', 'Say no to a discount without losing the sale'],
      body:
`Our prices leave a thin margin, so offers are tightly controlled. You may use three without asking. Everything else is June's decision, before you mention it.

**What you may offer**

- **The free plan:** for anyone, no card needed. Good for small businesses you send to the website
- **A 14-day free trial of a paid plan:** the customer starts paying after 14 days unless they cancel. Check with June that trials are switched on for that app before you offer one
- **The yearly plan:** two months free, already in the price ($1,290 a year for Agency)

**What needs June first**

- Any discount or coupon, of any size
- A longer trial than 14 days
- Custom plans, extra seats or features outside a plan
- Promises about new features or dates
- Anything involving refunds, contracts or invoices instead of card payment

Ask June in your team channel with the company, what they asked for and what you recommend. Tell the prospect honestly: "I'll check with June and come back to you today."

**Saying no to a discount**

"I can't change the price, but I can make it easy to be sure first: try it free for 14 days with two clients. And yearly saves you two months."

That keeps the sale moving without giving away margin.

**Why it matters to you too**

Your commission is 10% of what the customer pays. A discount cuts it, and a customer won by discount is more likely to cancel. Customers who see the value at full price stay.`,
    }],
    practice: [],
    quiz: {
      key: 'software-6', title: 'Module 6 quiz: objections, and what you may offer', minutes: 8,
      questions: [
        { id: 'steps', q: 'The first step in answering an objection is…',
          choices: ['Argue', 'Agree where it\'s fair', 'Discount', 'Hang up'],
          answer: 1, article: A.objections, why: 'Agree, ask, answer, lower the risk.' },
        { id: 'rival', q: 'A prospect uses Later. You…',
          choices: ['Say Later is bad', 'Ask what they like and suggest a side-by-side trial', 'Give up', 'Offer 50% off'],
          answer: 1, article: A.objections, why: 'Never knock a competitor; lower the risk.' },
        { id: 'price', q: '"$129 is too much" from an agency with 10 clients. A good answer is…',
          choices: ['One extra client usually pays for it, and yearly gives two months free', 'Fine, $60 then', 'Goodbye', 'It is actually free'],
          answer: 0, article: A.objections, why: 'Value and the approved yearly offer.' },
        { id: 'small', q: 'They really post for only one brand. You…',
          choices: ['Discount Agency', 'Point them to Starter or Pro on the website', 'Insist on Agency', 'Ignore them'],
          answer: 1, article: A.objections, why: 'Wrong plan, not a discount.' },
        { id: 'switch', q: '"Moving everything is a lot of work." You suggest…',
          choices: ['Starting with their two busiest clients', 'Moving all 20 clients today', 'Giving up', 'A refund'],
          answer: 0, article: A.objections, why: 'Small first steps beat a big switch.' },
        { id: 'free', q: 'Which offer may you make without asking?',
          choices: ['20% off', 'A 14-day free trial', 'A free year', 'A custom plan'],
          answer: 1, article: A.offers, why: 'Free plan, 14-day trial, yearly plan.' },
        { id: 'discount', q: 'A prospect asks for 10% off. You…',
          choices: ['Agree', 'Say you will check with June, and offer the trial meanwhile', 'Offer 20%', 'Refuse rudely'],
          answer: 1, article: A.offers, why: 'Every discount is June\'s decision.' },
        { id: 'feature', q: 'They will sign if a feature arrives next month. You…',
          choices: ['Promise it', 'Ask June before promising anything', 'Say it exists', 'Ignore it'],
          answer: 1, article: A.offers, why: 'Feature promises are June\'s.' },
        { id: 'yearly', q: 'What does the yearly Agency plan cost?',
          choices: ['$1,290', '$1,548', '$129', '$990'],
          answer: 0, article: A.offers, why: 'Two months free compared with 12 × $129.' },
        { id: 'why', q: 'Why do unapproved discounts hurt you too?',
          choices: ['They do not', 'They cut your 10% and the customer is more likely to cancel', 'They are illegal', 'June fines you'],
          answer: 1, article: A.offers, why: 'Full-price customers who see the value stay.' },
      ],
    },
    buffer: 5,
  },

  /* ── 7 ── */
  {
    key: 'w7', icon: '🚀', title: 'Trials, setup help and handing over',
    goal: 'Turn a free trial into a paying customer, and hand a new customer over cleanly.',
    lessons: [{
      id: 'w7-trial', article: A.trial, minutes: 20, tags: 'software sales, trial, onboarding, check-ins, conversion, paying customer',
      goals: ['Set a trial up to succeed in the first two days', 'Check in on days 2, 7 and 12', 'Ask for the decision before the trial ends'],
      body:
`A trial is won or lost in the first two days. If they connect their clients and see a week of posts planned, they stay. If they sign up and forget, they leave.

**Day 0: start it with them**

Book the start as a short call where you can. Together:

- They sign up while they are already on the board as your lead (and from your agent link, once June gives you one), so the customer is credited to you
- They create two client brands and connect those clients' accounts themselves. You never take their passwords
- They plan one week of posts for one client, and see the captions and graphics

**Check-ins**

- **Day 2:** "How did the first week of posts look? Anything confusing?" Fix the blocker or bring it to June
- **Day 7:** share one idea for their kind of client, and ask how much time it saved
- **Day 12:** ask for the decision: "Your trial ends on Friday. Do you want to keep going on monthly, or yearly with two months free?"

Log each check-in on the board.

**If they are not using it**

Ask what got in the way, honestly. Offer a 15-minute setup call. If it is truly not a fit, let the trial end without pressure and mark the lead lost with the reason.

**When they pay**

Mark the lead won, with the plan and monthly or yearly. Thank them, and tell them who to ask for help from now on (next lesson).

**What you never do**

- Sign up on their behalf or enter their card
- Promise the trial can be extended without June
- Keep messaging after they decide not to continue`,
    }, {
      id: 'w7-handoff', article: A.handoff, minutes: 20, tags: 'software sales, setup, paid setup, support, handoff, customer care',
      goals: ['Know what setup help is free and what is paid', 'Hand a new customer to support cleanly', 'Ask for a referral at the right time'],
      body:
`Some customers want us to set things up for them. That is a paid service, and June does it or decides who does.

**Free help**

- The trial start call and the check-ins
- Showing them on a screen share how to connect accounts, add a brand or plan a month
- Links to the help pages

**Paid setup**

For the business dashboard and anything that needs other accounts connected (texting, card payments, a website domain), customers can pay for us to set it up for them. June sets the setup fee and what it includes, and replies to the customer with the price.

If a customer asks for setup, tell them it is available as a paid service, log it on the board, and pass it to June in your channel. Never quote a setup price June has not set, and never log in to a customer's accounts yourself.

**Handing over**

Once a customer pays, their questions about how the app works go to the help or contact page inside the app, and anything urgent to June. You stay their friendly contact for the first month: a check-in at week 2 and week 4.

**Referrals**

The best time to ask is after a customer tells you it saved them time: "Glad it's helping! Do you know another agency owner who's drowning in posting? I'd be happy to show them too." Log every referral as a new lead with who referred them.

**Feedback**

Send June what customers ask for and what confused them, in your weekly report. That is how the apps get better and easier to sell.`,
    }],
    practice: [
      { key: 'signoff:software-trial', type: 'signoff', minutes: 5,
        title: 'Starts a trial the right way', hint: 'Walk June through a trial start: the lead on the board as yours before signing up, two brands added and connected by the customer, a week planned, check-ins set on days 2, 7 and 12.' },
    ],
    quiz: {
      key: 'software-7', title: 'Module 7 quiz: trials, setup help and handing over', minutes: 8,
      questions: [
        { id: 'won', q: 'A trial is usually won or lost…',
          choices: ['In the first two days', 'On the last day', 'After a year', 'Never'],
          answer: 0, article: A.trial, why: 'Connected clients and a planned week make them stay.' },
        { id: 'link', q: 'Why must they be on the board as your lead before they sign up?',
          choices: ['It is faster', 'So the customer is credited to you', 'It gives a discount', 'No reason'],
          answer: 1, article: A.trial, why: 'The board (and your agent link, once you have one) is how the sale is yours.' },
        { id: 'passwords', q: 'Who connects the client accounts?',
          choices: ['You, with their passwords', 'The customer, themselves', 'June', 'Nobody'],
          answer: 1, article: A.trial, why: 'You never take a customer\'s passwords.' },
        { id: 'days', q: 'When do you check in during a trial?',
          choices: ['Days 2, 7 and 12', 'Every hour', 'Only on day 14', 'Never'],
          answer: 0, article: A.trial, why: 'Early help, a mid-point idea, then the decision.' },
        { id: 'ask', q: 'On day 12 you…',
          choices: ['Ask for the decision: monthly or yearly', 'Say nothing', 'Extend the trial', 'Cancel it'],
          answer: 0, article: A.trial, why: 'Ask before the trial ends.' },
        { id: 'card', q: 'A customer asks you to enter their card for them. You…',
          choices: ['Do it', 'Decline: they enter it themselves', 'Write it down', 'Ask June for it'],
          answer: 1, article: A.trial, why: 'Never handle a customer\'s card.' },
        { id: 'setup', q: 'A customer wants us to set everything up for them. You…',
          choices: ['Log in and do it', 'Tell them paid setup is available and pass it to June', 'Quote $10', 'Refuse'],
          answer: 1, article: A.handoff, why: 'Setup is a paid service June runs.' },
        { id: 'free', q: 'Which help is free?',
          choices: ['Showing them on a screen share how to connect accounts', 'Connecting their accounts for them', 'Building their website', 'Setting up their card payments'],
          answer: 0, article: A.handoff, why: 'Showing is free; doing it for them is paid setup.' },
        { id: 'support', q: 'After a customer pays, questions about the app go to…',
          choices: ['Support, with you checking in during the first month', 'Nobody', 'Only you, forever', 'Their own staff'],
          answer: 0, article: A.handoff, why: 'Clean handover, friendly follow-up.' },
        { id: 'referral', q: 'The best time to ask for a referral is…',
          choices: ['Right after they say it saved them time', 'In the first message', 'When they cancel', 'Never'],
          answer: 0, article: A.handoff, why: 'Ask when they are happy.' },
      ],
    },
    buffer: 6,
  },

  /* ── 8 ── */
  {
    key: 'w8', icon: '📈', title: 'Pay, rules and your weekly report',
    goal: 'Know how you are paid, the rules that protect customers and the business, and how to report your week.',
    lessons: [{
      id: 'w8-pay', article: A.pay, minutes: 15, tags: 'software sales, pay, commission, 10%, six months, wise, hours',
      goals: ['Work out your commission on a customer', 'Know when commission starts and stops', 'Know why customers who stay matter'],
      body:
`You are paid an hourly wage plus commission on the customers you bring in.

**Your wage**

The hourly wage and hours in your offer, paid weekly by Wise. Clock in and out on the Timeclock so every hour counts.

**Your commission**

10% of every payment a customer you signed up makes in their first 6 months, once June has signed off your training.

- It follows their payments: paid when their payment clears, with your weekly pay
- A customer on monthly Agency pays $129 a month: you earn $12.90 a month for 6 months, $77.40 in all
- A customer on yearly Agency pays $1,290 at once, in their first 6 months: you earn $129
- If they cancel, commission stops with their payments. A refund takes back the commission on that payment
- The customer is yours if they signed up from your link or are on the board as your lead before they signed up. Until agent links are built, June confirms which customers are yours from the board.

**Why customers who stay matter**

Ten customers who stay 6 months earn you far more than thirty who cancel after one. That is why we sell to good fits, never push the wrong plan and never discount without June.

**Yearly is good for everyone**

The customer saves two months. We get the payment up front. You get all your commission at once.

**Your dashboard**

My earnings shows your hours and your wage. Your software commission is not on it yet: June works it out from the board and the customer's payments, and adds it to your weekly pay. If a number looks wrong, ask June directly, not in a team channel.`,
    }, {
      id: 'w8-report', article: A.report, minutes: 15, tags: 'software sales, rules, privacy, honesty, weekly report, numbers',
      goals: ['Follow the rules that protect customers', 'Send a five-line weekly report', 'Read your numbers and change what is not working'],
      body:
`A few rules keep customers safe and keep our name good. Breaking them can end the job, so they are short and firm.

**The rules**

- Never take, keep or type a customer's passwords or card numbers
- Never buy, scrape or share contact lists. Never automate messages
- Never promise a feature, discount, date or result June has not approved
- Never pretend to be a customer, or hide that you sell COS
- Customer information stays in our tools. Never copy it to your own files, and never paste it into an AI tool
- Stop contacting anyone who asks you to

**Your weekly report**

Every Friday, in your channel, five lines June can read in a minute:

1. Messages sent, replies, demos, trials started, customers won (plan, monthly or yearly)
2. What worked: the message or kind of agency that replied most
3. What didn't, and what you will change next week
4. What customers asked for or found confusing
5. Anything you need from June: a decision, an approval, a setup request

**An example**

"Week 3: 85 messages, 11 replies, 4 demos, 2 trials, 1 won (Agency, yearly). Freelancers on LinkedIn replied twice as often as agencies by email. Next week: more freelancers, shorter first line. Two agencies asked for Canva import. Need: a yes or no on a 30-day trial for a 20-client agency."

**Reading your numbers**

- Few replies: the first message or the prospects need changing
- Replies but few demos: the ask is too big. Offer the trial instead
- Demos but no trials: discovery missed their real problem
- Trials but no sales: the first two days need more help`,
    }],
    practice: [
      { key: 'signoff:software-report', type: 'signoff', minutes: 5,
        title: 'Sends a weekly report June can act on', hint: 'Your first Friday report: the numbers from the board, what worked, what you will change, what customers asked for, and anything you need from June.' },
    ],
    quiz: {
      key: 'software-8', title: 'Module 8 quiz: pay, rules and your weekly report', minutes: 8,
      questions: [
        { id: 'pct', q: 'Your commission is…',
          choices: ['10% of a customer\'s payments in their first 6 months', '50% of the first payment', '3% forever', '$100 per sign-up'],
          answer: 0, article: A.pay, why: 'Following their payments for 6 months.' },
        { id: 'monthly', q: 'A customer pays $129 a month for 6 months. Your commission in all?',
          choices: ['$77.40', '$12.90', '$129', '$774'],
          answer: 0, article: A.pay, why: '$12.90 a month for 6 months.' },
        { id: 'yearly', q: 'A customer pays $1,290 for a year up front. Your commission?',
          choices: ['$129', '$12.90', '$1,290', '$0'],
          answer: 0, article: A.pay, why: '10% of a payment made in their first 6 months.' },
        { id: 'cancel', q: 'A customer cancels after 2 months. Your commission…',
          choices: ['Stops with their payments', 'Continues for 6 months', 'Doubles', 'Is taken back entirely'],
          answer: 0, article: A.pay, why: 'Commission follows their payments.' },
        { id: 'start', q: 'Commission starts…',
          choices: ['Once June signs off your training', 'On day one', 'After a year', 'Never'],
          answer: 0, article: A.pay, why: 'Training sign-off unlocks it.' },
        { id: 'ai', q: 'May you paste a prospect\'s details into an AI tool to write a message?',
          choices: ['Yes', 'No: customer information stays in our tools', 'Only at night', 'Only names'],
          answer: 1, article: A.report, why: 'Customer information never goes into an AI tool.' },
        { id: 'stop', q: 'Someone asks you to stop contacting them. You…',
          choices: ['Stop, and note it on the board', 'Try one more time', 'Email their boss', 'Use another channel'],
          answer: 0, article: A.report, why: 'Stop on request, always.' },
        { id: 'friday', q: 'Your weekly report goes out…',
          choices: ['Every Friday, in your channel', 'Once a month', 'When asked', 'Never'],
          answer: 0, article: A.report, why: 'Five lines every Friday.' },
        { id: 'replies', q: 'You get replies but few demos. The likely fix is…',
          choices: ['Offer the trial instead of a call', 'Send more messages', 'Give discounts', 'Stop working'],
          answer: 0, article: A.report, why: 'The ask is too big.' },
        { id: 'trials', q: 'You get trials but few sales. Look at…',
          choices: ['The first two days of the trial', 'Your first message', 'Your hours', 'The weather'],
          answer: 0, article: A.report, why: 'Trials are won in the first two days.' },
      ],
    },
    buffer: 5,
  },
];

/* The final exam: new questions across the whole course, 80% to pass. */
const FINAL = {
  floating: 15,
  quiz: {
    key: 'software-final', title: 'Final exam: the Software sales course', minutes: 25,
    questions: null, // software-core-final.js
  },
  signoffs: [
    { key: 'signoff:handoff', type: 'signoff', minutes: 0,
      title: 'Knows what is June\'s to decide', hint: 'Discounts, longer trials, custom plans, feature promises, setup prices and refunds. June signs this off after seeing you do it.' },
    { key: 'signoff:ready', type: 'signoff', minutes: 0,
      title: 'Ready to sell on your own', hint: 'The last step. June decides when you contact prospects and run demos without her checking first, and your commission starts.' },
  ],
};
FINAL.quiz.questions = require('./software-core-final')(A);

const PAGES = require('./software-core-pages');
for (const l of MODULES.flatMap((m) => m.lessons)) {
  if (l.pages) continue; // the shared module's lessons carry their own
  l.pages = PAGES[l.id] || [{ from: null, checks: [] }];
  l.checks = l.pages.flatMap((pg) => pg.checks);
}

module.exports = { key: 'software-core', title: 'Software sales', track: 'software', articles: A, glossary: GLOSSARY, modules: MODULES, final: FINAL };
