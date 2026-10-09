'use strict';

/* The Account Manager course: the second eight hours for a salesperson the
   owner gives the Account Manager role on Staff. It follows the consolidated
   Sales course and goes deeper on keeping past customers ordering: the
   reorder calendar, their history, the reorder note and quote, yearly
   accounts, reviews, upgrades, and bringing quiet customers back.

   Same shape as the other courses. Every rule here is one the Sales course or
   the system already sets; what only the owner can decide is written
   "[owner to fill in: ...]" for the Training page's Playbook gaps card. */

const A = {
  job:      'Account Manager 1: The job',
  calendar: 'Account Manager 2: The reorder calendar',
  history:  'Account Manager 3: Reading a customer\'s history',
  reorder:  'Account Manager 4: The reorder note and the reorder quote',
  yearly:   'Account Manager 5: Yearly accounts',
  reviews:  'Account Manager 6: Reviews',
  upgrades: 'Account Manager 7: Upgrades that fit',
  quiet:    'Account Manager 8: Quiet customers and your day',
};

const GLOSSARY = {
  'repeat revenue': 'Money from customers who have ordered before.',
  'yearly account': 'A school, league, church or business that orders on the same calendar every year.',
  'reorder note': 'A short personal message to a past customer before their next season or event.',
};

const MODULES = [
  /* ── 1 ── */
  {
    key: 'am1', icon: '🤝', title: 'The Account Manager job',
    goal: 'Know which customers are yours, how the job is measured, and what stays June\'s.',
    lessons: [{
      id: 'am1-job', article: A.job, minutes: 20, tags: 'account manager, role, reorders, repeat revenue, reviews, targets',
      goals: ['Say which customers an Account Manager looks after', 'Name the three numbers the job is measured on', 'Know what the system does and what you add'],
      tryIt: [{ label: 'Customers', href: '/admin/customers' }, { label: 'Reviews', href: '/admin/reviews' }],
      body:
`You finished the Sales course. This course is about the customers who have already ordered: keeping them happy, and keeping them ordering.

**Your customers**

- Everyone who has ordered from us before
- Especially the ones who order on a calendar: schools, PTOs, leagues, churches, camps and businesses
- New customers belong to Lead Generation and the Closer until their first order is done. Then they are yours

**What you are measured on**

- **Reorders:** past customers who order again
- **Repeat revenue:** what those reorders are worth
- **Reviews:** happy customers who tell others, and every review answered well

Your targets: [owner to fill in: Account Manager targets for reorders a month, repeat revenue and reviews]

**What the system already does**

- About 90 days after a customer pays, it emails them about a reorder
- It asks for a review after an order
- It sends deposit and balance reminders

**What you add**

The personal touch the system cannot: knowing their season, writing to the right person a few weeks before, starting the quote from what they had last time, and making sure nothing about their order surprises them.

**What stays June's**

Discounts, price matches, refunds, reprints, taking tax off, and any date you have not checked. Bad reviews go to June before anyone replies.`,
    }],
    practice: [],
    quiz: {
      key: 'accounts-1', title: 'Module 1 quiz: the job', minutes: 10,
      questions: [
        { id: 'whose', q: 'Which customers does an Account Manager look after?',
          choices: ['Only new leads', 'Everyone who has ordered before', 'Only businesses', 'Nobody'], answer: 1, article: A.job, why: 'Past customers are yours.' },
        { id: 'when', q: 'A brand-new customer becomes yours…',
          choices: ['On their first message', 'After their first order is done', 'Never', 'After a year'], answer: 1, article: A.job, why: 'Lead Gen and the Closer bring them in.' },
        { id: 'measure', q: 'Which is NOT one of your three numbers?',
          choices: ['Reorders', 'Repeat revenue', 'Reviews', 'Cold prospects found'], answer: 3, article: A.job, why: 'Finding prospects is Lead Generation\'s.' },
        { id: 'auto', q: 'What does the system send about 90 days after payment?',
          choices: ['A reorder email', 'An invoice', 'A refund', 'Nothing'], answer: 0, article: A.job, why: 'The automatic reorder nudge.' },
        { id: 'add', q: 'What do you add that the system cannot?',
          choices: ['A personal note to the right person at the right time', 'More automatic emails', 'Discounts', 'Newsletter sign-ups'], answer: 0, article: A.job, why: 'The personal touch.' },
        { id: 'review', q: 'A bad review comes in. First?',
          choices: ['Reply defending the shop', 'Tell June before anyone replies', 'Delete it', 'Ignore it'], answer: 1, article: A.job, why: 'June sees bad reviews first.' },
        { id: 'refund', q: 'A past customer asks for a reprint. Who decides?',
          choices: ['You', 'June', 'The designer', 'The customer'], answer: 1, article: A.job, why: 'Reprints are June\'s.' },
        { id: 'type', q: 'Which customers order on a calendar?',
          choices: ['Schools, leagues, churches, camps and businesses', 'Only families', 'Only one-off birthdays', 'Nobody'], answer: 0, article: A.job, why: 'They are your core.' },
        { id: 'rev', q: 'Repeat revenue is…',
          choices: ['Money from customers who ordered before', 'All money', 'Refunds', 'Tax'], answer: 0, article: A.job, why: 'Reorders\' value.' },
        { id: 'discount', q: 'A loyal customer asks for 10% off. You…',
          choices: ['Give it', 'Say you will check with June and reply by a set time', 'Refuse', 'Give 5%'], answer: 1, article: A.job, why: 'Discounts are June\'s.' },
      ],
    },
    buffer: 7,
  },

  /* ── 2 ── */
  {
    key: 'am2', icon: '📅', title: 'The reorder calendar',
    goal: 'Know when each kind of customer orders again, and reach them a few weeks before.',
    lessons: [{
      id: 'am2-calendar', article: A.calendar, minutes: 40, tags: 'reorder calendar, seasons, schools, leagues, churches, businesses, timing',
      goals: ['Say when each customer type reorders', 'Plan reorder notes 4 to 6 weeks ahead', 'Keep the next date on every account'],
      tryIt: [{ label: 'Customers', href: '/admin/customers' }],
      body:
`Customers who order on a calendar decide on shirts at about the same time every year. Reach them a few weeks before they decide, and you are the obvious choice.

**When each kind of customer orders again**

- **Schools and PTOs:** back to school and spirit wear (August), field day and graduation (spring), staff shirts at the start of the year
- **Sports leagues and teams:** every season: spring and fall sign-ups, plus fan shirts mid-season
- **Churches and camps:** summer camps, yearly retreats, holidays and anniversaries
- **Runs, walks and festivals:** the same event every year, often on the same weekend
- **Businesses:** new staff all year, a yearly event, seasonal uniforms (hoodies for winter)
- **Families and groups:** reunions every year or two; birthdays and memorials once

Reorder timing the owner has confirmed: [owner to fill in: the reorder timing for each customer type]

**Four to six weeks before**

Write 4 to 6 weeks before they need shirts. That is when they are deciding. A note the week of the event is too late; one six months early is forgotten.

**Keep the next date on every account**

- When an order is done, work out when they will need shirts next
- Set that follow-up date on their lead, 4 to 6 weeks before
- My Day brings them back on the right day, so nobody slips

**Your week**

Each week, look ahead six weeks: which accounts have a season, an event or a school date coming up? Those are this week's reorder notes.`,
    }],
    practice: [],
    quiz: {
      key: 'accounts-2', title: 'Module 2 quiz: the reorder calendar', minutes: 10,
      questions: [
        { id: 'when', q: 'When do you write a reorder note?',
          choices: ['4 to 6 weeks before they need shirts', 'The week of the event', 'Six months before', 'After the event'], answer: 0, article: A.calendar, why: 'When they are deciding.' },
        { id: 'school', q: 'When do schools usually order spirit wear?',
          choices: ['August, for back to school', 'December only', 'Never', 'Every week'], answer: 0, article: A.calendar, why: 'Back to school.' },
        { id: 'league', q: 'How often does a league order?',
          choices: ['Every season', 'Once ever', 'Every ten years', 'Only on request'], answer: 0, article: A.calendar, why: 'Each season.' },
        { id: 'run', q: 'A charity run ordered last May. When do you write?',
          choices: ['Early April, 4 to 6 weeks before this year\'s run', 'Next December', 'The day of the run', 'Never'], answer: 0, article: A.calendar, why: 'Same event, same time.' },
        { id: 'biz', q: 'Businesses reorder…',
          choices: ['For new staff all year, yearly events and seasonal uniforms', 'Never', 'Only once', 'Only in June'], answer: 0, article: A.calendar, why: 'Workwear is ongoing.' },
        { id: 'next', q: 'An order is done. What do you set?',
          choices: ['A follow-up date 4 to 6 weeks before their next need', 'Nothing', 'A discount', 'A newsletter sign-up'], answer: 0, article: A.calendar, why: 'My Day brings them back.' },
        { id: 'week', q: 'Each week you look ahead…',
          choices: ['Six weeks for upcoming seasons and events', 'One day', 'Two years', 'Not at all'], answer: 0, article: A.calendar, why: 'This week\'s notes.' },
        { id: 'late', q: 'Why is a note the week of the event too late?',
          choices: ['They have already decided', 'It is not', 'Tax changes', 'Proofs expire'], answer: 0, article: A.calendar, why: 'Decisions happen weeks before.' },
        { id: 'camp', q: 'A summer camp ordered last June. Best time to write?',
          choices: ['April to early May', 'August', 'December', 'Never'], answer: 0, article: A.calendar, why: '4 to 6 weeks before.' },
        { id: 'winter', q: 'A business ordered tees in spring. A seasonal idea for autumn?',
          choices: ['Hoodies for winter', 'Graduation cutouts', 'Field day banner', 'Nothing'], answer: 0, article: A.calendar, why: 'Seasonal uniforms.' },
      ],
    },
    buffer: 7,
  },

  /* ── 3 ── */
  {
    key: 'am3', icon: '🗂️', title: 'Reading a customer\'s history',
    goal: 'Know everything about a customer before you write: what they ordered, who decides, and what to watch for.',
    lessons: [{
      id: 'am3-history', article: A.history, minutes: 30, tags: 'customers, history, last order, notes, decision maker, tax certificate, problems',
      goals: ['Find a customer\'s orders, designs and sizes', 'Spot what went well and what to fix', 'Keep the account\'s notes up to date'],
      tryIt: [{ label: 'Customers', href: '/admin/customers' }],
      body:
`Before you write to a past customer, spend two minutes on their history. It is the difference between "Do you need shirts?" and a note they reply to.

**Where to look**

Search **Customers** by name, email or phone. Their page shows every order: what, how many, which colours and design, the sizes, and when. Open the job page for the details and the messages.

**What to note**

- **What they ordered:** garment, colour, method, print places, and the size mix
- **When:** that tells you their season
- **Who decides:** the person who ordered may not be the one this year. Schools and leagues change volunteers
- **Tax:** schools and churches are often tax-exempt. Is their certificate on file and in date?
- **How it went:** a late artwork, a reprint, a complaint, or a glowing review. Read the messages

**What went well, and what to fix**

- If they loved it, say so: "Your navy tees looked great in the photos!"
- If something went wrong last time, fix it this time and say so: "This year we'll get the proof to you a week earlier"
- If their sizes ran short, suggest a few extra of the size they ran out of

**Keep the account up to date**

After every conversation, log what you learned on their lead: a new contact, next year's date, a change in budget. The next person, or you in a year, starts from there.`,
    }],
    practice: [
      { key: 'do:accounts-quotes', type: 'do', fact: 'quotes', need: 3, minutes: 20,
        title: 'Build 3 real quotes', hint: 'Quotes you created or sent, drafts included; a reorder quote counts. The ones from the Sales course count. This ticks itself at 3.' },
    ],
    quiz: {
      key: 'accounts-3', title: 'Module 3 quiz: a customer\'s history', minutes: 10,
      questions: [
        { id: 'where', q: 'Where do you find what a customer ordered before?',
          choices: ['Customers', 'Resources', 'Training', 'Team chat'], answer: 0, article: A.history, why: 'Search Customers.' },
        { id: 'season', q: 'What tells you a customer\'s season?',
          choices: ['When they ordered', 'Their email address', 'The tax rate', 'Nothing'], answer: 0, article: A.history, why: 'The date of past orders.' },
        { id: 'who', q: 'Why check who decides this year?',
          choices: ['Volunteers change at schools and leagues', 'It never changes', 'For tax', 'It does not matter'], answer: 0, article: A.history, why: 'Write to the right person.' },
        { id: 'tax', q: 'A school is tax-exempt. Before quoting you check…',
          choices: ['Their certificate is on file and in date', 'Nothing', 'Their bank', 'Their logo'], answer: 0, article: A.history, why: 'Expired certificates need replacing.' },
        { id: 'wrong', q: 'Last year\'s proof was late. This year you…',
          choices: ['Fix it and say so', 'Hope they forgot', 'Blame the designer', 'Offer a discount'], answer: 0, article: A.history, why: 'Show you learned.' },
        { id: 'sizes', q: 'They ran out of mediums last time. You suggest…',
          choices: ['A few extra mediums', 'Fewer mediums', 'All XL', 'Nothing'], answer: 0, article: A.history, why: 'Help them avoid it again.' },
        { id: 'loved', q: 'They loved last year\'s shirts. Your note…',
          choices: ['Says so', 'Ignores it', 'Criticises them', 'Lists prices'], answer: 0, article: A.history, why: 'Start warm.' },
        { id: 'log', q: 'You learn next year\'s event date. You…',
          choices: ['Log it on their lead', 'Remember it', 'Tell no one', 'Email it to yourself'], answer: 0, article: A.history, why: 'The account keeps it.' },
        { id: 'messages', q: 'Where do you read how the last order went?',
          choices: ['The job page messages', 'The newsletter', 'Finances', 'Nowhere'], answer: 0, article: A.history, why: 'The messages tell the story.' },
        { id: 'time', q: 'How long to spend on history before writing?',
          choices: ['About two minutes', 'An hour', 'None', 'A day'], answer: 0, article: A.history, why: 'Enough to write a real note.' },
      ],
    },
    buffer: 7,
  },

  /* ── 4 ── */
  {
    key: 'am4', icon: '✉️', title: 'The reorder note and the reorder quote',
    goal: 'Write a reorder note people reply to, and build the reorder quote right first time.',
    lessons: [{
      id: 'am4-reorder', article: A.reorder, minutes: 35, tags: 'reorder note, reorder quote, last quote, proof, sizes, artwork, follow up',
      goals: ['Write a reorder note in three parts', 'Build a reorder quote from their last order', 'Know when a new proof is needed'],
      tryIt: [{ label: 'The /reorder reply', href: '/admin/playbook?q=reorder' }],
      body:
`A reorder note is short, personal, and makes saying yes easy.

**Three parts**

- **What we made last time,** specifically: "your royal blue field day shirts"
- **Their upcoming season or event:** "with field day coming up in May"
- **One easy next step:** "Would you like the same again, or anything new?"

Sign with your name and June's Tees. Under 70 words. The /reorder reply in the Playbook is a starting point; make the first line theirs.

Example: "Hi Ms. Patel, it's Christine from June's Tees! Last spring we made your royal blue field day shirts and they looked great. With field day coming up in May, would you like the same again, or anything new this year?"

Never promise a date in the note. Offer to check the timing when they reply.

**Follow up**

If there is no reply, follow up twice at most: about 3 days, then about 10 days, each with something useful. Then set a date for their next season.

**The reorder quote**

- Start from what they had last time, so the garment, colours and artwork match
- Check what changed: quantities and sizes change every year, and the design may too (a new year, new names)
- Enter the new size mix and the needed-by date; the form prices it at today's prices
- Mention in the notes that it matches last time, and what is new

**When a new proof is needed**

If anything in the artwork changes (a year, names, colours, a new logo), the customer approves a new proof in writing. If it is exactly the same, say so in the notes and on the job.

June reads your first five reorder notes before you send them on your own.`,
    }],
    practice: [
      { key: 'signoff:accounts-notes', type: 'signoff', minutes: 15,
        title: 'June reads your first five reorder notes', hint: 'Send June five reorder notes in Team chat, each for a real past customer. She signs off once they read as personal and follow the three parts.' },
    ],
    quiz: {
      key: 'accounts-4', title: 'Module 4 quiz: reorder notes and quotes', minutes: 10,
      questions: [
        { id: 'parts', q: 'The three parts of a reorder note are…',
          choices: ['What we made, their upcoming season, one easy next step', 'Price list, discount, deadline', 'Greeting, logo, tax', 'Nothing'], answer: 0, article: A.reorder, why: 'Specific, timely, easy.' },
        { id: 'len', q: 'How long is a reorder note?',
          choices: ['Under 70 words', 'A page', 'One word', 'As long as possible'], answer: 0, article: A.reorder, why: 'Short and personal.' },
        { id: 'date', q: 'May the note promise a delivery date?',
          choices: ['No; offer to check timing when they reply', 'Yes', 'Only for schools', 'Always'], answer: 0, article: A.reorder, why: 'Dates are checked first.' },
        { id: 'follow', q: 'No reply. How many follow-ups?',
          choices: ['Two at most', 'Daily', 'None', 'Five'], answer: 0, article: A.reorder, why: 'About 3 and 10 days.' },
        { id: 'start', q: 'The reorder quote starts from…',
          choices: ['What they had last time', 'A blank guess', 'The cheapest garment', 'A competitor'], answer: 0, article: A.reorder, why: 'So everything matches.' },
        { id: 'change', q: 'What usually changes every year?',
          choices: ['Quantities and sizes', 'Nothing', 'The shop\'s name', 'The tax law'], answer: 0, article: A.reorder, why: 'Always check.' },
        { id: 'price', q: 'The reorder is priced at…',
          choices: ['Today\'s prices, by the form', 'Last year\'s prices', 'A price you type', 'Half price'], answer: 0, article: A.reorder, why: 'The form prices it.' },
        { id: 'proof', q: 'The year on the design changes. A new proof is…',
          choices: ['Needed, approved in writing', 'Not needed', 'June\'s choice', 'Optional'], answer: 0, article: A.reorder, why: 'Any artwork change needs a new proof.' },
        { id: 'same', q: 'The artwork is exactly the same. You…',
          choices: ['Say so in the notes and on the job', 'Make a new design', 'Skip the quote', 'Change the colours'], answer: 0, article: A.reorder, why: 'Record that it matches.' },
        { id: 'review', q: 'Who reads your first five reorder notes?',
          choices: ['June', 'Nobody', 'The customer', 'The designer'], answer: 0, article: A.reorder, why: 'June signs off.' },
      ],
    },
    buffer: 7,
  },

  /* ── 5 ── */
  {
    key: 'am5', icon: '🏫', title: 'Yearly accounts',
    goal: 'Look after the schools, leagues, churches and businesses that order every year, so they never think of going elsewhere.',
    lessons: [{
      id: 'am5-yearly', article: A.yearly, minutes: 40, tags: 'yearly accounts, schools, leagues, churches, businesses, contacts, tax certificates, new staff',
      goals: ['Keep one contact and one calendar per account', 'Keep tax paperwork current', 'Make ordering again effortless'],
      tryIt: [{ label: 'Customers', href: '/admin/customers' }, { label: 'Certificates', href: '/admin/certificates' }],
      body:
`A yearly account is worth many single orders. Treat it like a relationship, not a sale.

**One contact, one calendar**

- Know the main contact and a backup (the PTO chair and the principal's office; the league coordinator and a coach)
- Know their year: every event and season they order for
- Log both on their lead, with the next follow-up date

**When the contact changes**

Volunteers change every year. If your note bounces or a new name replies, welcome them, tell them briefly what we made for their group before, and offer to send the details. Update the lead.

**Tax paperwork**

Schools, churches and charities are often tax-exempt. Each year, check their certificate is on file and in date. If it has expired, ask for the new one before you quote. The customer uploads it on their quote page and June approves it. You never take tax off yourself.

**Make ordering again effortless**

- Offer "the same as last time" as the first option, with only the sizes to confirm
- Keep their artwork details on the job, so a reorder needs no hunting
- For businesses with new staff all year, suggest a simple reorder habit: "Send me the sizes whenever someone joins and I'll quote it the same day"

**Look after them between orders**

- Answer every message from a yearly account the same day
- If something goes wrong, tell June at once and keep them informed
- Thank them after each order, and ask how it went`,
    }],
    practice: [],
    quiz: {
      key: 'accounts-5', title: 'Module 5 quiz: yearly accounts', minutes: 10,
      questions: [
        { id: 'contacts', q: 'For each yearly account you keep…',
          choices: ['A main contact, a backup and their calendar', 'Only an email', 'Nothing', 'Their bank details'], answer: 0, article: A.yearly, why: 'One contact, one calendar.' },
        { id: 'bounce', q: 'Your note bounces: the PTO chair changed. You…',
          choices: ['Give up', 'Find the new contact, welcome them, update the lead', 'Write to the old one again', 'Add them to the newsletter'], answer: 1, article: A.yearly, why: 'Volunteers change.' },
        { id: 'cert', q: 'A school\'s certificate expired. Before quoting you…',
          choices: ['Ask for the new one; they upload it and June approves', 'Untick tax', 'Ignore it', 'Charge double'], answer: 0, article: A.yearly, why: 'Never take tax off yourself.' },
        { id: 'first', q: 'The first option you offer a yearly account is…',
          choices: ['The same as last time, with sizes to confirm', 'A brand new design', 'The cheapest garment', 'A discount'], answer: 0, article: A.yearly, why: 'Make it effortless.' },
        { id: 'staff', q: 'A business hires new staff all year. You suggest…',
          choices: ['Sending sizes whenever someone joins, quoted the same day', 'Waiting a year', 'A discount', 'Nothing'], answer: 0, article: A.yearly, why: 'A simple reorder habit.' },
        { id: 'reply', q: 'A yearly account messages you. Reply…',
          choices: ['The same day', 'Next week', 'When convenient', 'Never'], answer: 0, article: A.yearly, why: 'They are worth many orders.' },
        { id: 'problem', q: 'Their order runs late. You…',
          choices: ['Tell June at once and keep them informed', 'Say nothing', 'Blame the supplier publicly', 'Offer a refund'], answer: 0, article: A.yearly, why: 'No surprises.' },
        { id: 'artwork', q: 'Why keep their artwork details on the job?',
          choices: ['So a reorder needs no hunting', 'For tax', 'For the newsletter', 'No reason'], answer: 0, article: A.yearly, why: 'Effortless reorders.' },
        { id: 'after', q: 'After each order you…',
          choices: ['Thank them and ask how it went', 'Send an invoice only', 'Nothing', 'Ask for a discount'], answer: 0, article: A.yearly, why: 'Relationship, not a sale.' },
        { id: 'where', q: 'Where are tax certificates?',
          choices: ['Certificates', 'Resources', 'Training', 'Playbook'], answer: 0, article: A.yearly, why: 'The Certificates page.' },
      ],
    },
    buffer: 7,
  },

  /* ── 6 ── */
  {
    key: 'am6', icon: '⭐', title: 'Reviews',
    goal: 'Answer every review well, handle the hard ones the right way, and never game them.',
    lessons: [{
      id: 'am6-reviews', article: A.reviews, minutes: 30, tags: 'reviews, reply, bad review, draft, june approves, review request, incentives',
      goals: ['Reply to a review within two days', 'Handle a bad review the right way', 'Know the rules on asking for reviews'],
      tryIt: [{ label: 'Reviews', href: '/admin/reviews' }],
      body:
`Reviews bring new customers. A good reply also shows future customers how we treat people.

**Replying**

- Reply to every review within two days
- Use the draft button for a start, then make it personal: thank them by first name, mention what we made, two to four sentences, signed by June
- June approves replies before they go live

Example: "Thank you so much, Keisha! We loved making the reunion shirts for your family, and the photos look amazing. See you at the next one! — June"

**A bad review**

- Tell June the same day, before anyone replies
- The reply: thank them, apologise for their experience without arguing, and invite them to message us so we can put it right
- Never argue in public, never share order details, and never offer a refund or a free order in a reply. Those are June's, in private

**Asking for reviews**

- Review requests are sent automatically after an order
- When a customer tells you they loved it, you may ask once, kindly: "That's so kind! If you have a minute, a review really helps a small shop like ours"
- Never offer anything in return for a review, and never write one yourself or ask anyone else to`,
    }],
    practice: [],
    quiz: {
      key: 'accounts-6', title: 'Module 6 quiz: reviews', minutes: 10,
      questions: [
        { id: 'time', q: 'Reply to a review within…',
          choices: ['Two days', 'Two weeks', 'A month', 'Never'], answer: 0, article: A.reviews, why: 'Every review, within two days.' },
        { id: 'draft', q: 'The draft button gives you…',
          choices: ['A start to make personal', 'The final reply', 'A discount', 'Nothing'], answer: 0, article: A.reviews, why: 'Always make it personal.' },
        { id: 'sign', q: 'Review replies are signed by…',
          choices: ['June', 'You', 'Nobody', 'The designer'], answer: 0, article: A.reviews, why: 'Signed by June.' },
        { id: 'approve', q: 'Who approves replies before they go live?',
          choices: ['June', 'The customer', 'Nobody', 'You'], answer: 0, article: A.reviews, why: 'June approves.' },
        { id: 'bad', q: 'A 2-star review. First?',
          choices: ['Tell June the same day, before replying', 'Reply defending the shop', 'Delete it', 'Ignore it'], answer: 0, article: A.reviews, why: 'June sees it first.' },
        { id: 'badreply', q: 'The reply to a bad review…',
          choices: ['Thanks them, apologises without arguing, invites them to message us', 'Argues the facts', 'Offers a refund publicly', 'Shares order details'], answer: 0, article: A.reviews, why: 'Calm and kind.' },
        { id: 'refund', q: 'May a review reply offer a free order?',
          choices: ['No; that is June\'s, in private', 'Yes', 'Only for 1-star', 'Always'], answer: 0, article: A.reviews, why: 'Never in public.' },
        { id: 'ask', q: 'A customer says they loved it. You may…',
          choices: ['Ask once, kindly, for a review', 'Offer 10% for a review', 'Write one for them', 'Ask daily'], answer: 0, article: A.reviews, why: 'Once, kindly, nothing in return.' },
        { id: 'incentive', q: 'May you offer a gift for a review?',
          choices: ['No, never', 'Yes', 'Only small gifts', 'Only to schools'], answer: 0, article: A.reviews, why: 'Never anything in return.' },
        { id: 'auto', q: 'Are review requests sent automatically?',
          choices: ['Yes, after an order', 'No, never', 'Only by June', 'Only on request'], answer: 0, article: A.reviews, why: 'The system asks.' },
      ],
    },
    buffer: 7,
  },

  /* ── 7 ── */
  {
    key: 'am7', icon: '⬆️', title: 'Upgrades that fit',
    goal: 'Offer past customers the upgrades that genuinely fit them, once, at the right moment.',
    lessons: [{
      id: 'am7-upgrades', article: A.upgrades, minutes: 35, tags: 'upgrades, embroidery, hoodies, signs, banners, cutouts, optional items',
      goals: ['Match an upgrade to a customer\'s history', 'Offer it as an optional item on the reorder', 'Offer once, and drop it on a no'],
      tryIt: [{ label: 'Open a quote and find the Upsell ideas box', href: '/admin/quotes' }],
      body:
`A customer who has ordered before trusts you. That makes an upgrade easy to offer, and easy to abuse. Only offer what fits.

**Upgrades that fit past customers**

- **Tees to embroidered polos** for a business that wants to look more professional
- **Hoodies** before winter for anyone who ordered tees in spring
- **Signs and banners** for a business opening a second location, a school event or a league's opening day
- **Big Head Cutouts** for senior night, graduation or a big game
- **A back print or sleeve** for a team that wants names, numbers or sponsors
- **More pieces** when the Upsell ideas box shows a price break they are close to

**How to offer it**

- Connect it to something in their history: "Your team loved the shirts. A lot of leagues add coach hoodies for the fall season"
- Put it on the reorder quote as an optional item, so they can tick it
- Use the numbers from the form or the Upsell ideas box, never a guess

**When not to**

- If they told you their budget is fixed
- If it would push the order past their date
- If it is not really better for them

Offer once. If they say no, drop it, and note it so nobody offers it again this season.`,
    }],
    practice: [],
    quiz: {
      key: 'accounts-7', title: 'Module 7 quiz: upgrades', minutes: 10,
      questions: [
        { id: 'biz', q: 'A business ordered tees. A fitting upgrade?',
          choices: ['Embroidered polos', 'Senior night cutouts', 'Field day banner', 'Reunion shirts'], answer: 0, article: A.upgrades, why: 'More professional workwear.' },
        { id: 'winter', q: 'A team ordered tees in spring. In autumn you might offer…',
          choices: ['Hoodies', 'Nothing ever', 'Graduation cutouts', 'A discount'], answer: 0, article: A.upgrades, why: 'Hoodies before winter.' },
        { id: 'opening', q: 'A business is opening a second location. Offer…',
          choices: ['Signs and banners', 'Reunion shirts', 'Field day shirts', 'Nothing'], answer: 0, article: A.upgrades, why: 'Openings need signage.' },
        { id: 'senior', q: 'A league\'s senior night is coming up. Offer…',
          choices: ['Big Head Cutouts', 'Polos', 'Door hangers', 'Nothing'], answer: 0, article: A.upgrades, why: 'Senior night suits cutouts.' },
        { id: 'how', q: 'Upgrades go on the reorder quote as…',
          choices: ['Optional items', 'Required items', 'Hidden lines', 'A separate invoice'], answer: 0, article: A.upgrades, why: 'They tick what they want.' },
        { id: 'connect', q: 'The best way to introduce an upgrade…',
          choices: ['Connect it to their history', 'A generic ad', 'A discount', 'Pressure'], answer: 0, article: A.upgrades, why: 'It fits them.' },
        { id: 'budget', q: 'They said their budget is fixed. You…',
          choices: ['Skip upgrades, except a price break that lowers their per-piece price', 'Offer everything', 'Add it anyway', 'Raise prices'], answer: 0, article: A.upgrades, why: 'Respect the budget.' },
        { id: 'no', q: 'They say no. You…',
          choices: ['Drop it and note it', 'Ask again next week', 'Discount it', 'Add it anyway'], answer: 0, article: A.upgrades, why: 'Offer once.' },
        { id: 'numbers', q: 'Upgrade prices come from…',
          choices: ['The form or the Upsell ideas box', 'A guess', 'Last year', 'A competitor'], answer: 0, article: A.upgrades, why: 'Never guess.' },
        { id: 'date', q: 'An upgrade would push the order past their date. You…',
          choices: ['Do not offer it', 'Offer it anyway', 'Promise rush', 'Hide the date'], answer: 0, article: A.upgrades, why: 'The date comes first.' },
      ],
    },
    buffer: 7,
  },

  /* ── 8 ── */
  {
    key: 'am8', icon: '📈', title: 'Quiet customers and your day',
    goal: 'Bring quiet customers back the right way, and run a day that keeps every account warm.',
    lessons: [{
      id: 'am8-quiet', article: A.quiet, minutes: 25, tags: 'quiet customers, win back, newsletter, campaign, daily routine, end of day, my stats',
      goals: ['Write to a quiet customer the right way', 'Know what never to do with a customer list', 'Plan an Account Manager\'s day'],
      tryIt: [{ label: 'My Day', href: '/admin/my-day' }, { label: 'My stats', href: '/admin/my-stats' }],
      body:
`Some customers order once and go quiet. A few kind words at the right time bring many of them back.

**Writing to a quiet customer**

- Look at their history first: what they ordered and when
- If their season or event is coming up, a reorder note (module 4) is the right message
- If not, one short personal note: thank them for their order, say what is new that fits them, and offer to help next time
- One note, then a follow-up date for their next likely season. No chasing

**What never to do**

- Never add anyone to the newsletter who did not sign up
- Never send a bulk email or text from your own account. Shop campaigns are June's, sent from the shop's own tools
- Never text a customer who has not agreed to texts
- Never contact anyone who said no

**A sample day**

- **My Day:** replies from customers, oldest first, within the hour
- **Follow-ups due:** reorder notes and follow-ups, each logged with the next date
- **This week's reorder notes:** accounts with a season or event in the next six weeks
- **Reviews:** reply drafts for June to approve
- **My Day again** before you finish
- **End-of-day note to June:** reorder notes sent, replies, reorders quoted and accepted, reviews answered, anything stuck, and your first task tomorrow

**Your numbers**

My stats shows your quotes, accepted orders and activity. Your targets are in lesson 1 of this course. Each week, look at which notes got replies and do more of what works.`,
    }],
    practice: [
      { key: 'do:accounts-messages', type: 'do', fact: 'messages', need: 10, minutes: 20,
        title: 'Send 10 customer messages', hint: 'Emails or texts to customers from the back office, reorder notes included. They are logged for you. This ticks itself at 10.' },
    ],
    quiz: {
      key: 'accounts-8', title: 'Module 8 quiz: quiet customers and your day', minutes: 10,
      questions: [
        { id: 'first', q: 'Before writing to a quiet customer you…',
          choices: ['Look at their history', 'Add them to the newsletter', 'Send a discount', 'Text them'], answer: 0, article: A.quiet, why: 'Know them first.' },
        { id: 'one', q: 'How many notes to a quiet customer?',
          choices: ['One, then a follow-up date for their next season', 'Weekly', 'Daily', 'None'], answer: 0, article: A.quiet, why: 'No chasing.' },
        { id: 'news', q: 'May you add a past customer to the newsletter?',
          choices: ['Only if they signed up', 'Yes, always', 'Yes, if quiet', 'Yes, with a discount'], answer: 0, article: A.quiet, why: 'Only sign-ups.' },
        { id: 'bulk', q: 'May you send a bulk email from your own account?',
          choices: ['No; campaigns are June\'s, from the shop\'s tools', 'Yes', 'Only on Fridays', 'Only to schools'], answer: 0, article: A.quiet, why: 'Campaigns are June\'s.' },
        { id: 'text', q: 'May you text a customer who has not agreed to texts?',
          choices: ['No', 'Yes', 'Once', 'Only businesses'], answer: 0, article: A.quiet, why: 'Texts need their agreement.' },
        { id: 'day', q: 'What comes first in your day?',
          choices: ['My Day: replies, oldest first', 'Reviews', 'Newsletter', 'Research'], answer: 0, article: A.quiet, why: 'People waiting first.' },
        { id: 'week', q: 'This week\'s reorder notes are for accounts with…',
          choices: ['A season or event in the next six weeks', 'Nothing coming up', 'Last year only', 'New leads'], answer: 0, article: A.quiet, why: 'Look ahead six weeks.' },
        { id: 'eod', q: 'Your end-of-day note includes…',
          choices: ['Reorder notes, replies, reorders, reviews, what is stuck, tomorrow\'s first task', 'Only hours', 'Nothing', 'Screenshots'], answer: 0, article: A.quiet, why: 'A clear list for June.' },
        { id: 'stats', q: 'Where are your own numbers?',
          choices: ['My stats', 'Finances', 'Resources', 'Nowhere'], answer: 0, article: A.quiet, why: 'My stats.' },
        { id: 'no', q: 'A customer said "no more emails". You…',
          choices: ['Never contact them again, and note it', 'One last offer', 'Text instead', 'Ask why'], answer: 0, article: A.quiet, why: 'Never contact anyone who said no.' },
      ],
    },
    buffer: 7,
  },
];

