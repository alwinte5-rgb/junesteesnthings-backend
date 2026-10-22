'use strict';

/* The training academy: one file per course, registered here.

   Every salesperson walks the consolidated Sales course (sales-core.js) until
   the owner gives them one of the three sales roles on Staff. The role then
   adds a second course written only for that job (sales-leadgen.js,
   sales-closer.js, sales-accounts.js as they are written). A role whose course
   is not written yet adds nothing, so assigning it early is harmless.

   A course is plain data: modules of lessons (playbook articles the owner can
   edit), practice steps, a quiz per module and a buffer row, then a final exam.
   tools/lib/training.js turns it into steps; tests/courses.test.js checks every
   course adds up to eight hours with at least an hour of buffer.

   Every other job has one course of its own (design-core.js for designers,
   content-core.js for the content (video) person, ads-core.js for ads, books-core.js for the bookkeeper, dev-core.js for the developer,
   software-core.js for the software sales agent).
   Each opens with the Team basics module (shared-team.js), the same module
   object in every course: its quiz and lessons are registered once. */

const SALES_CORE = require('./sales-core');
const SALES_LEADGEN = require('./sales-leadgen');
const SALES_CLOSER = require('./sales-closer');
const SALES_ACCOUNTS = require('./sales-accounts');
const DESIGN_CORE = require('./design-core');
const CONTENT_CORE = require('./content-core');
const ADS_CORE = require('./ads-core');
const BOOKS_CORE = require('./books-core');
const DEV_CORE = require('./dev-core');
const SOFTWARE_CORE = require('./software-core');
const ALL = [SALES_CORE, SALES_LEADGEN, SALES_CLOSER, SALES_ACCOUNTS, DESIGN_CORE, CONTENT_CORE, ADS_CORE, BOOKS_CORE, DEV_CORE, SOFTWARE_CORE];

/* June's answers to the blanks in each lesson (answers.js). The unanswered
   body joins `was`, so a live copy she has not edited is replaced. */
const ANSWERS = require('./answers');
for (const c of ALL) {
  for (const l of c.modules.flatMap((m) => m.lessons)) {
    if (!l.body) continue;
    let b = l.body;
    for (const [token, answer] of Object.entries(ANSWERS)) b = b.split(token).join(answer);
    if (b !== l.body) { l.was = [...(l.was || []), l.body]; l.body = b; }
  }
}

/* Wording changed after lessons went live: [now, then]. A live article that
   still reads the old way (answers above already filled in) and was not
   otherwise edited is brought up to date. Applied after the answers, because
   the live copy has them filled in.
   2026-10-11: rush is embroidery only (Codex #195); handoffs to sales go to
   # Everyone, the channel content and ads helpers can see (Codex #224). */
