'use strict';

/* The applicant test for the part-time software sales agent, in the same shape
   as the sales one in hiring.js (see ROLES there). Everything else is shared by
   every role.

   What the job is: finding and signing up paying customers for the owner's own
   apps — COS Creator Studio (social media posting and AI content for creators
   and small businesses: Free, Pro $19, Platinum $39, Studio $99 a month),
   CartBook (cookbooks for food creators) and a business dashboard for
   contractors and salons. Low-priced monthly subscriptions, so the work is
   volume: find the right small businesses and creators, start a conversation,
   book or run a short demo, follow up, and sign them up honestly. Pay is
   $3.50 an hour plus 10% of a new customer's payments for their first 6
   months (owner, 2026-10-16) — the margin cannot carry more. */

const MINUTES = 30;

const INTRO = `This test takes about ${MINUTES} minutes. It is the same kind of work you would do for us every week:
finding the right customers for our apps, starting conversations, handling questions and objections,
and following up until they decide. Everything is written: you do not need to use the apps.
Please do not use ChatGPT or other AI tools to write your answers: we want to see how you think and write.`;

const PARTS = {
  choice: { label: 'Part 1: Sales judgment', note: '8 questions, about 6 minutes. Pick what you would really do.' },
  craft: { label: 'Part 2: Selling our apps', note: 'About 18 minutes. Write exactly what you would send or say.' },
  initiative: { label: 'Part 3: Initiative', note: 'About 4 minutes. There is no single right answer; we want to see how you think.' },
  bonus: { label: 'Part 4: Bonus', note: 'Optional, about 3 minutes. This can change the direction of your interview.' },
};

const WEIGHTS = { choice: 25, craft: 50, initiative: 25 };

const MULTIPLE_CHOICE = [
  { id: 'fit', q: 'Who is the best first prospect for COS Creator Studio, our social media posting and AI content app?',
    choices: ['A large company with its own marketing team', 'A small business or creator who posts on social media but irregularly, and does it all themselves',
      'Someone who does not use social media', 'Anyone with an email address'],
    answer: 1, why: 'COS saves time for people doing their own posting. Big teams already have tools; people who do not post do not need it.' },
  { id: 'spam', q: 'You found 500 business emails online. What do you do with them?',
    choices: ['Send all 500 the same message today', 'Buy another list to make it 5,000',
      'Pick the ones who clearly fit, look at each one first, and send a short personal message that mentions something real about them',
      'Add them all to a newsletter without asking'],
    answer: 2, why: 'Mass messages get ignored, reported as spam and can break the law. A few personal, relevant messages win more customers.' },
  { id: 'discount', q: 'A prospect says: "I will sign up today if you give me 50% off for a year." What do you do?',
    choices: ['Agree, a sale is a sale', 'Say we never discount',
      'Offer only what our trial and discount rules allow, and bring anything more to the owner before promising it',
      'Offer 75% off to be safe'],
    answer: 2, why: 'Our prices have thin margins. Agents use the approved offers only; anything else is the owner\'s decision.' },
  { id: 'promise', q: 'A prospect asks if COS can post to a platform it does not support yet. What do you say?',
    choices: ['"Yes" — they will find out later', '"It will be added next week"',
      '"Not today. Here is what it does support, and I will pass your request to the team." Then actually pass it on',
      'Change the subject'],
    answer: 2, why: 'A false promise becomes a refund, a cancellation and a bad review. Honest answers and real feedback build trust.' },
  { id: 'demo', q: 'What makes a short demo call most likely to end in a sign-up?',
    choices: ['Showing every feature for 45 minutes', 'Reading the pricing page aloud',
      'Asking first what they post and what takes them the most time, then showing only the parts that solve that, and ending with a clear next step',
      'Letting them talk about anything'],
    answer: 2, why: 'People buy the solution to their own problem. Discovery first, a focused demo, then a clear ask.' },
  { id: 'followup', q: 'A prospect had a good demo but did not sign up. What is the best follow-up?',
    choices: ['Never contact them again', 'Message every day until they answer',
      'A short follow-up within 2 days with a recap of what solved their problem and one easy next step, then a couple more spaced out, logged in our tracker',
      'Send a long list of every feature'],
    answer: 2, why: 'Most sales come after several follow-ups. Spaced, useful, logged follow-ups win without annoying anyone.' },
  { id: 'quality', q: 'Which customer is worth more to us?',
    choices: ['One who signs up with a big discount and cancels after a month', 'One who signs up at full price, uses the app every week and stays for a year',
      'They are the same: one sign-up each', 'Whoever signed up first'],
    answer: 1, why: 'Subscriptions earn over time. A customer who stays is worth many who cancel, which is why commission follows their payments.' },
  { id: 'data', q: 'A prospect sends you their login so you can "set it up for them". What do you do?',
    choices: ['Log in and set it up', 'Save the password for later',
      'Do not use or keep their password: walk them through it on a screen share instead, or ask the owner how we handle setup',
      'Share it with the team chat'],
    answer: 2, why: 'Customer passwords are never ours to hold. Screen-share help keeps them in control and keeps us safe.' },
];