const FINAL = {
  floating: 15,
  quiz: {
    key: 'accounts-final', title: 'Final exam: Account Manager', minutes: 25,
    questions: [
      { id: 'f1', q: 'A league ordered spring uniforms in March. When do you write about fall?', choices: ['Mid-July to early August', 'December', 'The day before', 'Never'], answer: 0, article: A.calendar, why: '4 to 6 weeks before fall sign-ups.' },
      { id: 'f2', q: 'A school ordered field day shirts in May. When next?', choices: ['Late March or early April next year', 'June', 'Tomorrow', 'Never'], answer: 0, article: A.calendar, why: 'Same season, 4 to 6 weeks before.' },
      { id: 'f3', q: 'An order is done. You set…', choices: ['A follow-up date for their next need', 'Nothing', 'A discount', 'A newsletter sign-up'], answer: 0, article: A.calendar, why: 'My Day brings them back.' },
      { id: 'f4', q: 'Before writing, you check their history on…', choices: ['Customers', 'Resources', 'Training', 'Playbook'], answer: 0, article: A.history, why: 'Every order is there.' },
      { id: 'f5', q: 'The PTO chair who ordered last year has moved on. You…', choices: ['Find the new contact and welcome them', 'Write to the old one', 'Give up', 'Text the school'], answer: 0, article: A.yearly, why: 'Volunteers change.' },
      { id: 'f6', q: 'A church\'s certificate expired. You…', choices: ['Ask for the new one before quoting; June approves it', 'Untick tax', 'Charge tax silently', 'Ignore it'], answer: 0, article: A.yearly, why: 'Never take tax off yourself.' },
      { id: 'f7', q: 'They ran short of XL last year. You…', choices: ['Suggest a few extra XL', 'Say nothing', 'Remove XL', 'Charge more'], answer: 0, article: A.history, why: 'Help them avoid it.' },
      { id: 'f8', q: 'Last year\'s proof came late. You…', choices: ['Fix it and say so', 'Hope they forgot', 'Blame someone', 'Discount'], answer: 0, article: A.history, why: 'Show you learned.' },
      { id: 'f9', q: 'The three parts of a reorder note:', choices: ['What we made, their season, one easy step', 'Price, discount, deadline', 'Logo, tax, address', 'None'], answer: 0, article: A.reorder, why: 'Specific, timely, easy.' },
      { id: 'f10', q: 'Which reorder note is best?', choices: ['"Need shirts?"', '"Hi Ms. Patel, last spring we made your royal blue field day shirts. With field day in May, the same again or something new?"', 'A price list', '"Order now for 10% off"'], answer: 1, article: A.reorder, why: 'Specific and personal.' },
      { id: 'f11', q: 'May a reorder note promise a date?', choices: ['No', 'Yes', 'Only for leagues', 'Always'], answer: 0, article: A.reorder, why: 'Check timing when they reply.' },
      { id: 'f12', q: 'No reply to a reorder note. How many follow-ups?', choices: ['Two at most', 'Weekly', 'None', 'Daily'], answer: 0, article: A.reorder, why: 'Then a date for next season.' },
      { id: 'f13', q: 'The reorder quote starts from…', choices: ['Their last order', 'A blank form', 'The cheapest tee', 'A competitor'], answer: 0, article: A.reorder, why: 'So it matches.' },
      { id: 'f14', q: 'The reorder adds new player names. A new proof is…', choices: ['Needed, approved in writing', 'Not needed', 'Optional', 'June\'s guess'], answer: 0, article: A.reorder, why: 'Artwork changed.' },
      { id: 'f15', q: 'The reorder is priced at…', choices: ['Today\'s prices, by the form', 'Last year\'s', 'What you type', 'A discount'], answer: 0, article: A.reorder, why: 'The form prices it.' },
      { id: 'f16', q: 'The first option for a yearly account:', choices: ['The same as last time, sizes to confirm', 'A new design', 'The cheapest', 'A discount'], answer: 0, article: A.yearly, why: 'Effortless.' },
      { id: 'f17', q: 'A business hires all year. Suggest…', choices: ['Send sizes when someone joins; quoted the same day', 'Wait a year', 'A bulk discount', 'Nothing'], answer: 0, article: A.yearly, why: 'A simple habit.' },
      { id: 'f18', q: 'A yearly account messages. Reply…', choices: ['The same day', 'Next week', 'Whenever', 'Never'], answer: 0, article: A.yearly, why: 'Worth many orders.' },
      { id: 'f19', q: 'A 5-star review. Reply within…', choices: ['Two days', 'A month', 'Never', 'A year'], answer: 0, article: A.reviews, why: 'Every review.' },
      { id: 'f20', q: 'A review reply is…', choices: ['Personal, 2 to 4 sentences, signed by June, approved by June', 'A template', 'Signed by you', 'A discount'], answer: 0, article: A.reviews, why: 'Personal and approved.' },
      { id: 'f21', q: 'A 1-star review. First?', choices: ['Tell June the same day', 'Reply at once', 'Delete', 'Argue'], answer: 0, article: A.reviews, why: 'June first.' },
      { id: 'f22', q: 'The reply to a bad review never…', choices: ['Argues or offers a refund in public', 'Thanks them', 'Apologises', 'Invites them to message'], answer: 0, article: A.reviews, why: 'Calm and private.' },
      { id: 'f23', q: 'May you offer a discount for a review?', choices: ['Never', 'Yes', 'Small ones', 'For schools'], answer: 0, article: A.reviews, why: 'Nothing in return.' },
      { id: 'f24', q: 'A customer loved their order. You may…', choices: ['Ask once, kindly, for a review', 'Write one for them', 'Pay them', 'Ask daily'], answer: 0, article: A.reviews, why: 'Once, kindly.' },
      { id: 'f25', q: 'A team ordered tees in spring. An autumn upgrade:', choices: ['Hoodies', 'Graduation cutouts', 'Door hangers', 'Nothing'], answer: 0, article: A.upgrades, why: 'Before winter.' },
      { id: 'f26', q: 'A business opens a second location. Offer…', choices: ['Signs and banners', 'Reunion shirts', 'Field day shirts', 'Nothing'], answer: 0, article: A.upgrades, why: 'Openings need signs.' },
      { id: 'f27', q: 'Upgrades go on the quote as…', choices: ['Optional items', 'Required items', 'Hidden lines', 'Notes'], answer: 0, article: A.upgrades, why: 'They tick what they want.' },
      { id: 'f28', q: 'They said no to hoodies. You…', choices: ['Drop it and note it', 'Ask next week', 'Discount', 'Add anyway'], answer: 0, article: A.upgrades, why: 'Offer once.' },
      { id: 'f29', q: 'A quiet customer, no season coming. You send…', choices: ['One short personal note, then a follow-up date', 'Weekly emails', 'A newsletter sign-up', 'Texts'], answer: 0, article: A.quiet, why: 'No chasing.' },
      { id: 'f30', q: 'May you add quiet customers to the newsletter?', choices: ['Only if they signed up', 'Yes', 'With a discount', 'Always'], answer: 0, article: A.quiet, why: 'Only sign-ups.' },
      { id: 'f31', q: 'May you email all past customers at once from your account?', choices: ['No; campaigns are June\'s', 'Yes', 'Only once', 'Only schools'], answer: 0, article: A.quiet, why: 'Campaigns are June\'s.' },
      { id: 'f32', q: 'A customer said "please stop". You…', choices: ['Never contact them again, and note it', 'One last offer', 'Text', 'Call'], answer: 0, article: A.quiet, why: 'Never contact anyone who said no.' },
      { id: 'f33', q: 'Who decides a discount for a loyal customer?', choices: ['June', 'You', 'The customer', 'Nobody'], answer: 0, article: A.job, why: 'Discounts are June\'s.' },
      { id: 'f34', q: 'What does the system send about 90 days after payment?', choices: ['A reorder email', 'A refund', 'A survey', 'Nothing'], answer: 0, article: A.job, why: 'The automatic nudge.' },
      { id: 'f35', q: 'A new customer\'s first order is done. They are now…', choices: ['Yours', 'Lead Generation\'s', 'Nobody\'s', 'The designer\'s'], answer: 0, article: A.job, why: 'Past customers are yours.' },
      { id: 'f36', q: 'You learn a school\'s new principal\'s name. You…', choices: ['Log it on their lead', 'Remember it', 'Ignore it', 'Email them a promo'], answer: 0, article: A.history, why: 'The account keeps it.' },
      { id: 'f37', q: 'What comes first in your day?', choices: ['My Day: replies, oldest first', 'Reviews', 'Upgrades', 'Research'], answer: 0, article: A.quiet, why: 'People waiting first.' },
      { id: 'f38', q: 'Each week you look ahead…', choices: ['Six weeks', 'One day', 'Two years', 'Not at all'], answer: 0, article: A.calendar, why: 'This week\'s notes.' },
      { id: 'f39', q: 'An upgrade would push the order past their date. You…', choices: ['Do not offer it', 'Offer anyway', 'Promise rush', 'Hide it'], answer: 0, article: A.upgrades, why: 'The date comes first.' },
      { id: 'f40', q: 'Who reads your first five reorder notes?', choices: ['June', 'Nobody', 'The customer', 'The designer'], answer: 0, article: A.reorder, why: 'June signs off.' },
    ],
  },
  signoffs: [
    { key: 'signoff:accounts-ready', type: 'signoff', minutes: 0,
      title: 'Ready to look after accounts on their own', hint: 'June signs this off after a week of reorder notes, reorder quotes and review replies.' },
  ],
};

