'use strict';

/* The applicant test for the developer, in the same shape as the sales one in
   hiring.js (see ROLES there). Everything else is shared by every role.

   What the job is: keeping the shop's live websites and apps working (a
   Node/Express + Postgres backend on Railway, a PHP + MySQL design studio,
   Next.js sites and Expo/React Native apps), fixing what breaks, and building
   new projects with the owner. The work touches real customers' orders and
   payments, so care with live data, secrets and deploys matters as much as
   speed. The owner builds with Claude Code every day, so working well with an
   AI assistant (and checking it) is part of the job, as is publishing iOS apps.
   The test is written: no code editor, no repository access. */

const MINUTES = 30;

const INTRO = `This test takes about ${MINUTES} minutes. It is the same kind of work you would do for us every day:
deciding what to do when something breaks on a live website, reading code for problems, planning a small
feature, and explaining technical work to a non-technical owner. You do not need a code editor: everything
is written. Please do not use ChatGPT or other AI tools to write your answers: we want to see how you think.`;

const PARTS = {
  choice: { label: 'Part 1: Engineering judgment', note: '8 questions, about 6 minutes. Pick what you would really do.' },
  craft: { label: 'Part 2: Technical work', note: 'About 18 minutes. Be specific: steps, commands, file names, what you would check.' },
  initiative: { label: 'Part 3: Initiative', note: 'About 4 minutes. There is no single right answer; we want to see how you think.' },
  bonus: { label: 'Part 4: Bonus', note: 'Optional, about 3 minutes. This can change the direction of your interview.' },
};

const WEIGHTS = { choice: 25, craft: 50, initiative: 25 };

const MULTIPLE_CHOICE = [
  { id: 'outage', q: 'Customers say the quote form shows "Something went wrong" since this morning\'s update. What do you do first?',
    choices: ['Start rewriting the form', 'Check the error logs and what changed in this morning\'s deploy, and roll back to the last working version if the fix is not quick',
      'Wait to see if it fixes itself', 'Tell customers to call instead'],
    answer: 1, why: 'Logs and the latest change find most problems fast, and a rollback stops customers being turned away while you fix it properly.' },
  { id: 'secret', q: 'You need a payment API key to test something. The owner offers to paste it into the team chat. What do you say?',
    choices: ['Yes, paste it there', 'Paste it in an email instead',
      'Ask for it to be added as an environment variable on the server (or shared through a password manager), never pasted in chat, email or code',
      'Put it in the code for now and remove it later'],
    answer: 2, why: 'Keys in chat, email or code get copied and leaked. Secrets live in environment variables or a password manager.' },
  { id: 'prod', q: 'You want to try a database change. What is the right place to try it first?',
    choices: ['On the live database, carefully', 'On a copy or a local test database, with a backup of live taken before it goes out',
      'On the live database late at night', 'Skip testing: it is a small change'],
    answer: 1, why: 'The live database holds real orders and payments. Try it on a copy, and back up live before the change ships.' },
  { id: 'sql', q: 'A search box builds its query like: "SELECT * FROM orders WHERE name = \'" + input + "\'". What is the problem?',
    choices: ['Nothing: it works', 'It is slow', 'Anyone can type SQL into the box and read or change the database (SQL injection). Use a parameterised query',
      'It should use double quotes'],
    answer: 2, why: 'Joining user input into SQL lets an attacker run their own SQL. Parameterised queries make input data, never code.' },
  { id: 'scope', q: 'The owner asks for "a button that emails the customer their invoice". It turns out to need changes to payments too. What do you do?',
    choices: ['Build all of it without asking', 'Build only the button and leave the rest broken',
      'Explain what else it touches, how long each part takes, and agree with the owner what to build first before starting', 'Say it is impossible'],
    answer: 2, why: 'Payments are risky. Agreeing the scope first avoids surprises and lets the owner choose what matters most.' },
  { id: 'tests', q: 'You fixed a bug where some customers were charged twice. What else do you do before calling it done?',
    choices: ['Nothing: it is fixed', 'Add a test that fails if it happens again, check which customers were affected, and tell the owner so they can be refunded',
      'Delete the error logs', 'Announce it on social media'],
    answer: 1, why: 'A test stops it coming back, and the affected customers are the owner\'s to look after. A fix without both is half done.' },
  { id: 'ai', q: 'Claude Code writes a change to the payment code for you, and it looks right. What do you do before it goes live?',
    choices: ['Ship it: the AI is usually right', 'Ask the AI if it is sure',
      'Read every line of the change, run the tests and add one for the new behaviour, try it on a test payment, and never give the AI live secrets or customer data',
      'Have the AI write the tests too and ship if they pass'],
    answer: 2, why: 'AI assistants make developers fast, but the developer owns what ships. Reading the change, real tests and a test payment catch what the AI missed.' },
  { id: 'appstore', q: 'Apple rejects our app update under guideline 3.1.1 because a subscription is sold outside in-app purchase. What do you do?',
    choices: ['Resubmit the same build and hope', 'Remove the app from the store',
      'Read the rejection, move the purchase to in-app purchase (for example through RevenueCat) or remove the outside link from the app, reply in App Store Connect, and resubmit a new build',
      'Argue with the reviewer'],
    answer: 2, why: 'Apple requires digital subscriptions to use in-app purchase. Fix what the guideline says, explain it in the reply, and send a new build.' },
];

