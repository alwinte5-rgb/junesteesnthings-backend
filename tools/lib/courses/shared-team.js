'use strict';

/* Team basics: the module every non-sales course opens with (owner,
   2026-10-09: "working cohesively with the team should be on all of the
   course and basic communication with the customers").

   One module object, shared by reference: a course lists it as its first
   module. The academy registers its quiz and its articles once however many
   courses use it (courses/index.js dedupes by identity), so the lessons are
   one set of playbook articles the owner edits in one place.

   The Sales course teaches the same ground in its own words (sales-core s1,
   s2), so salespeople do not take this module twice. */

const A = {
  chat:      'Team basics 1: Team chat and working on your own',
  questions: 'Team basics 2: Asking, handing over, and what is June\'s',
  customers: 'Team basics 3: Talking to customers',
};

const q = (text, choices, answer, why) => ({ q: text, choices, answer, why });

const LESSONS = [
  {
    id: 'team-chat', article: A.chat, minutes: 15, tags: 'team chat, channels, direct, alerts, async, status, end of day, remote, working hours',
    goals: ['Pick the right place in Team chat for a message', 'Give a status update with a time in it', 'Know where the answer to a question already lives'],
    tryIt: [{ label: 'Open Team chat', href: '/admin/team-chat' }],
    body:
`We are a small team in different places and often different time zones. Most of the time nobody is looking over your shoulder, and nobody can see what you are doing unless you write it down. This lesson is how we stay one team anyway.

**Team chat: channels and Direct**

Team chat has two kinds of conversation:

- **Channels**, like # Everyone and the one for your part of the team. Use them for things more than one person needs: "the banner files for the 5K are in the job", "the site is slow, I am checking". June sees every channel
- **Direct with June**: just the two of you. Use it for questions about your pay or your hours, anything about a customer you are worried about, and anything you would not say in front of everyone

If a message has been unread for 10 minutes, the person gets one email about it. You can switch your own alert emails off on the Team chat page, but then check Team chat at the start of every hour you work.

**Status with a time in it**

"Working on it" tells nobody anything. A good update says what you did, what is next, and when you will update again:

- "Proof for the soccer shirts is done and sent to June. Starting the banner next; I will post it here by 3pm"
- "Stuck on the reunion logo: the file is a screenshot. I asked sales for the original and will check back at 11"

If you said a time, keep it, even if the news is "not done yet, here is why, new time is 4pm".

**One place for each answer**

Before you ask, look where the answer lives:

- **The Playbook**: how we do things, ready-made replies, and these lessons. Type a question in plain words
- **The job page**: everything about one order. Notes about a job go on the job, not only in chat, so the next person finds them
- **Resources**: the tools we use and where each login is

If you had to ask and the answer is not in the Playbook, say so. June may add it, so the next person does not have to ask.

**Start and end of your day**

- **Start:** open My Day and Team chat. Read anything new before you start your own work
- **End:** write a short note in your channel: what you finished, what is waiting and on whom, and what you will do first next time. Someone else may need to pick it up before you are back`,
    pages: [
      { from: null, checks: [
        q('You want to tell the team the banner files are ready. Where?', ['Direct with June', 'Your team channel', 'An email to everyone'], 1, 'Things more than one person needs go in a channel.'),
        q('A question about your own pay goes…', ['In # Everyone', 'Direct with June', 'On a job page'], 1, 'Pay, hours and worries are just between you and June.'),
      ] },
      { from: 'Status with a time in it', checks: [
        q('Which is a useful update?', ['"Working on it"', '"Proof sent to June; banner next, posted here by 3pm"', '"Busy"'], 1, 'What you did, what is next, and when you will update again.'),
        q('You said 3pm and you are not done. At 3pm you…', ['Say nothing until it is done', 'Post "not done yet, here is why, new time 4pm"', 'Delete the first message'], 1, 'Keep the time you gave, even when the news is a delay.'),
      ] },
      { from: 'One place for each answer', checks: [
        q('A note about one order belongs…', ['Only in Team chat', 'On the job page', 'In your own notebook'], 1, 'The job page is where the next person will look.'),
        q('What do you write at the end of your day?', ['Nothing', 'What you finished, what is waiting and on whom, and what is first next time', 'Your hours only'], 1, 'Someone may need to pick it up before you are back.'),
      ] },
    ],
  },
  {
    id: 'team-questions', article: A.questions, minutes: 15, tags: 'asking questions, hand off, handover, escalate, never guess, june decides, discounts, refunds',
    goals: ['Ask a question June can answer in one reply', 'Hand work to someone else so nothing is lost', 'Name the decisions that are always June\'s'],
    tryIt: [{ label: 'Search the Playbook', href: '/admin/playbook' }],
    body:
`Asking is never wrong. Guessing can be: a wrong guess reaches a customer, a printer or the books, and costs far more than the minute it takes to ask.

**A question June can answer in one reply**

Write it so June does not have to ask you anything back:

- **What it is about:** the job number or the page, and a link if there is one
- **What you already checked:** "the Playbook says X, but this customer wants Y"
- **What you think:** "I would send option A because…". It is fine to be wrong; it shows how you are thinking
- **When you need it by:** "the proof is due at 2pm"

Bad: "Hey, quick question about the shirts?". Good: "Job 4F2K: the customer sent a 300px logo for a 12-inch back print. I asked for the original; they do not have one. Redraw it as a $30 setup, or ask sales to quote that first? Proof is due tomorrow at noon."

If a question goes back and forth three times in chat, ask for a quick call instead, then write down what was decided on the job page.

**Handing work over**

When you stop and someone else carries on (end of your day, time off, a job moving from sales to design), leave a handover nobody has to ask about:

- What is done, and where it is
- What is still open, and who it is waiting on
- Any promise made to a customer: a date, a time to call back, a second option
- Where the files are

A job that is "half done" with no note is a job that gets done twice, or not at all.

**What is always June's**

Some decisions are June's whatever your job is. Bring them to her, Direct, the same day:

- Discounts, free items, price matches, and refunds
- A delivery date the board and the stock do not already show
- Logos, characters or brands the customer does not own
- An angry or upset customer, or anything said about a bad review or a complaint
- Anything that spends the shop's money that you were not already told to spend
- Anything you are not sure is allowed

If a customer is waiting, tell them you are checking and when you will reply, then ask June. Never say yes and hope.`,
    pages: [
      { from: null, checks: [
        q('Which question can June answer in one reply?', ['"Quick question about the shirts?"', 'The job number, what you checked, what you think, and when you need it', '"Can you call me?"'], 1, 'Give her everything she needs to answer once.'),
        q('A question has gone back and forth three times in chat. Next?', ['Keep typing', 'Ask for a quick call, then write the decision on the job page', 'Give up'], 1, 'Long threads become a short call, and the decision gets written down.'),
      ] },
      { from: 'Handing work over', checks: [
        q('A good handover includes…', ['Only the files', 'What is done, what is open and on whom, promises made, and where the files are', 'Nothing; they can work it out'], 1, 'Nobody should have to ask what you meant.'),
        q('You promised a customer a second option by Friday, then went off shift. The handover…', ['Does not mention it', 'Says it, with the date', 'Is not needed'], 1, 'Promises to customers are the first thing a handover lists.'),
      ] },
      { from: 'What is always June\'s', checks: [
        q('A customer asks you for 10% off. You…', ['Agree', 'Say you will check and reply by a set time, then ask June', 'Refuse'], 1, 'Discounts are always June\'s.'),
        q('A customer is upset about a late order. You…', ['Argue', 'Tell June the same day', 'Ignore it'], 1, 'Upset customers and complaints go to June.'),
      ] },
    ],
  },
  {
    id: 'team-customers', article: A.customers, minutes: 15, tags: 'customers, replies, tone, plain english, reply times, never promise, permission, photos, privacy',
    goals: ['Write a short, clear reply a customer understands the first time', 'Know how fast customers expect an answer', 'Keep customers\' details and photos safe'],
    body:
`Whatever your job, customers are why it exists. Some roles write to customers every day; others almost never. When you do, the same rules apply.

**How we sound**

Friendly, local, and clear. Like a helpful person at a small Chicago shop, not a big company and not a robot.

- Use their first name, and thank them
- Put the answer first, then any detail
- Short sentences, about 20 words or fewer. Plain words; no slang or jokes that may not travel
- One message with everything in it beats three half-messages
- End with the one next step: "Reply 'approved' and we will print", "Here is the link to pay the deposit"

English does not have to be perfect. Clear beats clever. Read it once out loud before you send it. The Playbook has ready-made replies: copy one, then make it personal.

**How fast**

Customers expect a reply within the hour during your shift. If you cannot answer yet, reply anyway: say you are checking and give a time, then keep it. A quick "I am checking with the printer and will reply by 3pm" is far better than a perfect answer tomorrow.

**What we never promise**

- A delivery date without checking the board and the stock
- A discount, a free item or a price match
- Printing a logo the customer does not own
- An exact color match without a Pantone number
- A refund

Those are June's. "Let me check that for you and reply by 4pm" is always a good answer.

**Their details and their photos**

- Customers' names, emails, phones and addresses stay in our system. Never paste them into ChatGPT or any AI tool, and never copy them to your own files
- Send messages from the job page or the Playbook tools, not from your own email or phone. That keeps a record, and while you are in training June checks them first
- A customer's photo, name or design is never posted anywhere without their written permission. Children's faces need a parent's OK
- If a customer messages you somewhere unexpected (your own social account, your own email), do not carry on there. Point them to jtees.net and tell June`,
    pages: [
      { from: null, checks: [
        q('What goes first in a reply?', ['A long greeting', 'The answer', 'Our policies'], 1, 'Answer first, then any detail.'),
        q('Your English is not perfect. What matters most?', ['Fancy words', 'Clear, short sentences', 'Long messages'], 1, 'Clear beats clever.'),
      ] },
      { from: 'How fast', checks: [
        q('You cannot answer a customer yet. You…', ['Wait until you can', 'Reply now: you are checking, and when you will reply', 'Forward it to them later'], 1, 'Reply within the hour, with a time, then keep it.'),
        q('A customer asks for an exact color match. Without a Pantone number you…', ['Promise it', 'Do not promise an exact match', 'Pick any red'], 1, 'An exact color match needs a Pantone number.'),
      ] },
      { from: 'Their details and their photos', checks: [
        q('May you paste a customer\'s email into ChatGPT to help write a reply?', ['Yes', 'No. Write "the customer" instead', 'Only their phone'], 1, 'Customer details never go into any AI tool.'),
        q('A customer DMs your own Instagram about an order. You…', ['Carry on there', 'Point them to jtees.net and tell June', 'Block them'], 1, 'Orders run through our system, never your own accounts.'),
      ] },
    ],
  },
];
for (const l of LESSONS) l.checks = l.pages.flatMap((pg) => pg.checks);