const WRITTEN = [
  { id: 'outreach', part: 'craft', minutes: 5, label: 'First message',
    prompt: 'You found a small Chicago bakery on Instagram. They post twice a month, the photos are good but the captions are short, and their last post was 3 weeks ago. Write the first direct message you would send them to start a conversation about COS Creator Studio (it schedules posts to several platforms and helps write captions and make graphics with AI).',
    rubric: 'Short (a few lines), personal and specific to this bakery (mentions something real: their photos, the gap in posting), leads with their problem (time, consistency) rather than a feature list, no pressure, no false claims, ends with one easy question or a low-effort next step (a 10-minute look, a free account). Long, generic, pushy or copy-paste pitches score 2 or lower.',
    model: "Hi! Your croissant photos are gorgeous, honestly some of the best I've seen from a Chicago bakery. I noticed posts come every couple of weeks, which I'm guessing is because there's no time between bakes. I work with COS Creator Studio: you can plan a month of posts in one sitting, and it helps write the captions. Would a free account be useful, or a 10-minute look at how it would work for you?",
  },
  { id: 'objection', part: 'craft', minutes: 5, label: 'Handle the objection',
    prompt: 'After a demo, a hair salon owner says: "It looks nice, but I already use Canva and post from my phone. And $39 a month is a lot for a small salon." Write your reply exactly as you would say it.',
    rubric: 'Acknowledges and agrees where fair (Canva is good; budget matters), asks or uses what they learned in discovery, shows the specific value over Canva and the phone (scheduling ahead to several platforms, captions, time saved, consistency that brings bookings), offers a cheaper fitting plan (Pro $19 or Free) instead of a discount, no pressure and no false claims, ends with a clear, easy next step. Arguing, discounting without approval or ignoring the price concern scores low.',
    model: "That makes sense, and Canva is great, so keep using it for designs. The difference is time: right now each post means opening Canva, then your phone, writing the caption and posting it, on a busy day. With COS you plan a whole week in one sitting and it posts for you, to Instagram and Facebook at the same time. You said posting is the first thing that slips when you're busy, and that's exactly what it fixes.\n\nOn price: you don't need Platinum. Pro is $19 a month and covers what you showed me you need. Or start on the free plan this week, schedule next week's posts, and see if it saves you the time. Want me to help you set up the first week now?",
  },
  { id: 'followup', part: 'craft', minutes: 4, label: 'Follow up',
    prompt: 'A food blogger had a demo of CartBook (it turns their recipes into a cookbook app their followers can subscribe to) 5 days ago. They said "sounds great, let me think about it" and have not replied since. Write your follow-up message.',
    rubric: 'Short and friendly, recalls something specific from the demo and the value to them, makes it easy (one clear next step or a simple question), no guilt or pressure, and says they will not be chased forever. Generic "just checking in" messages score 2.',
    model: "Hi Maria, I hope the week's going well! I keep thinking about your soup series. Those 40 recipes would make a lovely first cookbook, and your followers keep asking for them in one place. If it helps, I can set up a draft with 5 of them so you can see how it looks before deciding anything. Want me to? If now's not the right time, no problem at all, just tell me and I'll check back next month.",
  },
  { id: 'plan', part: 'craft', minutes: 3, label: 'Your week',
    prompt: 'You have 20 hours this week to find new customers for COS Creator Studio. Tell us where you would look, how many people you would contact and how, and how you would track it. Be specific.',
    rubric: 'Concrete and realistic: names specific places to find good-fit prospects (Instagram and Facebook local businesses, creator communities, groups where small owners ask about posting), personal outreach rather than mass messages, realistic numbers (for example 15-30 personal messages a day), time for follow-ups and demos, and logging every contact and next step in a tracker. Measures replies, demos and sign-ups. Vague "use social media" or "send many emails" scores 1-2.',
    model: "Mon-Tue (8 h): build a list of 80 good fits: Chicago salons, bakeries, gyms and boutiques on Instagram that post irregularly, plus creators in small-business Facebook groups. Write down one real detail for each.\nWed-Thu (8 h): 25 personal messages a day, each mentioning that detail. Reply to every answer the same day and book short demos.\nFri (4 h): run demos, follow up with everyone from last week, and update the tracker: contacted, replied, demo, signed up, next step and date.\nGoal for the week: 50+ messages, 8-10 replies, 3-4 demos, 1-2 sign-ups, and I'd share what worked.",
  },
  { id: 'results', part: 'craft', minutes: 3, label: 'Your results',
    prompt: 'Tell us about a time you sold something (software, a subscription, a service or a product) to small businesses or individuals. What did you sell, how did you find customers, and what were your results in numbers?',
    rubric: 'A real example with what was sold, how they found customers, and numbers (contacts, meetings, sales, revenue or conversion rate), ideally small businesses or subscriptions. Only "I am a great closer" with no numbers scores 1-2.',
    model: "I sold a scheduling app for 8 months to US dental and beauty clinics. I found them on Google Maps and LinkedIn, sent about 40 personal emails a day, and booked demos for the account executive. I averaged 12 demos a week and about 35% of them signed a $79-a-month plan, roughly 15 new customers a month.",
  },
  { id: 'quiet', part: 'initiative', minutes: 4, label: 'Slow week',
    prompt: 'It is a slow week: few replies and no demos booked. Tell us exactly what you would do, and why.',
    rubric: 'Self-starter who diagnoses before working harder: reviews the tracker (who replied, which messages worked), rewrites or tests the first message, tries a new group of prospects or a new place to find them, follows up with old leads and free users, asks happy customers for referrals or testimonials, and tells the owner what they learned. "I would wait" or "send more of the same" scores low.',
    model: "1. Look at the numbers: which message and which type of business replied at all.\n2. Test two new first messages, 20 each, and keep the better one.\n3. Try a new group: if salons are quiet, try bakeries or fitness coaches.\n4. Follow up with old \"let me think\" leads and free-plan users who never upgraded.\n5. Ask our happiest customers for a referral or a short testimonial I can use.\n6. Send June a short note with what I found and what I changed.",
  },
  { id: 'bonus', part: 'bonus', minutes: 3, optional: true, label: 'Bonus: a skill we did not ask about',
    prompt: 'Is there a skill we did not ask about that could help us sell more? For example making short demo videos, social media content, running a webinar, email campaigns, a CRM, or knowing a niche like salons, contractors or food creators. Tell us what you have done with it and one result you are proud of.',
    rubric: 'Score 0 if left blank. Rewards a real, evidenced skill useful for selling small-business software (demo videos, content, webinars, email campaigns, CRM setup, niche knowledge) with a concrete result. Vague claims with no example score 1-2.',
    model: "I make short screen-recorded demo videos with Loom. For the scheduling app I sold, I made a 90-second video for each type of clinic and put the link in my first message. My reply rate went from about 4% to 11%.",
  },
];

