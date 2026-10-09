'use strict';

/* The Developer course: the eight hours the developer walks before shipping
   to the live sites on their own (owner, 2026-10-09).

   What the course teaches comes from what the shop already wrote down or
   built: the "Working on our live websites and apps" SOP in the Playbook,
   the developer's hiring test (tools/lib/hiring-developer.js), whose model
   answers are the standard we hired against, the backend README, the staff
   route-permission map (tools/lib/staff.js ROUTES) and its tests, the
   radar-gate check, and the rules in the repo's AGENTS.md about money,
   webhooks and SQL. Anything only the owner knows is written
   "[owner to fill in: ...]", which the Training page's "Playbook gaps" card
   asks her for. Repo and hosting access is granted outside the app. */

const TEAM = require('./shared-team');

const A = {
  stack:     'Developer course 2a: What runs where',
  ship:      'Developer course 2b: How a change reaches customers',
  incident:  'Developer course 3a: When something breaks',
  after:     'Developer course 3b: After the fix',
  secrets:   'Developer course 4a: Secrets and live data',
  abuse:     'Developer course 4b: Code that cannot be abused',
  payments:  'Developer course 5a: Payments and the ledger',
  refunds:   'Developer course 5b: Refunds, disputes and other people\'s systems',
  tests:     'Developer course 6a: Tests that would have caught it',
  claude:    'Developer course 6b: Working with Claude Code',
  apps:      'Developer course 7a: Apps and the App Store',
  quiet:     'Developer course 7b: Quiet time and talking to June',
};

const GLOSSARY = {
  'deploy': 'Putting a new version of the code live. Ours deploy automatically when a change is merged to main.',
  'roll back': 'Putting the previous working version live again, before fixing the problem properly.',
  'environment variable': 'A setting the server reads at start, such as a secret key, kept on Railway and never in the code.',
  'webhook': 'A message another service (Stripe, Twilio, Brevo) sends our server when something happens.',
  'parameterised query': 'SQL where values are passed separately ($1, $2) instead of pasted into the text, so they cannot change the query.',
  'pull request': 'A proposed change on GitHub, reviewed and checked before it is merged to main.',
  'regression test': 'A test written for a bug, so it fails if the bug ever comes back.',
  'idempotent': 'Safe to run twice: the second time changes nothing.',
  'ledger': 'A list of money movements that are only ever added to, never edited.',
  'testflight': 'Apple\'s way to send a test build of an iPhone app to testers before it goes to the App Store.',
};