const REWORDED = [
  /* 2026-10-22 (plan PR 4): the software leads board replaces the Google Sheet. */
  ["All of this lives on **Software leads** in the back office (in the menu under Sales). Add each prospect there with the link where you found them and your one detail, and log every message and call on the lead. Its **Find leads with AI** button searches the web for people who post for several brands; check each result before you add it. A lead counts once a contact is logged.",
   "Until the software leads board is in the staff workspace, June gives you a shared Google Sheet with these same columns. Use only that sheet."],
  ["**Rush**\n\nOnly **embroidery** can be rushed: it is the one thing we make in house. Screen printing and DTF are made for us by a partner in 7 to 10 business days, and they sell no rush at any price. So for a screen print, DTF, or a mix that includes either, the answer to \"can you do it faster?\" is \"let me ask June\", never a yes and never a price.\n\nOn embroidery, for a fee, depending on what is on the machine:\n\n- Next business day: +80%\n- 2 business days: +50%\n- 3 business days: +30%\n- 4 business days: +10%\n\nThe quote form sets the rush from the **Needed by** date you enter, so get the real date from the customer. Never promise a rush date before June confirms it can be done.",
   "**Rush**\n\nFor a fee, depending on what is on the press:\n\n- Next business day: +80%\n- 2 business days: +50%\n- 3 business days: +30%\n- 4 business days: +10%\n\nThe quote form sets the rush from the **Needed by** date you enter, so get the real date from the customer. Never promise a rush date before June confirms the press can do it."],
  ['in the # Everyone channel, tagged "for sales", the same day, so sales can follow up (content helpers cannot see # Sales)',
   'in the # Sales channel, the same day, so sales can follow up'],
  ['send would-be customers to the quote form and post them in the # Everyone channel for sales',
   'send would-be customers to the quote form and the # Sales channel'],
  ['2. Tell sales in # Everyone that a test is coming', '2. Tell sales in # Sales that a test is coming'],
  ['point them to the quote form and post it in # Everyone for sales\n', 'point them to the quote form and post it in # Sales\n'],
  ['Ask sales in # Everyone which quote requests', 'Ask in # Sales which quote requests'],
  ['every Monday, sales posts in # Everyone which', 'every Monday, sales posts in # Sales which'],
  /* Codex #230: the ad cap now allows for Google's overdelivery, and the
     developer is told the repo's self-merge rule is not theirs. */
  ['$100 a month at most to start, and never more than $5 on any one day. Google may spend up to twice the daily budget on a busy day, so set it to $2.50 a day (about $76 a month): then no day can pass $5. June raises it',
   '$100 a month to start (about $3 a day), and never more than $5 on any one day. June raises it'],
  [' The repository rules tell Claude Code to merge its own finished pull request; you do not: tell it to stop at an open pull request, and GitHub keeps main locked until June approves.', ''],  /* 2026-10-13: the weekly Ads report example at the owner's budget; approved quotes are emailed. */
  ["- Spent $22 of about $23. 2 quote requests ($11 each, under our $15 target), 1 order worth $450\n- About $180 profit for $22 of ads, so it is paying for itself\n- 'Custom apparel' spent $8 with nothing, mostly people looking for wholesale blanks. I paused it and added those searches as negatives\n- Next week: I would move that $8 to 'team shirts chicago', our best keyword. OK?\n- Back-to-school campaign is built and paused, ready for July 1 at $2.50 a day. Say yes and I will switch it on.\"",
   "- Spent $140 of $150. 9 quote requests ($15.50 each), 3 orders worth $1,250\n- About $500 profit for $140 of ads, so it is paying for itself\n- 'Custom apparel' spent $35 with nothing, mostly people looking for wholesale blanks. I paused it and added those searches as negatives\n- Next week: I would move that $35 to 'team shirts chicago', our best keyword. OK?\n- Back-to-school campaign is built and paused, ready for July 1 at $8 a day. Say yes and I will switch it on.\""],
  ["Approving a quote emails it to the customer for you; only one that could not be emailed shows on My Day for you to send.",
   "Once approved it shows on My Day; then you copy the message and send it."],
  /* 2026-10-13: a Closer may give up to 5% on 48+ pieces (owner). */
  ['- Any discount beyond your 5% on 48 pieces or more (see Objections), and every price match, free item or custom price',
   '- Any discount, price match, free item or custom price'],
  /* 2026-10-13: nothing works out a prospecting reply rate for you. */
  ["- Your messages and their replies are on record, so you and June can work out your reply rate (replies divided by first messages)",
   "- Your messages and replies are counted, which is how your reply rate is worked out"],
  /* 2026-10-13: one end-of-day note, posted in Team chat. */
  ["- **End:** post your end-of-day note in Team chat, in your channel where June sees it: what you finished, what is waiting and on whom, and what you will do first next time. Someone else may need to pick it up before you are back",
   "- **End:** write a short note in your channel: what you finished, what is waiting and on whom, and what you will do first next time. Someone else may need to pick it up before you are back"],
  ["Before you sign off, post it in Team chat, as in Team basics: leads answered, quotes sent, follow-ups done, anything stuck and what you need, and the first thing you will do tomorrow.",
   "Before you sign off: leads answered, quotes sent, follow-ups done, anything stuck and what you need, and the first thing you will do tomorrow."],
  /* 2026-10-13: Ads figures match the owner's $15 target and $100 a month. */
  ["Anything (a keyword, an ad group, an ad) that has spent about **$40 with no quote request** gets paused. Our target is under $15 a quote request, so $40 with none is more than two and a half times what one should cost; when something has spent that and brought none, it is unlikely to start. On a $100 month, $40 is a big share, so check spend twice a week.",
   "Anything (a keyword, an ad group, an ad) that has spent about **$40 with no quote request** gets paused. That is roughly what one quote request should cost; when something has spent that and brought none, it is unlikely to start."],
  ["Example: $95 spent in a month, 7 quote requests (about $13.60 each, under our $15 target), 2 orders worth $900. About $360 profit for $95 of ads: it is paying for itself.",
   "Example: $140 spent, 9 quote requests ($15.50 each), 3 orders worth $1,250. About $500 profit for $140 of ads: it is paying for itself."],
  /* 2026-10-13: the developer stops at an open pull request; June merges, deploys and rolls back (owner, 2026-10-12). */
  ["6. **Stop at the open pull request.** June reviews it and merges it; GitHub keeps main locked until she approves\n7. Merging to main **deploys automatically** on Railway. June watches the deploy, and tells you when it is live",
   "6. **Squash-merge** when it is ready\n7. Merging to main **deploys automatically** on Railway. Watch it"],
  ["- You start without Railway access, so June checks the deploy succeeded and its logs start clean: the database is ready and the server is listening, with no errors. Ask her for the logs if you need them\n- Once she says it is live, open the page you changed, on your phone, and try the thing you fixed\n- For anything touching payments, ask June to make a real small test (Module 5)",
   "- Wait for Railway to show the deploy as successful\n- Read the start of its logs: the database is ready and the server is listening, with no errors\n- Open the page you changed, on your phone, and try the thing you fixed\n- For anything touching payments, make a real small test (Module 5)"],
  ["- Just before June stops for the day. Ask her to merge when someone can watch it for an hour",
   "- Just before you stop for the day. Deploy when you can watch it for an hour"],
  ["**Read the logs**\n\nYou start without Railway or Sentry access: ask June for the logs and errors below (a copy or a screenshot), with the time it started.",
   "**Read the logs**"],
  ["If a deploy caused it, the previous working version goes back live first. Open a pull request that reverts the merge, and tell June which deploy to roll back on Railway; she does it, since you have no Railway access. Customers can pay again in minutes. Then fix it properly on a branch, with a test, without customers waiting on you.",
   "If a deploy caused it, put the previous working version back live (redeploy it on Railway, or revert the merge so main deploys the old code). Customers can pay again in minutes. Then fix it properly on a branch, with a test, without customers waiting on you."],
  /* 2026-10-13: the bookkeeper prepares and June enters (owner, 2026-10-12): their access is read-only. */
  ["An expense without a receipt is a guess, and a guess is what an auditor or the tax office will question first.\n\n**You prepare, June enters**\n\nYour access to the books is read-only. You prepare each entry, with everything below, on your list for June, and she enters it. That keeps one person changing the books and a second checking them.\n\n**Every expense needs**",
   "An expense without a receipt is a guess, and a guess is what an auditor or the tax office will question first.\n\n**Every expense needs**"],
  ["A business cost paid on someone's own card is still a business cost. List it with a note of who paid, so June can pay them back or treat it as money she put in.",
   "A business cost paid on someone's own card is still a business cost. Record it with a note of who paid, so June can pay them back or treat it as money she put in."],
  ["Rent, software and the phone repeat. June ticks them as monthly once, and they copy themselves into each new month. Each month, check every copy was really paid at that amount, and tell June about a price rise or a cancelled subscription so she changes it, rather than letting it roll forward.",
   "Rent, software and the phone repeat. Tick them as monthly once, and they copy themselves into each new month. Each month, check every copy was really paid at that amount. A price rise or a cancelled subscription must be changed, not left to roll forward."],
  ["Before you list an expense, check it is not already in the books: a monthly copy, a supplier invoice already entered, or a cost someone else recorded. Two entries for one cost make profit look smaller than it is.",
   "Before adding an expense, check it is not already there: a monthly copy, a supplier invoice already entered, or a cost someone else recorded. Two entries for one cost make profit look smaller than it is."],
  ["1. Note the job's quote code from the invoice\n2. Compare each line with the invoice\n3. List the job, each line and what we actually paid, for June to enter\n4. Note anything unusual: a substitute shirt, a reprint, extra shipping\n\nJobs the system could not cost at all are listed on the Finances page. List their real costs from the invoices the same way.",
   "1. Find the job (by its quote code) and open its costs on the job page\n2. Compare each line with the invoice\n3. Change the amounts to what we actually paid\n4. Note anything unusual: a substitute shirt, a reprint, extra shipping\n\nJobs the system could not cost at all are listed on the Finances page. Fill those in from the invoices."],
  ["3. For each item on the statement but not in the books, list it for June to enter (with a receipt and category if it is a cost)",
   "3. For each item on the statement but not in the books, record it (with a receipt and category if it is a cost)"],
  /* 2026-10-13: a small screen run is charged as 50 (not refused); embroidery's 5-piece minimum. */
  ["- **Minimum:** a run under 50 pieces is charged as 50, with the shortfall on its own line. Each screen is set up once and runs the whole job, so small runs are expensive. Under 50, the quote form shows an orange warning and suggests DTF",
   "- **Minimum:** 50 pieces. Each screen is set up once and runs the whole job, so small runs are expensive. Under 50, the quote form shows an orange warning and suggests DTF"],
  ["- **Best for:** logos on polos, caps, jackets, bags and workwear. It looks premium and lasts\n- **Minimum:** 5 pieces\n- **Digitizing:",
   "- **Best for:** logos on polos, caps, jackets, bags and workwear. It looks premium and lasts\n- **Digitizing:"],
  ["Under 50 pieces, screen printing is charged as 50. For fewer, offer DTF: no minimum, full colour.",
   "Screen printing starts at 50. For fewer, offer DTF: no minimum, full colour."],
  /* 2026-10-13: approving a held quote emails it; My Day lists only one that was not emailed. */
  ["Press **Quote** on the lead and build it (module 5). If your quote is waiting for June's approval, approving it emails it to the customer for you. Only a quote that could not be emailed (no email address, or the email failed) shows on My Day for you to send yourself.",
   "Press **Quote** on the lead and build it (module 5). If your quote is waiting for June's approval, it shows on My Day once approved; then copy the message and send it."],
  ["- Finishing makes it ready to send. While you are in training it goes to June first, and approving it emails it to the customer. Only one that could not be emailed shows on My Day for you to send",
   "- Finishing makes it ready to send. While you are in training it goes to June first; once approved it shows on My Day for you to send"],
  /* 2026-10-13: only DTF can be rushed (owner, 2026-10-12). */
  ["Only **DTF** can be rushed. Screen printing, embroidery and cutouts cannot be rushed at any price. So for a screen print, embroidery, cutouts, or a mix that includes any of them, the answer to \"can you do it faster?\" is \"let me ask June\", never a yes and never a price.\n\nOn DTF, for a fee, depending on what is already in the queue:",
   "Only **embroidery** can be rushed: it is the one thing we make in house. Screen printing and DTF are made for us by a partner in 7 to 10 business days, and they sell no rush at any price. So for a screen print, DTF, or a mix that includes either, the answer to \"can you do it faster?\" is \"let me ask June\", never a yes and never a price.\n\nOn embroidery, for a fee, depending on what is on the machine:"],
  ["The quote form sets the rush from the **Needed by** date you enter, and only when every item is DTF, so get the real date from the customer. Never promise a rush date before June confirms it can be done.",
   "The quote form sets the rush from the **Needed by** date you enter, so get the real date from the customer. Never promise a rush date before June confirms it can be done."],
  ["- **A DTF order with a tight date:** rush, offered honestly, only after checking with June. Nothing else can be rushed",
   "- **Any order with a tight date:** rush, offered honestly, only after checking the press"],
  ["- Put in the needed-by date. The form adds rush if the date needs it and every item is DTF (nothing else can be rushed), and says why",
   "- Put in the needed-by date. The form adds rush if the date needs it, and says why"],
  ["Check the production board and ask June. Only DTF can be rushed, and only when there is room. Put the date in the quote and the form adds the rush fee on DTF.",
   "Check the production board and ask June. Offer rush only when the press has room. Put the date in the quote and the form adds the rush fee."],
  /* 2026-10-13: the shop does not pay for ChatGPT or Firefly, so the design
     AI lesson teaches our AI designer and Vectorizer.ai; Team basics says
     where a note goes for helpers who do not work on orders. */
  ["- **Our website's AI designer:** the AI image tool we use. Customers make designs with it on jtees.net, and you can use it for concepts and flat illustrations too. Ask for \"flat vector style, solid colors, no gradients, no shadows, plain white background\"; the Playbook has ready prompts (\"Print-ready design idea\"). You will mostly be fixing what it made (next lesson)\n- **Photoshop Generative Fill:** built into Photoshop, for editing photos and mockups: extending backgrounds, removing objects. Use only what comes with the shop's Photoshop\n- **Vectorizer.ai:** turns clean raster art into a vector. Good for AI concepts and simple logos; always clean the result by hand\n- Never sign up for, or pay for, another AI tool for shop work (ChatGPT, Midjourney, Firefly or any other) without asking June first",
   "- **ChatGPT (images):** concepts and flat illustrations from a description. Ask for \"flat vector style, solid colors, no gradients, no shadows, plain white background\"; the Playbook has ready prompts (\"Print-ready design idea\")\n- **Photoshop Generative Fill and Firefly:** editing photos and mockups, extending backgrounds, removing objects. Firefly is trained on licensed images, so it is the safer choice for anything we publish\n- **Our website's AI designer:** customers make designs with it on jtees.net. You will mostly be fixing what it made (next lesson)\n- **Vectorizer.ai:** turns clean raster art into a vector. Good for AI concepts and simple logos; always clean the result by hand"],
  ["- **The job page** (if you work on orders): everything about one order. Notes about a job go on the job, not only in chat, so the next person finds them",
   "- **The job page**: everything about one order. Notes about a job go on the job, not only in chat, so the next person finds them"],
  ["ask for a quick call instead, then write down what was decided: on the job page if it is about an order, otherwise in the chat thread.",
   "ask for a quick call instead, then write down what was decided on the job page."],
  ["- If your job messages customers, send from the job page or the Playbook tools, not from your own email or phone.",
   "- Send messages from the job page or the Playbook tools, not from your own email or phone."],
];
/* Each earlier wording the live copy may still hold (the body and every
   `was`, so a lesson whose blanks were unanswered when it went live is
   matched too) is turned back to the old words. Team basics is one lesson
   object shared by every course, so each lesson is done once. */
