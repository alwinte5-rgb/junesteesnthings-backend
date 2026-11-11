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
  /* 2026-11-06: logins come through Resources (Show once), not Bitwarden; a free trial ask goes to the COS free plan (owner). */
  ["**Shared logins**\n\nSome shop tools (social accounts, Canva, supplier sites) have shared logins. They are never sent in chat, email or texts. June shares each one you need on the **Resources** page, under **Logins June shared with you**: press **Show once**, save it, and check it works. It is erased the moment it shows, so if you lose it, ask June to share it again. The Playbook's \"Logins June shares with you\" has the steps. The Resources page also lists the tools we use.",
   "**Your password manager**\n\nSome shop tools (social accounts, Canva, supplier sites) have shared logins. They are never sent in chat or email. June invites you to the team password manager, and the Resources page lists each tool and where its login is. [owner to fill in: which password manager, and which tools sales uses]"],
  ["**Shared logins**\n\nSome shop tools (social accounts, Canva, supplier sites) have shared logins. They are never sent in chat, email or texts. June shares each one you need on the **Resources** page, under **Logins June shared with you**: press **Show once**, save it, and check it works. It is erased the moment it shows, so if you lose it, ask June to share it again. The Playbook's \"Logins June shares with you\" has the steps. The Resources page also lists the tools we use.",
   "**Your password manager**\n\nSome shop tools (social accounts, Canva, supplier sites) have shared logins. They are never sent in chat or email. June invites you to the team password manager, and the Resources page lists each tool and where its login is. We use Bitwarden (free), with a shared June's Tees vault; June invites you. The tools you need are on the Resources page."],
  ["- **The free plan:** for anyone, no card needed. Good for small businesses you send to the website, and for anyone who asks for a free trial\n- **Half price",
   "- **The free plan:** for anyone, no card needed. Good for small businesses you send to the website\n- **Half price"],
  ["There is no free trial of a paid plan. The AI costs us money from day one, so a new customer pays something from their first month. Someone who wants to try COS first uses the free plan: Facebook, Instagram and Threads only, up to 10 posts a month, captions written for them, no AI graphics or video. It costs us almost nothing to run, and they can move up to a paid plan at half price for the first month.",
   "There is no free trial of a paid plan. The AI costs us money from day one, so a new customer pays something from their first month."],
  /* 2026-11-06: rush capped at 70% for same day: 70 / 50 / 35 / 20 / 10 (owner). */
  ["- Same day: +70% (the most rush ever costs)\n- Next business day: +50%\n- 2 business days: +35%\n- 3 business days: +20%\n- 4 business days: +10%",
   "- Next business day: +80%\n- 2 business days: +50%\n- 3 business days: +30%\n- 4 business days: +10%"],
  /* 2026-11-06: no free trials (owner: "I still have to pay for the AI"); the approved offer is half price for the first month. */
  ["The numbers that matter are replies, demos and first months started.",
   "The numbers that matter are replies, demos and trials."],
  ["- Status: new, contacted, replied, demo booked, first month, won or lost",
   "- Status: new, contacted, replied, demo booked, trial, won or lost"],
  ["- **First month:** they signed up and are on their half-price first month",
   "- **Trial:** they started the 14-day free trial"],
  ["messages sent, replies, demos, first months started, customers won. Those numbers",
   "messages sent, replies, demos, trials started, customers won. Those numbers"],
  ["4. One easy question: a 15-minute look, or starting with two clients at half price for the first month",
   "4. One easy question: a 15-minute look, or the free trial"],
  ["- **Day 7:** a different angle: the half-price first month, or what another agency type does with it",
   "- **Day 7:** a different angle: the trial, or what another agency type does with it"],
  ["Happy to show you in 15 minutes, and your first month is half price if you want to start with two clients.\"",
   "Happy to show you in 15 minutes, or you can try it free for 14 days.\""],
  ["ask directly: \"Would you like to start with two of your clients? Your first month is half price.\"",
   "ask directly: \"Would you like to try it with two of your clients for 14 days?\""],
  ["4. **Lower the risk with a next step:** \"Start with two clients. Your first month is half price.\"",
   "4. **Lower the risk with a next step:** \"Try it with two clients for 14 days.\""],
  ["Our prices leave a thin margin, and every customer's AI use costs us money from their first day, so offers are tightly controlled. You may use three without asking. Everything else is June's decision, before you mention it.\n\n**What you may offer**\n\n- **The free plan:** for anyone, no card needed. Good for small businesses you send to the website\n- **Half price for the first month of a paid plan:** 50% off month one ($64.50 instead of $129 on Agency), then the full price from month two unless they cancel. They pay with their own card from day one. Tell June in your channel the same day they sign up, so she adds the discount to their account (your agent link will add it for you once it is built)\n- **The yearly plan:** two months free, already in the price ($1,290 a year for Agency)\n\nThere is no free trial of a paid plan. The AI costs us money from day one, so a new customer pays something from their first month.\n\n**What needs June first**\n\n- Any other discount or coupon, of any size\n- A second discounted month, or more than 50% off the first\n- A free trial of any length\n",
   "Our prices leave a thin margin, so offers are tightly controlled. You may use three without asking. Everything else is June's decision, before you mention it.\n\n**What you may offer**\n\n- **The free plan:** for anyone, no card needed. Good for small businesses you send to the website\n- **A 14-day free trial of a paid plan:** the customer starts paying after 14 days unless they cancel. Check with June that trials are switched on for that app before you offer one\n- **The yearly plan:** two months free, already in the price ($1,290 a year for Agency)\n\n**What needs June first**\n\n- Any discount or coupon, of any size\n- A longer trial than 14 days\n"],
  ["\"I can't change the price, but I can make it easy to start: your first month is half price, so begin with two clients and see the time it saves. And yearly saves you two months.\"",
   "\"I can't change the price, but I can make it easy to be sure first: try it free for 14 days with two clients. And yearly saves you two months.\""],
  ["A new customer's half-price first month is won or lost in the first two days. If they connect their clients and see a week of posts planned, they stay. If they sign up and forget, they cancel before month two.\n\n**Day 0: start it with them**\n\nBook the start as a short call where you can. Together:\n\n- They sign up while they are already on the board as your lead (and from your agent link, once June gives you one), so the customer is credited to you\n- They pick the plan and enter their own card. Tell June in your channel the same day, so she adds the 50% first-month discount to their account\n- They create two client brands",
   "A trial is won or lost in the first two days. If they connect their clients and see a week of posts planned, they stay. If they sign up and forget, they leave.\n\n**Day 0: start it with them**\n\nBook the start as a short call where you can. Together:\n\n- They sign up while they are already on the board as your lead (and from your agent link, once June gives you one), so the customer is credited to you\n- They create two client brands"],
  ["- **Day 21:** before month two starts at the full price, ask: \"Your first month ends next week. Do you want to keep going monthly, or switch to yearly with two months free?\"",
   "- **Day 12:** ask for the decision: \"Your trial ends on Friday. Do you want to keep going on monthly, or yearly with two months free?\""],
  ["If it is truly not a fit, tell them how to cancel before month two, without pressure, and mark the lead lost with the reason.\n\n**When month two is paid**\n\nMark the lead won,",
   "If it is truly not a fit, let the trial end without pressure and mark the lead lost with the reason.\n\n**When they pay**\n\nMark the lead won,"],
  ["- Promise a bigger discount, or a second half-price month, without June",
   "- Promise the trial can be extended without June"],
  ["- The first-month start call and the check-ins",
   "- The trial start call and the check-ins"],
  ["1. Messages sent, replies, demos, first months started, customers won (plan, monthly or yearly)",
   "1. Messages sent, replies, demos, trials started, customers won (plan, monthly or yearly)"],
  ["\"Week 3: 85 messages, 11 replies, 4 demos, 2 first months, 1 won (Agency, yearly).",
   "\"Week 3: 85 messages, 11 replies, 4 demos, 2 trials, 1 won (Agency, yearly)."],
  ["Need: a yes or no on a second half-price month for a 20-client agency.\"",
   "Need: a yes or no on a 30-day trial for a 20-client agency.\""],
  ["- Replies but few demos: the ask is too big. Offer a short video of COS doing their kind of work instead\n- Demos but no sign-ups: discovery missed their real problem\n- First months but no sales: the first two days need more help",
   "- Replies but few demos: the ask is too big. Offer the trial instead\n- Demos but no trials: discovery missed their real problem\n- Trials but no sales: the first two days need more help"],
  /* 2026-11-06: every course brought up to date: Team basics and the Sales tour teach the clock, tasks, projects, bell, Mailbox and tour; chat alerts are capped at two a day; turnaround 5–7 / 7–14 from the deposit (or proof when we design); Claude replies on leads; quote shipping, services, Email and text it, reinstating; customer certificates accepted on upload (#519); the finder's running list and 2 searches a day; Meta Conversions API. */
  ["While the back office is open, a new message rings the bell at the top, with a sound and a pop-up if you turn them on from the bar on My Day. If a message has been unread for 10 minutes, the person also gets an email about it, at most two a day. You can switch your own alert emails off on the Team chat page, but then check Team chat at the start of every hour you work.",
   "If a message has been unread for 10 minutes, the person gets one email about it. You can switch your own alert emails off on the Team chat page, but then check Team chat at the start of every hour you work."],
  ["**Your shift in the back office**\n\n- **Clock in** on the Timeclock when you start and out when you stop, breaks included. Your pay comes from these hours, and your first clock-in each day posts your open tasks to June's Mailbox, so she sees your plan\n- **Tasks** sit on My Day by how long they take: Now, This week, Big project, plus Every day. Press **Start** when you take one on and **Mark completed** when it is done, saying what you did; some ask for proof (files or a link). The next one arrives by itself. Stuck on one? Its **Stuck?** link tells June\n- **Projects** are big work split into steps of about two hours on a timeline. Do the pink step; the next opens once it is completed\n- **Mailbox** keeps a conversation about one job or one task with it, so nothing is lost in chat. Every task has **Message about this task**\n- **My stats** shows what your week adds up to: hours, and tasks done on time\n- The **back-office tour** on My Day walks you through each of these screens in about ten minutes. Do it on your first day\n\n**Start and end of your day**\n\n- **Start:** clock in, then open My Day and Team chat. Read anything new before you start your own work",
   "**Start and end of your day**\n\n- **Start:** open My Day and Team chat. Read anything new before you start your own work"],
  ["My Day is your to-do list, built for you. Work it top to bottom; the counts at the top jump to each section:\n\n- People waiting on you: leads waiting for a reply, oldest first, and follow-ups due today (the dates you set on leads)\n- Your tasks and projects, your training, and June's latest note\n- The jobs you are part of",
   "My Day is your to-do list, built for you. Work it top to bottom:\n\n- Leads waiting for a reply, oldest first\n- Follow-ups due today (the dates you set on leads)\n- Your tasks, your training, and June's latest note"],
  ["**Clock, tasks and the bell**\n\n- **Clock in** on the Timeclock when you start and out when you stop, breaks included. Your pay comes from these hours. Your first clock-in each day posts your open tasks to June's Mailbox, so she sees your plan\n- **Tasks** sit on My Day by how long they take: Now, This week, Big project, plus Every day. Press **Start** when you take one on and **Mark completed** when it is done, saying what you did; some ask for proof. The next one arrives by itself. Stuck? Use the task's **Stuck?** link\n- **Projects** are big work, such as a season's campaign, split into steps of about two hours. Do the pink step; the next opens once it is completed\n- **The bell** at the top counts what is new for you. Turn on sound and pop-ups from the bar on My Day so a new lead, task or message reaches you even in another tab\n- **Mailbox** keeps a conversation about one job or one task with it. Every task has **Message about this task**\n- **My stats** shows your week: hours, tasks done on time, and the people you found, contacted and heard back from\n- The **back-office tour** on My Day walks you through these screens in about ten minutes. Do it on your first day\n\n**Training and My earnings**\n\nTraining is this course.",
   "**Training and My earnings**\n\nTraining is this course."],
  ["- Small orders are ready in 5–7 business days and larger ones in 7–14, plus shipping time if we ship it\n- The clock starts when they pay the deposit, or when they approve the proof if we are designing it for them, not at the first message. Late artwork or a late approval moves the date\n- A Design Studio order (they designed it themselves on jtees.net) has no proof: it prints exactly as they made it",
   "- Most orders are ready in about 10 business days after the customer approves the proof and pays the deposit\n- The clock starts at proof approval and deposit, not at the first message. Late artwork or a late approval moves the date"],
  ["- Small orders are ready in 5–7 business days and larger ones in 7–14, plus shipping time if we ship it\n- The clock starts when they pay the deposit, or when they approve the proof if we are designing it for them, not at the first message. Late artwork or a late approval moves the date\n- A Design Studio order (they designed it themselves on jtees.net) has no proof: it prints exactly as they made it",
   "- Most orders are ready in [standard turnaround, owner to fill in] business days after the customer approves the proof and pays the deposit\n- The clock starts at proof approval and deposit, not at the first message. Late artwork or a late approval moves the date"],
  ["**Write a reply with Claude**\n\nOpen the lead's full message first: it shows everything they wrote. Then, in the email box on the lead, **Write a reply with Claude** answers what they asked, with our list prices, and replaces the message for you to edit. To change it, type what to change (\"women's cotton tees only, shorter\") and press **Rewrite**. Anything Claude cannot know comes back marked \"June to fill in\", and the email will not send until you replace it with the real answer (ask June if you do not know). Always read it before you send: it is your message, not Claude's. Once a lead is contacted it moves to its own section, and the same button becomes **Suggest a follow-up with Claude**.\n\n**Phone and chat**\n\n- On the phone",
   "**Phone and chat**\n\n- On the phone"],
  ["The customer uploads it on their quote page and it is accepted straight away, so tax comes off. June checks it later on **Certificates**; if she refuses it, the tax is added back. One you attach for them waits for June to approve.",
   "The customer uploads it on their quote page; you pre-screen it on **Certificates** and June approves it."],
  ["**Shipping**\n\nIf the order ships, the quote prices postage at cost from a live rate when the customer accepts, from their address. If June types a shipping figure, hers is used instead. Pickup is free; local delivery has its own fee.\n\n**Services**\n\nDesign fees, folding and the **garment sourcing fee** sit under their own heading on the form. The sourcing fee ($25) is paid before we research garments or make a spec sheet, and it comes off their order if they order within 30 days. Design-only work is not taxed.\n\n**Discounts**\n\nThe Discount box is June's. Do not use it without her say-so. A Business Partner's code applies itself on their quotes.",
   "**Discounts**\n\nThe Discount box is June's. Do not use it without her say-so."],
  ["**After it is sent**\n\nOnce you may send quotes yourself, **Email and text it** sends the link both ways in one tap (it refuses if either cannot go, so nothing half-sends). The customer's link always shows the latest version, so a fix is just an edit and a save. An expired quote can be **Reinstated** from the board or the job page: same prices, 14 more days.",
   "**After it is sent**\n\nThe customer's link always shows the latest version, so a fix is just an edit and a save."],
  ["- Taking tax off yourself (a customer uploads their certificate on their quote page; it is accepted straight away and June checks it)",
   "- Taking tax off (a customer uploads their certificate and June approves it)"],
  ["- Tax is added automatically. A tax-exempt customer uploads their certificate on their quote page; it is accepted straight away and tax comes off. June checks it later and, if she refuses it, the tax is added back",
   "- Tax is added automatically. A tax-exempt customer uploads their certificate on their quote page, and June approves it"],
  ["The customer uploads it on their quote page; it is accepted straight away and June checks it later. You never take tax off yourself.",
   "The customer uploads it on their quote page and June approves it. You never take tax off yourself."],
  ["- **Quotes:** the shop attaches the certificate, or the customer uploads it. Payment waits until one is on file\n- **A certificate the customer uploads** (on a quote page, or at checkout on a design studio order) is accepted as it lands: tax comes off and the order is free to print. June marks it checked, or refuses it, later on **Certificates**. If she refuses it, the tax is added back and collected with the balance\n- **One the shop attaches** waits for June to approve it",
   "- **Quotes:** the shop attaches the certificate, or the customer uploads it. Payment waits until one is on file\n- **Design studio orders:** a customer can upload a certificate at checkout. Tax comes off, and the order waits until June approves the certificate. If she refuses it, the tax is added back and collected with the balance"],
  ["1. Is there a certificate on file for that sale, not refused, with the holder's name matching the customer? One still marked unchecked is worth telling June about",
   "1. Is there a certificate on file for that sale, approved, with the holder's name matching the customer?"],
  ["- Places the shop already has are marked, and cannot be added\n- Every search adds to one running list, and a result leaves it once it is contacted, so nothing found is lost between shifts. Work the list before you search again: the whole shop gets 2 searches a day\n",
   "- Places the shop already has are marked, and cannot be added\n"],
  ["- A quote is good for 14 days. If they come back later, re-check it before they accept. An expired one can be **Reinstated** from the board or the job page: same prices, 14 more days\n- Send the quote when you said you would: **Email and text it** sends the link both ways in one tap.",
   "- A quote is good for 14 days. If they come back later, re-check it before they accept\n- Send the quote when you said you would."],
  ["The site tells Google (\"generate_lead\") and Meta (\"Lead\") when the form is sent. Meta also hears it from our server (the Conversions API), matched to the browser's event so each quote request counts once\n",
   "The site tells Google (\"generate_lead\") and Meta (\"Lead\") when the form is sent\n"],
  /* 2026-11-06: software course brought up to date (COS insights, content packs, client logins, Pro white label; finder running list, overdue tasks, clock-in note). */
  ["It also has analytics, with Facebook and Instagram insights, and an inbox where they answer and like comments and messages. On Pro and Agency, **content packs** take a spreadsheet of posts and a zip of photos and schedule them as written, or let the AI rewrite them, so an agency can move a client's ready content in at once.",
   "It also has analytics and an inbox for comments and messages."],
  ["- 5 seats: logins for their team, with roles (owner, admin, editor, client), so they can invite a client to review and approve their own brand's posts. A client login sees only the review controls",
   "- 5 seats: logins for their team, with roles (owner, admin, editor, client), so they can invite a client to review their own brand"],
  ["The cheaper plans (Starter $19, Pro $49) exist, but they are for single businesses who come from ads. Pro has white label too, but only one login and 6 outside connections: anyone with a team, or clients who approve their own posts, needs Agency.",
   "The cheaper plans (Starter $19, Pro $49) exist, but they are for single businesses who come from ads."],
  ["Its **Find leads with AI** button searches the web for people who post for several brands; check each result before you add it. Each search adds to one running list, and a result leaves the list once you contact it, so nothing found is lost between shifts. A lead counts once a contact is logged.",
   "Its **Find leads with AI** button searches the web for people who post for several brands; check each result before you add it. A lead counts once a contact is logged."],
  ["- End by setting a next step and date on every lead you touched\n- An overdue next step comes back to you as a task on **Tasks** the next day, so a forgotten follow-up shows up on its own",
   "- End by setting a next step and date on every lead you touched"],
  ["Clock in and out on the Timeclock so every hour counts. Your first clock-in each day posts your open tasks to June's Mailbox, so she sees your plan without asking.",
   "Clock in and out on the Timeclock so every hour counts."],
  /* 2026-11-06: the designer asks the customer on the Messages card, not sales (owner). */
  ["message the customer on the job's **Messages** card. Their reply comes back to the same job.",
   "press **Ask sales a question** on the Artwork card. The question shows on the salesperson's My Day, and their answer comes back to the job."],
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