const WRITTEN = [
  { id: 'debug', part: 'craft', minutes: 6, label: 'Something is broken on the live site',
    prompt: 'It is 9am. The owner messages you: "Customers are saying they can\'t pay for their orders online. It worked yesterday." The site is a Node.js/Express app with a Postgres database, hosted on Railway, taking card payments through Stripe. Walk us through exactly what you would do, step by step, and what you would tell the owner and when.',
    rubric: 'Replies to the owner at once with what they are checking and when they will update; reproduces the problem (tries a test payment, checks the browser console and network); reads the server logs and the Stripe dashboard (API errors, webhook failures, an expired or changed key); checks what changed since yesterday (deploys, environment variables, Stripe settings, an expired domain or certificate); rolls back if a deploy caused it; fixes with a test, deploys, verifies a real payment works; checks for orders or payments that failed or half-completed in the meantime and tells the owner who was affected; writes a short summary of cause and prevention. Guessing a fix without looking scores 2 or lower.',
    model: "9:00 Reply to June: \"Looking at it now. Next update by 9:30.\"\n1. Reproduce: try a test payment myself, with the browser console and network tab open, and note the exact error.\n2. Look: the Railway logs around the failed payments, and the Stripe dashboard for API errors and failed webhooks (an expired or rotated key, a webhook secret that no longer matches).\n3. What changed: yesterday's deploys (git log), environment variable changes on Railway, Stripe account or API version changes.\n4. If a deploy caused it, roll back to yesterday's version so customers can pay again, then fix it properly on a branch.\n5. Fix, add a test for it, deploy, and make a real small payment to confirm it works end to end.\n6. Find the customers whose payments failed, or were taken without the order being marked paid, and give June the list so she can contact them.\n7. Send June a short summary: what broke, why, what I changed so it doesn't happen again.",
  },
  { id: 'review', part: 'craft', minutes: 6, label: 'Review this code',
    prompt: 'This Express route lets a customer see one of their orders. Find everything wrong with it and say how you would fix each problem:\n\napp.get(\'/order/:id\', async (req, res) => {\n  const r = db.query("SELECT * FROM orders WHERE id = " + req.params.id);\n  res.send("<h1>Order for " + r.rows[0].customer_name + "</h1>");\n});',
    rubric: 'Finds: SQL injection from joining the id into SQL (fix: parameterised query and validate the id is a number); the missing await on db.query; no check that the order exists (crash on rows[0] of an empty result, should be a 404); no check that the person asking owns the order (anyone can read anyone\'s order by changing the id; fix: require login or a secret per-order token and check it); HTML built from the customer\'s name without escaping (XSS); no error handling (try/catch, a generic error message, log server-side); SELECT * returning more than needed. The ownership check and SQL injection matter most.',
    model: "1. SQL injection: the id is pasted into the SQL. Use a parameterised query: db.query('SELECT customer_name, ... FROM orders WHERE id = $1', [id]), and reject any id that is not a whole number.\n2. Missing await: db.query returns a promise, so r.rows is undefined. Add await.\n3. Anyone can see anyone's order by changing the number in the URL. Check the order belongs to the person asking: a logged-in customer id, or a long random token per order instead of the plain id.\n4. No order found: rows[0] is undefined and the app crashes. Return a 404 page.\n5. XSS: customer_name goes into HTML unescaped, so a name with <script> runs in the browser. Escape it, or use a template engine that escapes.\n6. No error handling: wrap it in try/catch, log the error on the server, and show the customer a plain message, never the database error.\n7. SELECT * sends every column. Select only what the page shows.",
  },
  { id: 'feature', part: 'craft', minutes: 4, label: 'Plan a small feature',
    prompt: 'The owner asks: "Text me whenever a quote over $1,000 comes in." Describe how you would build it: where it hooks in, what it sends, what could go wrong, and how you would test it before it goes live.',
    rubric: 'Hooks in where a quote is saved, after the save succeeds; uses the SMS provider the shop already has (for example Twilio) with credentials in environment variables; the threshold and the owner\'s number are settings, not hard-coded; a failed text never blocks or breaks the quote, and is logged or reported; sends once per quote (no duplicates on edits or retries); keeps the message short with a link to the quote and no customer private data beyond what is needed; tests with a fake provider or a test number, including the over/under threshold and failure cases; mentions asking the owner the details (quiet hours, which totals count).',
    model: "Hook: right after a quote is saved successfully, check if its total is over the threshold. The threshold and June's number live in settings or environment variables, not in the code.\nSend: a short text through the provider we already use (Twilio): \"New quote $1,240 from Lincoln PTO: [link]\". No addresses or other private details.\nWhat could go wrong: duplicates when a quote is edited or saved twice, so mark the quote as \"texted\" and only send once; the text failing, so it must never stop the quote being saved, and a failure is logged so we see it; texts at 3am, so I'd ask June whether she wants quiet hours.\nTest: unit tests for over, under and exactly $1,000; a fake SMS sender in tests; one real text to June's phone from a test quote before switching it on.",
  },
  { id: 'explain', part: 'craft', minutes: 2, label: 'Explain it to the owner',
    prompt: 'You need two more days on a feature you said would be done today, because you found a bug in how refunds are recorded. Write the message to the owner (who is not technical) exactly as you would send it.',
    rubric: 'Clear and short, no jargon; says plainly it will be late and the new date; explains why in business terms (refunds were recorded wrong, which affects the books) and whether customers or money were affected; what they are doing about it and what the owner needs to do, if anything; owns it without excuses.',
    model: "Hi June, a heads-up: the invoice emails will be ready Thursday, not today. While testing I found that some refunds were being recorded twice in the books. No customer was charged wrongly, but your totals for September are about $180 too low. I'm fixing that first, since the invoices depend on it, and I'll send you the corrected September total tomorrow. Nothing you need to do. Sorry for the delay.",
  },
  { id: 'quiet', part: 'initiative', minutes: 4, label: 'Quiet time',
    prompt: 'It is 1pm. Nothing is broken, nothing is assigned, and the owner is busy until 4pm. Tell us exactly what you would do with those 3 hours, and why.',
    rubric: 'Self-starter: names concrete, useful engineering work without being told, for example checking error logs and monitoring for problems customers have not reported yet, testing the main customer paths (quote, checkout, payment) on a phone, updating packages with security fixes on a branch, adding tests to fragile code, speeding up slow pages, checking backups actually restore, writing down how things work; prioritised by risk to customers and money. "I would wait" or "I would learn a new framework" alone score low.',
    model: "1:00-1:45 Read the last week's error logs and failed requests for anything customers hit but never reported, starting with checkout and payments.\n1:45-2:30 Walk the main customer paths on my phone: request a quote, pay a deposit, use the design studio. Fix or note anything broken.\n2:30-3:30 Add tests to the payment code that has none, or apply pending security updates on a branch and run the tests.\n3:30-4:00 Send June a short note: what I checked, what I fixed, and anything that needs her decision.",
  },
  { id: 'bonus', part: 'bonus', minutes: 3, optional: true, label: 'Bonus: a skill we did not ask about',
    prompt: 'Is there a skill we did not ask about that could help June\'s Tees grow? For example App Store in-app purchases (RevenueCat), Shopify apps, building features on the Claude API, SEO and site speed, analytics, automation, or design. Tell us what you have done with it and one result you are proud of. Links (GitHub, live sites, app store) are welcome.',
    rubric: 'Score 0 if left blank. Rewards a real, evidenced skill useful to a small business with several sites and apps (mobile apps shipped to the stores, Shopify apps, SEO and Core Web Vitals, analytics, automation, AI API integrations done carefully) with a concrete result and a link. Vague claims with no example score 1-2.',
    model: "I shipped two Expo apps to the App Store and Google Play, including handling an App Store rejection over in-app purchases (fixed with RevenueCat). I also cut a Shopify store's mobile load time from 6s to 2s, and its conversion rate rose 18%. GitHub: [link]",
  },
];