const MODULES = [
  /* ── 1 ── */
  TEAM.MODULE,

  /* ── 2 ── */
  {
    key: 'v2', icon: '🗺️', title: 'The stack, and how a change ships',
    goal: 'Know what runs where, and the one path every change takes to customers.',
    lessons: [{
      id: 'v2-stack', article: A.stack, minutes: 25, tags: 'developer, stack, express, postgres, railway, lumise, php, cloudflare, brevo, stripe, sentry',
      goals: ['Name each service and what it does', 'Find where a page or route lives', 'Know which services touch money'],
      images: [{ src: '/assets/images/work/design-studio-live.jpg', alt: 'The online design studio: one of the two services customers pay through' }],
      body:
`Customers pay through our systems every day. Before you change anything, know what each part is and what depends on it.

**The backend (jtees.net)**

One Node.js and Express app does most of it:

- The public site: static pages in public/, including the service pages ads send people to
- Quote and contact forms, payments, refunds, sales tax and the books
- The staff back office under /admin: quotes, production, design jobs, training, team chat
- Scheduled sweeps that run every few minutes or hourly: reminders, refund checks, payout checks

There is no build step and no frontend framework. Admin pages are HTML written by server.js; shared rules live in tools/lib, each with tests in tests/.

**Its database**

PostgreSQL. The server sets up its own tables and columns each time it starts, written so that running it again changes nothing. A database change ships with the code that needs it, and must be safe to run on every start.

**The design studio (design.jtees.net)**

A separate PHP app on MySQL, in its own repository, where customers design shirts and order online. It talks to the backend with a shared internal key, and both receive Stripe's events.

**Around them**

- **Railway** hosts both, with their environment variables
- **Cloudflare** sits in front: caching, and the sign-in for staff pages
- **Stripe** takes card payments; **Brevo** sends email and holds contacts (the server will not start without it); **Twilio** sends texts; **Cloudinary** stores uploaded images; **Sentry** collects errors

**Other projects**

[owner to fill in: which other sites and apps the developer looks after, and where each lives]

**Where things are**

- A page: search server.js for its route, for example app.get('/admin/design'
- A rule: tools/lib, named for what it does (staff.js, training.js, tax-certificates.js)
- Who may open a route: the ROUTES map in tools/lib/staff.js`,
    }, {
      id: 'v2-ship', article: A.ship, minutes: 20, tags: 'developer, git, branch, pull request, radar-gate, merge, deploy, railway, main',
      goals: ['Ship a change through a pull request', 'Know what happens when you merge', 'Check a deploy is healthy'],
      body:
`Every change takes the same path. There are no shortcuts to live, because live is where the customers are.

**Getting access**

[owner to fill in: how the developer is given access to GitHub, Railway, Sentry and Stripe, and at what level]

Use your own accounts with two-factor sign-in. Never a shared login.

**The path**

1. **Branch** from main, named for what it does (fix-refund-email, add-banner-sizes)
2. Make the change, with a test (Module 6)
3. Run the tests: node --test tests/*.test.js. Compare failures with main: a change must not add any
4. **Pull request** against main. Say what changed, why, what you did not do, and what to check by hand
5. The **radar-gate** check runs on every pull request. Read its comment if it fails; it is usually right
6. **Squash-merge** when it is ready
7. Merging to main **deploys automatically** on Railway. Watch it

Never push straight to main, and never deploy by hand over a live deploy someone else made.

**Watching a deploy**

- Wait for Railway to show the deploy as successful
- Read the start of its logs: the database is ready and the server is listening, with no errors
- Open the page you changed, on your phone, and try the thing you fixed
- For anything touching payments, make a real small test (Module 5)

**When not to deploy**

- During the busiest hours for orders, unless it is a fix for something broken: [owner to fill in: hours the developer should avoid deploying]
- Just before you stop for the day. Deploy when you can watch it for an hour
- With failing tests you do not understand

**Two people, one repo**

Other people and AI agents work in the same repository. Before starting, check nobody has an open pull request for the same thing. Keep your change to what you set out to do: a tidy-up of unrelated code belongs in its own pull request.`,
    }],
    practice: [],
    quiz: {
      key: 'dev-2', title: 'Module 2 quiz: the stack, and how a change ships', minutes: 10,
      questions: [
        { id: 'tables', q: 'How are database tables created in the backend?',
          choices: ['By hand in a database console', 'By the server\'s own start-up code, safe to run every time', 'Never', 'By Stripe'],
          answer: 1, article: A.stack, why: 'Database changes ship with the code and must be safe to run every start.' },
        { id: 'studio', q: 'The design studio at design.jtees.net is…',
          choices: ['Part of server.js', 'A separate PHP app on MySQL in its own repository', 'A Next.js app', 'Hosted by Stripe'],
          answer: 1, article: A.stack, why: 'It talks to the backend with an internal key.' },
        { id: 'brevo', q: 'Which service must be configured or the backend will not start?',
          choices: ['Brevo', 'Twilio', 'Sentry', 'Cloudinary'],
          answer: 0, article: A.stack, why: 'Brevo is a hard requirement.' },
        { id: 'who', q: 'Where do you find who may open an admin route?',
          choices: ['The ROUTES map in tools/lib/staff.js', 'Cloudflare', 'The README', 'Nowhere'],
          answer: 0, article: A.stack, why: 'Every admin route names its permission there.' },
        { id: 'build', q: 'The admin pages are built with…',
          choices: ['React', 'HTML written by server.js, no build step', 'WordPress', 'A mobile app'],
          answer: 1, article: A.stack, why: 'No build step and no frontend framework.' },
        { id: 'main', q: 'May you push straight to main?',
          choices: ['Yes, for small fixes', 'No: branch and pull request', 'Only on Fridays', 'Only with Claude Code'],
          answer: 1, article: A.ship, why: 'Every change takes the same path.' },
        { id: 'merge', q: 'What happens when a pull request is merged to main?',
          choices: ['Nothing until someone deploys', 'Railway deploys it automatically', 'It is emailed to customers', 'It waits a week'],
          answer: 1, article: A.ship, why: 'Merging is deploying.' },
        { id: 'tests', q: 'Some tests already fail on main. Your change is OK when…',
          choices: ['Any number fail', 'It adds no new failures', 'All tests are deleted', 'You skip them'],
          answer: 1, article: A.ship, why: 'Compare with main; add none.' },
        { id: 'watch', q: 'After a deploy you…',
          choices: ['Close the laptop', 'Check it succeeded, read the logs, and try the change on your phone', 'Merge another', 'Email customers'],
          answer: 1, article: A.ship, why: 'Watch every deploy.' },
        { id: 'scope', q: 'While fixing a bug you spot ugly code nearby. You…',
          choices: ['Rewrite it in the same pull request', 'Leave it for its own pull request', 'Delete it', 'Ignore the bug'],
          answer: 1, article: A.ship, why: 'Keep a change to what you set out to do.' },
      ],
    },
    buffer: 7,
  },

  /* ── 3 ── */
  {
    key: 'v3', icon: '🚨', title: 'When something breaks',
    goal: 'Get customers working again fast, then fix it properly and find who was affected.',
    lessons: [{
      id: 'v3-incident', article: A.incident, minutes: 25, tags: 'developer, incident, outage, logs, railway, sentry, stripe, roll back, reproduce',
      goals: ['Tell June first, with a time', 'Find the cause from logs and recent changes', 'Roll back before fixing'],
      body:
`When the site breaks, customers cannot pay and June is the one they call. The order of what you do matters more than how clever the fix is.

**Tell June, with a time**

Before you start digging: "Looking at the payment problem now. Next update by 9:30." Then keep that time, even if the update is "still looking". How to reach her if it is urgent: [owner to fill in: how the developer reaches June in an outage]

**Reproduce it**

Try it yourself, the way a customer would, with the browser's console and network tab open. Write down the exact error, the page, the time. "Checkout is broken" becomes "the Pay button returns 500 on every quote since 8:40".

**Read the logs**

- **Railway:** the backend's logs around the time it started, and whether the last deploy succeeded
- **Sentry:** new errors, with the line they came from
- **Stripe:** failed API calls and failed webhook deliveries (an expired key or a webhook secret that no longer matches looks exactly like broken code)

**What changed?**

Something worked yesterday and not today. Check, in order:

- Deploys since it last worked (git log, Railway's deploy list)
- Environment variable changes on Railway
- Changes on the other side: Stripe, Brevo, Twilio, Cloudflare settings, an expired key or card

**Roll back first**

If a deploy caused it, put the previous working version back live (redeploy it on Railway, or revert the merge so main deploys the old code). Customers can pay again in minutes. Then fix it properly on a branch, with a test, without customers waiting on you.

Never fix forward under pressure on the live site. A rushed fix is how one outage becomes two.

**Keep June informed**

Short updates at the times you promised: what you know, what you have done, what is next. No jargon: "Payments work again. Some customers between 8:40 and 9:15 may not have been able to pay; I am getting you the list."`,
    }, {
      id: 'v3-after', article: A.after, minutes: 20, tags: 'developer, incident, regression test, affected customers, summary, root cause',
      goals: ['Find every customer or payment affected', 'Add the test that would have caught it', 'Write June a summary she can act on'],
      body:
`The site working again is half the job. The other half is making sure nobody was quietly hurt, and that it cannot happen the same way again.

**Who was affected**

For anything touching orders or money, find out exactly who:

- Customers whose payment failed, who will think they paid or that we ignored them
- Payments taken where the order was not marked paid, which leads to chasing a customer for money they already gave
- Emails or texts that were not sent, or were sent twice
- Records written wrong while it was broken

Give June the list: order codes, what happened to each, and what you suggest. She contacts the customers; you never email them from the code without her say.

**The test that would have caught it**

Every bug fixed gets a regression test: one that fails with the old code and passes with the fix. Without it, the next change to that code can bring the bug back and nobody notices until a customer does.

**Fix the cause, not the symptom**

Ask why until the answer is something you can change:

- Payments failed, because the webhook was rejected, because the signing secret changed, because a key was rotated on one service and not the other
- The fix is not just the new secret: it is making the rotation steps list both services

**The summary for June**

Short, plain English, the same day:

1. What broke, and from when to when
2. Who was affected, with the list
3. What you did to fix it
4. What stops it happening again
5. Anything she needs to do or decide

"Payments failed for 35 minutes this morning because a new key was missing on Railway. 4 customers could not pay; their order codes are below. It is fixed, and the server now refuses to start without the key, so this exact failure cannot repeat. Could you message those 4?"`,
    }],
    practice: [
      { key: 'signoff:dev-rollback', type: 'signoff', minutes: 5,
        title: 'Can roll back a bad deploy', hint: 'Walk June through rolling the backend back to the previous deploy on Railway, and how you would then fix it on a branch. No need to break anything to show it.' },
    ],
    quiz: {
      key: 'dev-3', title: 'Module 3 quiz: when something breaks', minutes: 10,
      questions: [
        { id: 'first', q: 'Payments are failing. Your first step is…',
          choices: ['Start coding a fix', 'Tell June you are looking, and when you will update her', 'Restart everything', 'Email customers'],
          answer: 1, article: A.incident, why: 'Tell June first, with a time.' },
        { id: 'repro', q: 'Which is a useful description of the problem?',
          choices: ['"Checkout is broken"', '"The Pay button returns 500 on every quote since 8:40"', '"Things are weird"', '"It does not work"'],
          answer: 1, article: A.incident, why: 'Exact error, page and time.' },
        { id: 'stripe', q: 'Payments fail but the code has not changed. Where else do you look?',
          choices: ['Nowhere', 'Stripe: failed calls and webhook deliveries, keys and secrets', 'The design studio CSS', 'Google Ads'],
          answer: 1, article: A.incident, why: 'An expired key looks exactly like broken code.' },
        { id: 'changed', q: 'Which question finds most causes?',
          choices: ['What changed since it last worked?', 'Who wrote this?', 'Is it the weekend?', 'Which browser?'],
          answer: 0, article: A.incident, why: 'Deploys, variables, other services.' },
        { id: 'rollback', q: 'A deploy an hour ago broke checkout. You…',
          choices: ['Fix forward on live as fast as you can', 'Roll back first, then fix on a branch', 'Wait for tomorrow', 'Delete the database'],
          answer: 1, article: A.incident, why: 'Customers can pay again in minutes.' },
        { id: 'update', q: 'You promised an update at 9:30 and are still looking. At 9:30 you…',
          choices: ['Stay quiet', 'Update June: still looking, what you know, next time', 'Mark it fixed', 'Go to lunch'],
          answer: 1, article: A.incident, why: 'Keep the time you gave.' },
        { id: 'affected', q: 'After a payment outage, you…',
          choices: ['Move on', 'Find every affected customer and payment, and give June the list', 'Email all customers yourself', 'Refund everyone'],
          answer: 1, article: A.after, why: 'June contacts them; you find them.' },
        { id: 'regress', q: 'A regression test is one that…',
          choices: ['Always passes', 'Fails with the old code and passes with the fix', 'Tests the CSS', 'Is optional'],
          answer: 1, article: A.after, why: 'So the bug cannot quietly return.' },
        { id: 'cause', q: 'The webhook failed because a key was rotated on one service only. The real fix includes…',
          choices: ['Only the new secret', 'Making the rotation steps cover both services', 'Turning off webhooks', 'Nothing'],
          answer: 1, article: A.after, why: 'Fix the cause, not the symptom.' },
        { id: 'summary', q: 'The incident summary for June is…',
          choices: ['A stack trace', 'Plain English: what broke, who was affected, the fix, what stops it again, what she must do', 'Nothing', 'A link to the logs'],
          answer: 1, article: A.after, why: 'Short, plain, the same day.' },
      ],
    },
    buffer: 7,
  },

  /* ── 4 ── */
  {
    key: 'v4', icon: '🔐', title: 'Safety',
    goal: 'Keep secrets secret, keep live data safe, and write code nobody can turn against our customers.',
    lessons: [{
      id: 'v4-secrets', article: A.secrets, minutes: 20, tags: 'developer, secrets, environment variables, railway, backups, live database, customer data',
      goals: ['Keep every secret out of code and chat', 'Never experiment on the live database', 'Fail fast when a setting is missing'],
      body:
`Two mistakes do the most damage and take seconds to make: a leaked key, and a change run on the live database.

**Secrets**

API keys, webhook secrets, database passwords and sign-in keys:

- Live in Railway's environment variables, or a password manager. Never in the code, a commit, chat, email, a screenshot or an AI prompt
- Are never printed in logs or shown in an error page
- Never get a fallback in the code ("use this test key if the real one is missing"). If a required one is missing, the server should refuse to start, with a message saying which. A server that runs with a missing key fails later, on a customer
- When one leaks, or a person with access leaves, it is rotated: a new one made, set everywhere it is used, then the old one switched off. Some keys are shared between the backend and the design studio; change both together

When you read Railway's variables, do it so the values are not shown on your screen or in a terminal history someone else can see.

**Live data**

- Never try a change on the live database. Use a local database or a copy
- Before a change that rewrites data ships, take a backup, and know how you would undo it
- Schema changes run on every start, so they must be safe to run twice and safe on a table with real rows in it
- Never delete customer records, orders or payments to "clean up". Money is a ledger: a correction is a new row, not an edit

**Customer data**

- Only what the job needs. Designers, for example, never see customer emails or addresses; keep it that way
- Never paste customer data into an AI tool, a public issue, or a chat
- Test data uses made-up customers and example.com emails, never real ones`,
    }, {
      id: 'v4-abuse', article: A.abuse, minutes: 25, tags: 'developer, security, sql injection, xss, escaping, authorization, permissions, webhooks, validation, rate limit',
      goals: ['Write queries and pages that cannot be injected', 'Check the person owns what they ask for', 'Register every new admin route\'s permission'],
      body:
`Assume every form field, URL and header was typed by someone trying to break in. These rules stop the common attacks.

**Queries**

Every query is **parameterised**: values passed separately, never pasted into the SQL text.

- Right: pool.query('SELECT * FROM quotes WHERE code = $1', [code])
- Wrong: pool.query("SELECT * FROM quotes WHERE code = '" + code + "'")
- Check the value's shape first: a quote code that is not 6 letters and digits never reaches the database

**Pages**

Anything a customer or helper typed is **escaped** before it goes into HTML: the escEmail helper in server.js turns < > & " ' into safe text. A customer who types a script tag as their name must see it shown as text, never run.

**Who can see what**

- Every admin route checks the person is signed in, and the ROUTES map in tools/lib/staff.js says which permission it needs. A new route without an entry there fails the tests. Owner-only pages (money, staff, prices) say so
- Every lookup checks **ownership**: a helper sees their own jobs; a customer's link only opens their own order, with a long random token, not a counting number someone can change
- Never trust the browser: hidden fields, prices and totals sent from a form are recomputed on the server

**What comes in from outside**

- **Webhooks** (Stripe, Twilio, Brevo): verify the signature on the raw body before reading anything in it
- **Size limits** on every body and upload; **length limits** on every text field
- **Rate limits** on public forms, keyed on the visitor address Cloudflare gives us (CF-Connecting-IP), never the first X-Forwarded-For entry, which the visitor can write themselves

**Errors**

Customers see a plain message. The details (stack trace, SQL, file paths) go to the logs and Sentry, never to the page.`,
    }],
    practice: [],
    quiz: {
      key: 'dev-4', title: 'Module 4 quiz: safety', minutes: 10,
      questions: [
        { id: 'where', q: 'Where does the Stripe secret key live?',
          choices: ['In server.js', 'In Railway\'s environment variables', 'In the README', 'In team chat'],
          answer: 1, article: A.secrets, why: 'Never in code, chat, email or a prompt.' },
        { id: 'fallback', q: 'A required key is missing at start. The server should…',
          choices: ['Use a built-in test key', 'Refuse to start, saying which key', 'Start and hope', 'Email customers'],
          answer: 1, article: A.secrets, why: 'Fail fast, never silently degrade.' },
        { id: 'leak', q: 'A key was pasted into a chat by mistake. You…',
          choices: ['Delete the message and move on', 'Rotate it: new key everywhere it is used, then switch the old one off', 'Ignore it', 'Change the code'],
          answer: 1, article: A.secrets, why: 'A leaked key is rotated.' },
        { id: 'livedb', q: 'You want to try an UPDATE that changes many rows. You first…',
          choices: ['Run it on live to see', 'Try it on a local copy, and take a backup before it ships', 'Ask a customer', 'Delete the rows'],
          answer: 1, article: A.secrets, why: 'Never experiment on live data.' },
        { id: 'testdata', q: 'Test data uses…',
          choices: ['Real customers', 'Made-up customers with example.com emails', 'June\'s email', 'Live orders'],
          answer: 1, article: A.secrets, why: 'Never real customer data.' },
        { id: 'sql', q: 'Which query is safe?',
          choices: ['"...WHERE code = \'" + code + "\'"', 'query(\'...WHERE code = $1\', [code])', 'Template string with ${code}', 'All of them'],
          answer: 1, article: A.abuse, why: 'Parameterised: values passed separately.' },
        { id: 'escape', q: 'A customer\'s name goes into an admin page. You…',
          choices: ['Insert it as-is', 'Escape it first (escEmail)', 'Upper-case it', 'Remove spaces'],
          answer: 1, article: A.abuse, why: 'Typed text never runs as code.' },
        { id: 'route', q: 'You add a new admin route. Besides the code, you…',
          choices: ['Nothing', 'Add its permission to ROUTES in tools/lib/staff.js', 'Tell customers', 'Add it to the sitemap'],
          answer: 1, article: A.abuse, why: 'A new route without an entry fails the tests.' },
        { id: 'webhook', q: 'A Stripe webhook arrives. Before reading it you…',
          choices: ['Parse the JSON', 'Verify the signature on the raw body', 'Reply 200', 'Log the secret'],
          answer: 1, article: A.abuse, why: 'Verify, then parse.' },
        { id: 'ip', q: 'A rate limit on a public form keys on…',
          choices: ['The first X-Forwarded-For entry', 'CF-Connecting-IP from Cloudflare', 'The user agent', 'Nothing'],
          answer: 1, article: A.abuse, why: 'The first X-Forwarded-For entry is whatever the visitor sent.' },
      ],
    },
    buffer: 7,
  },

  /* ── 5 ── */
  {
    key: 'v5', icon: '💳', title: 'Money code',
    goal: 'Change payment, refund and tax code without ever losing, doubling or inventing money.',
    lessons: [{
      id: 'v5-payments', article: A.payments, minutes: 25, tags: 'developer, payments, stripe, webhook, ledger, idempotent, totals, test payment',
      goals: ['Know why payments are a ledger', 'Make a payment handler safe to run twice', 'Test a payment change for real'],
      images: [{ src: '/assets/images/work/gift-cards.jpg', alt: 'Gift cards: every payment, however small, goes in the ledger once' }],
      body:
`Money code is where a small mistake costs real customers real money. Read the rules in the repository's AGENTS.md before touching any of it; each one was learned the hard way.

**Payments are a ledger**

Each payment is a row that is never edited. A correction is a new row (a refund is a negative one), so the original and the reason both survive. Totals on an order are worked out from the rows. This is what makes deposits, part payments, refunds and disputes possible at all.

**The server works out the money**

- Totals, tax, shipping and discounts are computed on the server from what is in the database, never taken from the browser
- The price shown and the price charged come from the same code. Two places computing one price will one day disagree

**Webhooks, not the browser**

A customer's browser coming back from Stripe is a courtesy; the tab closes, the phone sleeps. Every payment is recorded from Stripe's signed webhook, and the return page and the webhook call the same function, so they cannot disagree.

That function must be **idempotent**: Stripe sends some events twice, late or out of order. A unique key on Stripe's own id makes the second one change nothing.

**Say thank you only once it is paid**

"Thanks, your order is in" emails and the shop's new-order alert go out from the payment-confirmed path, never when the order row is first created (before the customer has paid).

**Testing a payment change**

- Unit tests for the arithmetic: deposit, balance, tax, refunds
- Tests against a real Postgres for the SQL. A mocked database accepts any SQL, so the test passes while every real write fails
- Then a real payment in Stripe's test mode, end to end: pay, check the order shows paid once, the email went once, and the books show it
- For a live change, one small real payment, refunded afterwards, with June's OK

**Never**

- Change an amount already recorded to make something add up
- Mark an order paid by hand in the code
- Run a script that writes money rows on live without a backup and June's yes`,
    }, {
      id: 'v5-refunds', article: A.refunds, minutes: 20, tags: 'developer, refunds, disputes, chaser, retries, third party, error messages, tax',
      goals: ['Rebuild refunds from Stripe\'s list', 'Stop chasers after refunds and disputes', 'Make another service\'s failure visible'],
      body:
`Refunds, disputes and every other service we talk to fail in ways that do not show on a happy-path test.

**Refunds**

- Refund events arrive late, twice and out of order, and a refund can fail at the bank weeks later. So an order's refunds are rebuilt from Stripe's own refund list, one order at a time under a lock, never from the figure an event carries
- A charge refunded in parts reports a running total. Booking that total each time books the first refund again on every later one
- An hourly pass catches any event that never arrived

**Disputes**

- Recorded from the day they open; the money does not move in the ledger until one is lost
- Every automatic chaser (deposit reminders, balance reminders, review and reorder asks) must skip an order with an open dispute or any refund. Emailing a customer for money we just returned, or while they dispute, is how a shop loses a dispute

**Sales tax**

The tax portion of each payment is worked out when the payment lands and stored on it. Reports read that stored figure, so editing a quote later cannot change a month already filed. Never recompute it from today's quote.

**Other people's systems**

Brevo, Twilio, Stripe and the design studio all fail sometimes:

- A call that fails must say which service, which call, and the service's own message, not "Request failed with status 400"
- A scheduled job that fails must answer with an error, not a 200 with "failed" in the body that nobody reads
- Anything we copy to another service (a contact to Brevo, a deal to the CRM) needs a retry with a limit, and a report when it gives up
- A text the provider accepted is not a text delivered: ask for the delivery report

When you touch any of this, read the matching rule in AGENTS.md first.`,
    }],
    practice: [],
    quiz: {
      key: 'dev-5', title: 'Module 5 quiz: money code', minutes: 10,
      questions: [
        { id: 'ledger', q: 'A payment was recorded $10 too high. The fix is…',
          choices: ['Edit the row', 'A new correcting row, so the original and the reason survive', 'Delete the row', 'Change the order total'],
          answer: 1, article: A.payments, why: 'Money is a ledger.' },
        { id: 'total', q: 'The checkout form posts a total. The server…',
          choices: ['Charges it', 'Recomputes the total from the database', 'Adds tax to it', 'Logs it and charges it'],
          answer: 1, article: A.payments, why: 'Never trust a client total.' },
        { id: 'webhook', q: 'Why record payments from the webhook, not only the return page?',
          choices: ['It is faster', 'The customer\'s browser may never come back', 'Stripe requires it', 'No reason'],
          answer: 1, article: A.payments, why: 'Tabs close; phones sleep.' },
        { id: 'twice', q: 'Stripe sends the same event twice. Your handler…',
          choices: ['Books it twice', 'Changes nothing the second time (unique key on Stripe\'s id)', 'Crashes', 'Emails June'],
          answer: 1, article: A.payments, why: 'Idempotent.' },
        { id: 'thanks', q: '"Thanks, your order is in" is sent…',
          choices: ['When the order row is created', 'When payment is confirmed', 'Never', 'Daily'],
          answer: 1, article: A.payments, why: 'Rows exist before the customer pays.' },
        { id: 'mock', q: 'Why test SQL against a real Postgres?',
          choices: ['It is faster', 'A mocked database accepts any SQL, so a broken query passes', 'It is required by Railway', 'It is not needed'],
          answer: 1, article: A.payments, why: 'Mocks hide real failures.' },
        { id: 'refund', q: 'An order\'s refunds are worked out from…',
          choices: ['The figure in each refund event', 'Stripe\'s own refund list, under a lock', 'The customer\'s email', 'Guessing'],
          answer: 1, article: A.refunds, why: 'Events arrive late, twice and out of order.' },
        { id: 'chaser', q: 'A balance reminder sweep must skip orders that…',
          choices: ['Are new', 'Have a refund or an open dispute', 'Are large', 'Are paid by card'],
          answer: 1, article: A.refunds, why: 'Never chase money we returned or that is disputed.' },
        { id: 'tax', q: 'A tax report reads the tax…',
          choices: ['Stored on each payment when it landed', 'Recomputed from today\'s quotes', 'From Stripe fees', 'Typed by hand'],
          answer: 0, article: A.refunds, why: 'Filed months never change.' },
        { id: 'error', q: 'A Brevo call fails. The error should say…',
          choices: ['"Request failed with status 400"', 'Brevo, which call, and Brevo\'s own message', 'Nothing', '"Oops"'],
          answer: 1, article: A.refunds, why: 'So someone can act on it.' },
      ],
    },
    buffer: 7,
  },

  /* ── 6 ── */
  {
    key: 'v6', icon: '🧪', title: 'Tests and Claude Code',
    goal: 'Prove your changes work before customers do, and use Claude Code without handing it the keys.',
    lessons: [{
      id: 'v6-tests', article: A.tests, minutes: 20, tags: 'developer, tests, node test, regression, end to end, real postgres, phone',
      goals: ['Run the tests and compare with main', 'Write a regression test for a bug', 'Check a change for real, on a phone'],
      body:
`A test is a promise that something works, kept automatically every time anyone changes the code.

**Running them**

- node --test tests/*.test.js runs every test
- Some tests already fail on main. Run the same on main and compare: your change must add no new failures, and should not hide any
- Run the tests for the area you changed while you work; run all of them before the pull request

**What to test**

- **Every bug fix:** a regression test that fails before the fix and passes after
- **Rules:** money arithmetic, permissions, dates, anything in tools/lib. These are fast and easy to test directly
- **Failure cases:** a request with no sign-in, another person's order id, a missing field, a huge input. Each should fail the right way
- **Routes:** every admin route has a permission, and is registered before the 404 catch-all. The existing tests check both

**Tests that lie**

- A mocked database passes SQL that Postgres would refuse. Anything with new SQL is tried against a real Postgres
- A test that checks the code's wording breaks when someone rewords it, not when the behaviour breaks. Test what it does
- A test that passes before your fix proves nothing about your fix

**Trying it for real**

Tests pass is not the same as it works. Before calling a change done:

- Start the server locally and use the feature as a customer or helper would
- For a page: open it on a phone-sized screen and check nothing important is off-screen or scrolls sideways
- For a save: refresh the page and check it is still saved
- For a payment: a test-mode payment, end to end

**Saying what you did not test**

If something could not be checked (a provider with no test mode, a real iPhone), say so in the pull request, with the steps June or you will do by hand.`,
    }, {
      id: 'v6-claude', article: A.claude, minutes: 20, tags: 'developer, claude code, ai, review, agents.md, secrets, ownership',
      goals: ['Use Claude Code to go faster', 'Own every line it writes', 'Keep secrets and customer data away from it'],
      body:
`June builds with Claude Code every day, and so will you. It writes code quickly and confidently. Confident is not the same as right.

**You own what ships**

Whatever Claude Code writes, you are the one who merged it:

- Read every line before it is committed. If you cannot explain a line, it does not ship
- Run the tests, add one for the new behaviour, and try it for real
- Check it did what you asked, and only that. AI tools like to tidy nearby code, rename things and add features nobody asked for
- Check it did not quietly weaken a check to make a test pass: a removed permission, a skipped test, a looser validation

**The rules it works by**

The repository's AGENTS.md is the rulebook for every agent and person: the money rules, the SQL rules, what an agent may and may not change, and how to deliver work. Read it once fully. When Claude Code breaks one of its rules, the rule wins.

**What never goes into it**

- Live secrets: keys, passwords, tokens, the contents of Railway's variables
- Customer data: names, emails, addresses, orders. Use made-up examples
- Anything June told you in confidence

**Good ways to use it**

- Reading unfamiliar code: "where is the deposit reminder sent, and what stops it for refunded orders?"
- Writing tests for code that has none
- A first draft of a change, which you then read, test and shape
- Reviewing your own change for the mistakes in Module 4 before the pull request

**When it is wrong**

It will sometimes invent a function that does not exist, misremember how a library works, or say a test passed that it never ran. Check the claims that matter: run the command yourself, open the file it cites.`,
    }],
    practice: [
      { key: 'signoff:dev-first-pr', type: 'signoff', minutes: 5,
        title: 'Ships a first change the right way', hint: 'Your first pull request: a branch, a test that fails without the change, no new test failures, a clear description, a watched deploy and a check on a phone.' },
    ],
    quiz: {
      key: 'dev-6', title: 'Module 6 quiz: tests and Claude Code', minutes: 10,
      questions: [
        { id: 'run', q: 'How do you run every backend test?',
          choices: ['npm run build', 'node --test tests/*.test.js', 'They run in production', 'There are none'],
          answer: 1, article: A.tests, why: 'The built-in Node test runner.' },
        { id: 'baseline', q: 'Five tests fail on your branch. Before worrying you…',
          choices: ['Delete them', 'Run the same on main and compare', 'Skip them', 'Merge anyway'],
          answer: 1, article: A.tests, why: 'Add no new failures.' },
        { id: 'failcase', q: 'Which is a failure case worth testing?',
          choices: ['Another person\'s order id', 'The happy path only', 'The CSS color', 'The README'],
          answer: 0, article: A.tests, why: 'It should fail the right way.' },
        { id: 'wording', q: 'A test checks the exact wording of a code line. It will…',
          choices: ['Catch every bug', 'Break when someone rewords it, not when behaviour breaks', 'Never fail', 'Run faster'],
          answer: 1, article: A.tests, why: 'Test what it does.' },
        { id: 'real', q: 'All tests pass. Before calling it done you…',
          choices: ['Merge', 'Use the feature for real, refresh to check it saved, and look on a phone', 'Close the laptop', 'Ask Claude if it works'],
          answer: 1, article: A.tests, why: 'Passing tests is not the same as working.' },
        { id: 'own', q: 'Claude Code wrote a change. Who owns it?',
          choices: ['Claude', 'You, the person who merged it', 'June', 'Nobody'],
          answer: 1, article: A.claude, why: 'Read every line; if you cannot explain it, it does not ship.' },
        { id: 'weaken', q: 'Claude made a failing test pass by removing a permission check. You…',
          choices: ['Merge it', 'Reject that change and fix the real problem', 'Delete the test', 'Ignore it'],
          answer: 1, article: A.claude, why: 'Never weaken a check to make a test pass.' },
        { id: 'secret', q: 'May you paste Railway\'s variables into Claude Code to debug?',
          choices: ['Yes', 'No: live secrets never go into it', 'Only the database URL', 'Only at night'],
          answer: 1, article: A.claude, why: 'Never give it live secrets.' },
        { id: 'rules', q: 'Where are the rules every agent and person works by?',
          choices: ['The repository\'s AGENTS.md', 'Stripe', 'Team chat', 'Nowhere'],
          answer: 0, article: A.claude, why: 'When Claude breaks one, the rule wins.' },
        { id: 'claim', q: 'Claude says "all tests pass". You…',
          choices: ['Trust it', 'Run them yourself', 'Merge', 'Ask it again'],
          answer: 1, article: A.claude, why: 'Check the claims that matter.' },
      ],
    },
    buffer: 7,
  },

  /* ── 7 ── */
  {
    key: 'v7', icon: '📱', title: 'Apps, quiet time and talking to June',
    goal: 'Ship apps Apple accepts, use quiet time to find problems before customers do, and keep June informed in plain words.',
    lessons: [{
      id: 'v7-apps', article: A.apps, minutes: 25, tags: 'developer, ios, app store, xcode, sdk, testflight, in-app purchase, rejection, expo',
      goals: ['Build with the SDK Apple requires', 'Test on TestFlight first', 'Read and answer a rejection'],
      body:
`Apps add a reviewer between you and the customer: Apple. Most delays come from not knowing its rules.

**Building**

- Apple only accepts apps built with the current Xcode and iOS SDK. Since April 2026 that means Xcode 26 and the iOS 26 SDK; an older build is refused at upload
- Expo apps: start new ones on a recent Expo SDK that builds with it, and keep existing ones up to date before a release, not on the day of it
- Bump the version and build number for every upload

**Testing**

- **TestFlight first:** every build goes to testers before the store. Test on a real iPhone, not only the simulator
- Test the paths Apple's reviewer will take: sign up, sign in, the main feature, buying anything, deleting the account
- Give the reviewer a working demo account in the review notes if the app needs a sign-in

**The rules that cause most rejections**

- **Digital purchases use in-app purchase.** Subscriptions or features unlocked inside the app must be bought through Apple, not a card form or a link to the website. Physical goods, like shirts, are the exception
- **Subscriptions** must say clearly what they include, the price and the period, with links to the terms and privacy policy, in the app and in the listing
- An app that is only a website in a wrapper is often refused
- Account deletion must be possible inside the app if accounts can be created in it

**When it is rejected**

1. Read the rejection message fully; it names the guideline (3.1.1 is in-app purchase, 3.1.2 is subscriptions)
2. Fix exactly that, in a new build
3. Reply in App Store Connect saying what changed
4. Tell June what happened and the new date, in plain words

Accounts: [owner to fill in: how the developer gets access to App Store Connect and the Apple developer account]`,
    }, {
      id: 'v7-quiet', article: A.quiet, minutes: 20, tags: 'developer, quiet time, logs, errors, customer paths, updates, talking to june, summary',
      goals: ['Find problems customers have not reported', 'Plan a quiet afternoon', 'Write to June without jargon'],
      body:
`Most problems are found by customers. A good developer finds them first.

**A quiet afternoon**

When nothing is broken and nothing is assigned:

1. **Logs and errors:** the last week of Sentry errors and failed requests, starting with checkout and payments. Anything a customer hit but never reported
2. **Walk the customer paths on your phone:** request a quote, pay a deposit, use the design studio, open an emailed link. Fix or note what is broken or slow
3. **Tests:** add tests to money or permission code that has none
4. **Updates:** security updates for dependencies, on a branch, with the tests run
5. **A note to June:** what you checked, what you fixed, what needs her decision

**Talking to June**

June runs the shop; she is not a developer. Write so she can decide in a minute:

- Plain words: "customers could not pay", not "the webhook returned 400"
- What it means for customers and money first, then what you did
- A clear question when you need a decision, with your suggestion
- Bad news early, with what you are doing about it

An example:

"Hi June, a heads-up: the invoice emails will be ready Thursday, not today. While testing I found some refunds were recorded twice in the books. No customer was charged wrongly, but September's total is about $180 too low. I'm fixing that first, since the invoices depend on it, and I'll send the corrected total tomorrow. Nothing you need to do."

**What is June's**

- Anything customers will see that changes how the shop works: new emails, new prices, new steps at checkout
- Anything that moves money, or deletes data
- New services that cost money each month
- Which projects come first

You decide how to build it. She decides what gets built and when it goes out.

**Your end-of-day note**

What shipped, what is open and on whom, anything promised to June, and what you will do first tomorrow.`,
    }],
    practice: [],
    quiz: {
      key: 'dev-7', title: 'Module 7 quiz: apps, quiet time and talking to June', minutes: 10,
      questions: [
        { id: 'sdk', q: 'An app built with an old Xcode SDK is…',
          choices: ['Accepted', 'Refused at upload', 'Accepted with a warning', 'Faster'],
          answer: 1, article: A.apps, why: 'Apple requires the current SDK (Xcode 26 since April 2026).' },
        { id: 'testflight', q: 'Before the App Store, every build goes to…',
          choices: ['Customers', 'TestFlight, tested on a real iPhone', 'Google Play only', 'Nobody'],
          answer: 1, article: A.apps, why: 'TestFlight first.' },
        { id: 'iap', q: 'A subscription unlocked inside the app must be sold through…',
          choices: ['A card form in the app', 'Apple\'s in-app purchase', 'A link to Stripe', 'PayPal'],
          answer: 1, article: A.apps, why: 'Guideline 3.1.1.' },
        { id: 'shirts', q: 'Buying shirts in an app uses…',
          choices: ['In-app purchase', 'A normal checkout: physical goods are the exception', 'Apple Pay only', 'It is not allowed'],
          answer: 1, article: A.apps, why: 'Physical goods are not digital purchases.' },
        { id: 'reject', q: 'The app is rejected under 3.1.2. You…',
          choices: ['Resubmit the same build', 'Read it, fix that in a new build, reply in App Store Connect, tell June', 'Give up', 'Argue'],
          answer: 1, article: A.apps, why: '3.1.2 is subscriptions.' },
        { id: 'quiet', q: 'What comes first in a quiet afternoon?',
          choices: ['New features', 'The last week of errors, starting with checkout and payments', 'Renaming files', 'Nothing'],
          answer: 1, article: A.quiet, why: 'Find what customers hit but never reported.' },
        { id: 'walk', q: 'Walking the customer paths means…',
          choices: ['Reading the code', 'Requesting a quote, paying, using the design studio on your phone', 'Asking customers', 'Checking analytics'],
          answer: 1, article: A.quiet, why: 'Use it like a customer.' },
        { id: 'plain', q: 'Which message to June is best?',
          choices: ['"The webhook returned 400 due to signature mismatch"', '"Customers could not pay for 20 minutes; it is fixed and here is who was affected"', '"Fixed stuff"', '"See logs"'],
          answer: 1, article: A.quiet, why: 'Customers and money first, plain words.' },
        { id: 'decide', q: 'Who decides that a new step is added at checkout?',
          choices: ['You', 'June', 'Claude Code', 'The customer'],
          answer: 1, article: A.quiet, why: 'You decide how; she decides what and when.' },
        { id: 'bad', q: 'You find a bug that made September\'s books $180 low. You tell June…',
          choices: ['After you fix it, maybe', 'Early, with what you are doing about it', 'Never', 'In a year'],
          answer: 1, article: A.quiet, why: 'Bad news early.' },
      ],
    },
    buffer: 7,
  },
];

/* The final exam: new questions across the whole course, 80% to pass. */
const FINAL = {
  floating: 15,
  quiz: {
    key: 'dev-final', title: 'Final exam: the Developer course', minutes: 25,
    questions: null, // dev-core-final.js
  },
  signoffs: [
    { key: 'signoff:handoff', type: 'signoff', minutes: 0,
      title: 'Knows what is June\'s to decide', hint: 'Customer-facing changes, anything moving money or deleting data, new paid services, priorities. June signs this off after seeing you do it.' },
    { key: 'signoff:ready', type: 'signoff', minutes: 0,
      title: 'Ready to ship on their own', hint: 'The last step. June decides when your changes go live without her checking each one first.' },
  ],
};
FINAL.quiz.questions = require('./dev-core-final')(A);

const PAGES = require('./dev-core-pages');
for (const l of MODULES.flatMap((m) => m.lessons)) {
  if (l.pages) continue; // the shared module's lessons carry their own
  l.pages = PAGES[l.id] || [{ from: null, checks: [] }];
  l.checks = l.pages.flatMap((pg) => pg.checks);
}

module.exports = { key: 'dev-core', title: 'Developer', track: 'developer', articles: A, glossary: GLOSSARY, modules: MODULES, final: FINAL };