const W = (f) => `/assets/images/work/${f}.jpg`;
const LESSON_EXTRAS = {
  'am1-job': { images: [{ src: W('storefront-lincoln-ave'), alt: 'The June\'s Tees shop on Lincoln Avenue' }] },
  'am2-calendar': { images: [{ src: W('kindergarten-back-to-school-tee'), alt: 'A back-to-school class shirt' }] },
  'am3-history': { images: [{ src: W('embroidered-business-apparel'), alt: 'Embroidered business apparel: a classic reorder' }] },
  'am4-reorder': { images: [{ src: W('youth-team-shirts'), alt: 'A youth team in their custom shirts' }] },
  'am5-yearly': { images: [{ src: W('corporate-anniversary-shirts'), alt: 'Anniversary shirts for a yearly business account' }] },
  'am6-reviews': { images: [{ src: W('family-reunion-bulk-order'), alt: 'A family reunion order' }] },
  'am7-upgrades': { images: [{ src: W('logo-tee-and-cap-set'), alt: 'A tee and cap set: an upgrade that fits' }, { src: W('custom-printed-banner'), alt: 'A custom banner' }] },
  'am8-quiet': { images: [{ src: W('barber-business-shirts'), alt: 'Staff shirts for a local business' }] },
};
const PAGES = require('./sales-accounts-pages');
for (const l of MODULES.flatMap((m) => m.lessons)) {
  Object.assign(l, LESSON_EXTRAS[l.id] || {});
  l.pages = PAGES[l.id] || [{ from: null, checks: [] }];
  l.checks = l.pages.flatMap((pg) => pg.checks);
}

module.exports = { key: 'sales-accounts', title: 'Account Manager', track: 'sales', articles: A, glossary: GLOSSARY, modules: MODULES, final: FINAL };