const INTERVIEW_GUIDE = [
  { section: 'Warm-up (3 min)', questions: [
    { q: 'Tell me about the sale you are proudest of. How did you find that customer?',
      listen: 'A real story with how they found the customer, what they did, and a number.' },
    { q: 'Why software sales, part time, with a small company?',
      listen: 'Real interest in small businesses and building something over time; not just any job.' }] },
  { section: 'Their work (6 min)', questions: [
    { q: 'Show me a tracker, CRM or list you kept for your prospects (share your screen or a screenshot).',
      listen: 'Organised notes, next steps and dates. Proof they follow up.' },
    { q: 'What was a month when you missed your target, and what did you change?',
      listen: 'An honest miss and a concrete change.' }] },
  { section: 'Role play (8 min)', questions: [
    { q: 'I am a salon owner who posts on Instagram when I remember. You have 5 minutes: find out what I need and get me to a next step.',
      listen: 'Asks questions before pitching, listens, connects COS to what was said, honest about limits, ends with a clear next step.' },
    { q: 'Now I say: "It is too expensive." Go.',
      listen: 'Stays calm, checks the real concern, offers a cheaper fitting plan or the free plan, no unapproved discount.' }] },
  { section: 'How we work (4 min)', questions: [
    { q: 'You are paid $3.50 an hour plus 10% of a new customer\'s payments for their first 6 months. How do you feel about that, and how would you make it work for you?',
      listen: 'Understands commission follows customers who stay, so they aim for good-fit customers, not quick sign-ups that cancel.' },
    { q: 'What would you do if a prospect asked for a feature we do not have?',
      listen: 'Says no honestly, shows what we do have, and passes the request on.' }] },
  { section: 'Practical check (3 min)', questions: [
    { q: 'Show me your internet speed test and confirm the hours we posted. Any conflicts?',
      listen: 'At least 25 Mbps down and a clear yes to the posted US hours.' }] },
  { section: 'Their questions (3 min)', questions: [
    { q: 'What would you like to know about us?',
      listen: 'Questions about the customers, the apps and how they will be supported show real interest.' }] },
];

module.exports = {
  key: 'software',
  label: 'Software sales agent (part-time)',
  job: 'a part-time remote sales agent who finds and signs up small businesses and creators for our own low-priced subscription apps (COS Creator Studio, CartBook and a business dashboard) through personal outreach, short demos and follow-up',
  reward: 'Reward agents who find good-fit customers rather than mass-messaging, ask before they pitch, handle objections honestly without unapproved discounts or false promises, follow up and track every lead, and show real sales results in numbers.',
  minutes: MINUTES,
  intro: INTRO, parts: PARTS, weights: WEIGHTS, choice: MULTIPLE_CHOICE, written: WRITTEN, guide: INTERVIEW_GUIDE,
};