const reworded = new Set();
for (const c of ALL) {
  for (const l of c.modules.flatMap((m) => m.lessons)) {
    if (reworded.has(l) || typeof l.body !== 'string' || !REWORDED.some(([now]) => l.body.includes(now))) continue;
    reworded.add(l);
    /* Every mix of the changes undone, not only all of them: a lesson changed
       twice (rush: any method, then embroidery only, then DTF only), or in two
       places at different times, may be live at any of those wordings. */
    const was = new Set(l.was || []);
    for (const b of [l.body, ...(l.was || [])]) {
      let frontier = [b];
      for (let depth = 0; depth < 8 && frontier.length && was.size < 400; depth++) {
        const next = [];
        for (const t of frontier) {
          for (const [now, then] of REWORDED) {
            if (!t.includes(now)) continue;
            const u = t.split(now).join(then);
            if (!was.has(u) && u !== l.body) { was.add(u); next.push(u); }
          }
        }
        frontier = next;
      }
    }
    was.delete(l.body);
    l.was = [...was];
  }
}

const COURSES = { [SALES_CORE.key]: SALES_CORE, [SALES_LEADGEN.key]: SALES_LEADGEN, [SALES_CLOSER.key]: SALES_CLOSER,
  [SALES_ACCOUNTS.key]: SALES_ACCOUNTS, [DESIGN_CORE.key]: DESIGN_CORE, [CONTENT_CORE.key]: CONTENT_CORE,
  [ADS_CORE.key]: ADS_CORE, [BOOKS_CORE.key]: BOOKS_CORE,
  [DEV_CORE.key]: DEV_CORE, [SOFTWARE_CORE.key]: SOFTWARE_CORE };