const INTERVIEW_GUIDE = [
  { section: 'Warm-up (3 min)', questions: [
    { q: 'Tell me about a live system you looked after, with real users or payments. What broke, and what did you do?',
      listen: 'A specific incident, calm steps, and what they changed afterwards. "Nothing ever broke" means they did not own anything live.' },
    { q: 'Why this job, and why one small business rather than an agency or freelancing?',
      listen: 'Wants ownership of a set of products over time. Watch for someone juggling many clients in the same hours.' }] },
  { section: 'Their code, on screen (8 min)', questions: [
    { q: 'Share your screen and open a project you wrote. Walk me through how it is organised and one part you are proud of.',
      listen: 'Clear structure, tests, secrets in environment variables, sensible commits. Can explain why, not only what.' },
    { q: 'Show me how you would find where a bug is, in that project.',
      listen: 'Logs, a debugger or a failing test, git history, search. Methodical rather than random edits.' }] },
  { section: 'AI and Apple (5 min)', questions: [
    { q: 'Share your screen and show me how you use Claude Code (or your AI assistant) on a real task. How do you check what it wrote?',
      listen: 'Gives it clear context, reads the diff, runs tests, pushes back when it is wrong. Never pastes secrets or customer data into it.' },
    { q: 'Walk me through publishing an iOS update, from code to the App Store. What has been rejected before, and how did you fix it?',
      listen: 'EAS or Xcode build, TestFlight, App Store Connect metadata, review notes; knows the current SDK requirement and in-app purchase rules.' }] },
  { section: 'Live task (8 min)', questions: [
    { q: 'I will paste a short function with two bugs. Find them, explain them, and fix them while talking me through it.',
      listen: 'Reads before typing, explains the cause, writes or describes a test. Asking a clarifying question is a good sign.' }] },
  { section: 'Safety with live systems (5 min)', questions: [
    { q: 'How do you change a live database safely?',
      listen: 'Backup first, migrations that add before they remove, tried on a copy, a rollback plan, done when traffic is low.' },
    { q: 'Where do API keys and passwords live in your projects, and what do you do if one leaks?',
      listen: 'Environment variables or a secrets manager, never in git; on a leak: rotate it at once, check the logs, tell the owner.' }] },
  { section: 'Working with a non-technical owner (3 min)', questions: [
    { q: 'How would you tell me a feature will take twice as long as you said?',
      listen: 'Early, plain words, the reason, a new date, and options (a smaller first version).' }] },
  { section: 'Practical check (2 min)', questions: [
    { q: 'Show me your internet speed test and your development setup.',
      listen: 'At least 25 Mbps down, a backup connection, a Mac that builds iOS apps (current Xcode) and runs a local database.' },
    { q: 'Confirm the schedule we posted, including the hours you overlap with US Central. Any conflicts?',
      listen: 'A clear yes, and enough overlap to handle an outage during US business hours.' }] },
  { section: 'Their questions (1 min)', questions: [
    { q: 'What would you like to know about us?',
      listen: 'Questions about the stack, how deploys work or how they will get access show real interest.' }] },
];

module.exports = {
  key: 'developer',
  label: 'Web & app developer',
  job: 'a remote full-stack developer who maintains the shop\'s live websites and apps (Node.js/Express and Postgres on Railway, a PHP/MySQL design studio, Next.js sites, Expo/React Native iOS and Android apps), publishes to the App Store, and builds new projects alongside Claude Code',
  reward: 'Reward developers who are careful with live systems, customer data, payments and secrets, use AI assistants like Claude well but check their work, find root causes rather than guessing, explain clearly to a non-technical owner, and find useful work without being told.',
  minutes: MINUTES,
  intro: INTRO, parts: PARTS, weights: WEIGHTS, choice: MULTIPLE_CHOICE, written: WRITTEN, guide: INTERVIEW_GUIDE,
};