require('./beginner-updates')(ALL);

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

// A single combined course avoids duplicated Team basics, lesson IDs and
// final sign-offs. Original lesson/quiz keys and the primary ready key stay
// intact: assigning a second duty never deletes training or earned pay.
const dualCourses = new Map();
function dualCourse(track) {
  if (dualCourses.has(track)) return dualCourses.get(track);
  const isSales = track === 'sales-software';
  const primary = isSales ? SOFTWARE_CORE : SALES_CORE;
  const secondary = isSales ? SALES_CORE : DESIGN_CORE;
  const secondaryFinal = {
    key: `${secondary.key}:assessment`, title: `${secondary.title}: practical assessment`,
    goal: `Demonstrate the ${secondary.title.toLowerCase()} work before working independently.`,
    lessons: [], quiz: secondary.final.quiz, buffer: 5,
    practice: [], // The combined final sign-off covers both duties; no early release here.
  };
  const team = SOFTWARE_CORE.modules[0];
  const core = isSales
    ? [team, ...SALES_CORE.modules, secondaryFinal, ...SOFTWARE_CORE.modules.filter(m => m.key !== 'team')]
    : [team, ...DESIGN_CORE.modules.filter(m => m.key !== 'team'), secondaryFinal,
        ...CONTENT_CORE.modules.filter(m => ['c2', 'c3', 'c5', 'c6', 'c7', 'c8'].includes(m.key)), ...SALES_CORE.modules];
  const c = {
    ...primary, key: track, title: isSales ? 'June’s Tees + COS Sales' : 'Design + Marketing & Light Sales', track,
    modules: core.map((m, i) => ({ ...m, key: `${i}:${m.key}` })), final: primary.final,
  };
  dualCourses.set(track, c);
  return c;
}

/** The courses a helper walks, in order: the track's core course, then their role's. */
function coursesFor(track, role = null) {
  if (['sales-software', 'design-marketing'].includes(track)) return [dualCourse(track)];
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