/* The course each non-sales track walks. */
const TRACK_COURSES = { design: [DESIGN_CORE], content: [CONTENT_CORE], ads: [ADS_CORE], bookkeeper: [BOOKS_CORE], developer: [DEV_CORE], software: [SOFTWARE_CORE] };

/* The three sales jobs. Until all three are filled, everyone does all of it. */
const SALES_ROLES = {
  leadgen:  { label: 'Lead Generation', goal: 'Fill the pipeline: find groups that need shirts soon, make the first personal contact, and turn replies into quote requests.' },
  closer:   { label: 'Sales Closer', goal: 'Turn every inbound lead into a paid order: reply fast, quote right, upsell, follow up and collect the deposit.' },
  accounts: { label: 'Account Manager', goal: 'Keep past customers ordering: reorders, yearly accounts, reviews and upgrades.' },
};

/** A sales role from anywhere (a form, a row), or null for "not assigned yet". */
function salesRoleOf(r) {
  return Object.prototype.hasOwnProperty.call(SALES_ROLES, r) ? r : null;
}

/** The courses a helper walks, in order: the track's core course, then their role's. */
function coursesFor(track, role = null) {
  if (track !== 'sales') return Object.prototype.hasOwnProperty.call(TRACK_COURSES, track) ? TRACK_COURSES[track] : [];
  const out = [SALES_CORE];
  const r = salesRoleOf(role);
  if (r && COURSES[`sales-${r}`]) out.push(COURSES[`sales-${r}`]);
  return out;
}

/** Every lesson article across every course, for the playbook. */
function lessonArticles() {
  const seen = new Set();
  return Object.values(COURSES).flatMap((c) => c.modules.flatMap((m) => m.lessons.filter((l) => !l.existing && !seen.has(l) && seen.add(l)).map((l) => ({
    kind: 'course', title: l.article, tags: `training, course, ${m.key === 'team' ? 'team basics' : c.title.toLowerCase()}, ${l.tags || ''}`.replace(/,\s*$/, ''),
    body: l.body, needsReview: true, ...(l.was ? { was: l.was } : {}),
  }))));
}

/** One glossary across every course; the first definition of a term wins. */
function glossary() {
  const out = {};
  for (const c of Object.values(COURSES)) for (const [k, v] of Object.entries(c.glossary || {})) if (!out[k]) out[k] = v;
  return out;
}

module.exports = { COURSES, SALES_ROLES, salesRoleOf, coursesFor, lessonArticles, glossary };