const MODULE = {
  key: 'team', icon: '🤝', title: 'Working as one team, and talking to customers',
  goal: 'Know how we keep each other informed, when to ask, what is June\'s, and how to write to a customer.',
  lessons: LESSONS,
  practice: [],
  quiz: {
    key: 'team-1', title: 'Team basics quiz', minutes: 10,
    questions: [
      { id: 'channel', q: 'The site looks broken and you are checking it. Where do you say so?',
        choices: ['Nowhere until it is fixed', 'Your team channel (or # Everyone), with when you will update', 'An email to a customer', 'Your own social media'],
        answer: 1, article: A.chat, why: 'Things more than one person needs go in a channel, with a time for the next update.' },
      { id: 'direct', q: 'Which belongs in Direct with June rather than a channel?',
        choices: ['"Banner files are in the job"', 'A question about your hours or pay', '"Good morning, starting now"', '"Proof is sent"'],
        answer: 1, article: A.chat, why: 'Pay, hours and worries are just between you and June.' },
      { id: 'status', q: 'Which status update is best?',
        choices: ['"Busy"', '"Working on it"', '"Logo redrawn; proof next, posted here by 2pm"', '"Will update later"'],
        answer: 2, article: A.chat, why: 'What you did, what is next, and when you will update again.' },
      { id: 'missed', q: 'You promised an update by 3pm and are not finished. At 3pm you…',
        choices: ['Stay quiet until it is done', 'Post that it is not done, why, and a new time', 'Mark it done anyway', 'Ask someone else to finish it'],
        answer: 1, article: A.chat, why: 'Keep the time you gave, even when the news is a delay.' },
      { id: 'where', q: 'A note about one order should be written…',
        choices: ['Only in Team chat', 'On that job\'s page', 'In your own notebook', 'In an email to yourself'],
        answer: 1, article: A.chat, why: 'The job page is where the next person will look.' },
      { id: 'goodq', q: 'What makes a question easy for June to answer?',
        choices: ['Keeping it vague so she can choose', 'The job or page, what you checked, what you think, and when you need it', 'Asking it three times', 'Sending it at night'],
        answer: 1, article: A.questions, why: 'One message with everything means one reply back.' },
      { id: 'handover', q: 'You go off shift with a promise to call a customer at 10am. Your handover…',
        choices: ['Leaves it out', 'Says it plainly, with the time and the customer\'s job', 'Is not needed', 'Goes to the customer'],
        answer: 1, article: A.questions, why: 'Promises made to customers are the first thing a handover lists.' },
      { id: 'june', q: 'Which decision is always June\'s?',
        choices: ['Which Playbook reply to copy', 'A refund, discount or price match', 'Which file format to export', 'When to post your end-of-day note'],
        answer: 1, article: A.questions, why: 'Money decisions like refunds, discounts and price matches are June\'s.' },
      { id: 'reply', q: 'A customer writes during your shift and you need to check something first. You…',
        choices: ['Reply tomorrow with the full answer', 'Reply now that you are checking, and when you will answer', 'Wait for June to reply', 'Ignore it'],
        answer: 1, article: A.customers, why: 'Reply within the hour, even if the answer is "checking, back by 3pm".' },
      { id: 'privacy', q: 'You want ChatGPT to polish a reply to a customer. What do you paste?',
        choices: ['The whole email thread with their address', 'Your draft, with "the customer" in place of their name and details', 'Their phone number so it can sign off', 'A screenshot of the job page'],
        answer: 1, article: A.customers, why: 'Customer details never go into any AI tool.' },
    ],
  },
  buffer: 7,
};

module.exports = { MODULE, articles: A };
