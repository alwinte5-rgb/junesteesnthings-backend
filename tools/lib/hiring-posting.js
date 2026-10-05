'use strict';

/* Posting a job on OnlineJobs.ph and picking who gets the test: the same
   process for every role (SCREENING), plus each role's ready-to-paste post
   and what to look for in its applications (POSTS). Shown on the owner-only
   Hiring pages; a new role needs an entry here as well as its test in
   hiring.js ROLES (tests/hiring.test.js checks both).

   The process is the one the first sales post was screened with (2026-10):
   labels in the OnlineJobs inbox, Verify = reject, Maybe is only a holding
   spot, the free Background Data Check on every top pick. */

/* Labels in the OnlineJobs inbox. OLJ rejects emoji, stars and warning signs
   in label names ("Something went wrong"); "·" and "-" work. */
function labelsFor(prefix) {
  return [`${prefix} 1 · Top pick`, `${prefix} 2 · Maybe`, `${prefix} 3 · Rejected`, gemLabel(prefix)];
}
/* A Gem is the owner's exceptional applicant: a Top pick for this job who ALSO
   shows proven skills that complement it, usually the skills of our other
   roles (a designer who edits video, a salesperson who grows social pages).
   Skills that are part of the job itself never make a Gem. Each job has its own Gem label
   and its own list of skills that make one (POSTS[role].gem). */
function gemLabel(prefix) {
  return `Gem · ${prefix}`;
}
const SHARED_LABELS = [
  { name: 'Apparel-Print Experience', use: 'Has worked with custom apparel, printing or merch before.' },
  { name: 'Future Pool', use: 'Rejected for this post but worth contacting for a later one.' },
  { name: 'Verify Before Hiring', use: 'A RED flag in the trust check. Reject: do not send them the test.' },
  { name: 'Check on Call', use: 'A top pick with a YELLOW flag. Send the test, and clear the flag on the video call before hiring.' },
];

/* Safe and reliable, not only skilled (the owner, 2026-10-04: most applicants
   come back with weak background checks, "I want the best candidate for the
   job but a safe and reliable choice as well"). The Background Data Check and
   the profile give three kinds of signal. A red flag is out, whatever the
   skills. Yellow flags are normal on OLJ and do not reject on their own: a top
   pick can carry up to two, each written in the Hiring note and cleared on the
   video call. Green signs make the choice between equally skilled applicants.
   OLJ's ID Proof score runs 0-70 today (it used to be 0-99). */
const TRUST = {
  red: [
    'The multiple-accounts tracker shows another account, or the name, photo or details do not match across the profile, ID and application',
    'Past employer reviews that mention dishonesty, disappearing without notice, or work that was not theirs',
    'Logins from outside the Philippines with no believable reason (for example Brazil, or a new country every week)',
    'ID Proof below 25, or a very new account (under 1 month) with no ID verified',
    'A copied or AI-written application or sample (the same text as another applicant, or nothing personal in it)',
    'Asks to be paid or to talk outside OnlineJobs before a test, or asks for money or equipment up front',
  ],
  yellow: [
    'ID Proof from 25 to 44: ask them to show a government ID on the video call that matches their profile name',
    'An account under 3 months old, or few employment records: ask for a past employer or client we can contact',
    'Several short jobs (under 3 months each): ask why each ended',
    'One mixed or average past employer review: ask them about that job',
    'One login from abroad they can explain (a trip, a VPN for work): ask, and check the dates',
    'No backup internet or power: ask what they do in a brownout',
  ],
  green: [
    'ID Proof 45 or more, with ID verified',
    'An account over 1 year old with a steady work history (jobs lasting 6 months or more)',
    'Good past employer reviews, or a past employer we can contact',
    'TimeProof history from previous jobs',
    'A complete profile with a real photo that matches the application, and the post\'s instructions followed exactly',
    'A backup internet connection and power, and their availability matches our schedule',
  ],
};

/* Asked on every video call, whatever the job, before any offer. */
const TRUST_CALL = {
  section: 'Identity and reliability (3 min, every job)',
  questions: [
    { q: 'Please hold your government ID up to the camera next to your face.',
      listen: 'The name and photo match their OLJ profile and the person on the call. No ID, or a different name, ends the process.' },
    { q: 'Where are you working from, and what do you do in a brownout or an internet outage?',
      listen: 'A city in the Philippines that matches their profile, and a real backup (a second connection, mobile data, a power bank or generator).' },
    { q: 'Can we contact a past employer or client? (And ask about any yellow flag in the Hiring note.)',
      listen: 'A name and a way to reach them, and a straight answer about the flag. Dodging is a red flag.' },
  ],
};

const SCREENING = {
  rules: [
    'Open every applicant\'s OLJ profile, not just their message: work history, skills, portfolio, certificates and past roles. Look for transferable skills from other jobs that would help here.',
    'A Gem is ONLY a Top pick (they already meet everything for this job) who ALSO shows strong, proven skills that complement the job: skills from our other roles, like those on the job\'s Gem list. Skills that are part of this job make a Top pick, never a Gem. The extra skill must be shown in their profile (work history, portfolio, results), not just listed. Label them with the job\'s Gem label as well as Top pick, always send them the test, and put "Gem: <the skills>" in the note on Hiring.',
    'Reject straight away: no code words, or the required sample/links missing. The post says so, so it is fair.',
    'A Top pick needs BOTH: the skills on this job\'s list, AND the trust check (below) with no red flag and at most two yellow flags. The best candidate is the most skilled one who is also safe: when two are close, choose the one with more green signs.',
    'Run the free Background Data Check on every possible top pick BEFORE labelling them Top pick, and read it with the trust check below.',
    'Any red flag = Verify Before Hiring, which means reject, however good the skills.',
    'Yellow flags do not reject on their own (most OLJ applicants have some). Label them Check on Call too, and write each flag in the note on Hiring (for example "Yellow: ID Proof 38; account 2 months").',
    'Maybe is only a holding spot: every Maybe ends as Top pick or Rejected before tests go out.',
    'Opening a conversation marks it read. OnlineJobs slows down after many page loads, so go slower.',
    'Send the paid test link (Hiring, New test link, choose the role) to the top picks only. Round 2 and your results email follow on their own.',
  ],
  steps: [
    'Post the job (copy the fields below). Approval can take up to 2 days.',
    'Label every applicant with the role\'s labels as they come in, reading their profile for transferable skills, and add the job\'s Gem label to exceptional ones.',
    'Check the top picks (Background Data Check), and turn every Maybe into Top pick or Rejected.',
    'Make a test link for each top pick on Hiring and send it with the ready message.',
    'Read the one results email per applicant. Book a video call for "Book the video call", using the interview guide and the questions in the email.',
    'Mark each applicant Video call, Hired or Rejected on their Hiring page, and send every rejected applicant the message from this page (or their Hiring page, filled in).',
    'Hire, then add them on Staff. Their Training page and the playbook take it from there.',
  ],
};

/* Pay terms every job shares, added under each post's Pay lines and repeated
   on round 2, where a passing applicant confirms the pay. */
const PAY_TERMS = `- 13th-month pay starts only after 12 months of service
- Hours can be adjusted up or down based on performance`;

/* Shared parts of every post: written once so every role says the same thing
   about time off, training and how to apply. */
const TIME_OFF = `Time off
- We observe major US holidays (New Year's Day, Memorial Day, July 4th, Labor Day, Thanksgiving, Christmas) as paid days off.
- 3 paid leave days after 6 months.`;

const howToApply = (code, items) => `How to apply
Apply through OnlineJobs and include:
1. The words "${code}" at the start of your message
${items.map((x, i) => `${i + 2}. ${x}`).join('\n')}

Applications without the code words and ${items.length > 2 ? 'the items above' : 'the sample'} won't be reviewed.`;

const POSTS = {
  sales: {
    prefix: 'Sales',
    gem: ['Social media and content: posts, Reels or TikToks that grew a page', 'Marketing, paid ads or SEO with results',
      'Graphic design or mockups (Canva, Photoshop) good enough to show customers', 'Video editing', 'Running an online store (Shopify) or a website'],
    code: 'Purple Tee',
    title: 'Sales & Customer Service Assistant – Earn Commission on Every Sale (Custom Apparel)',
    type: 'Part Time', wage: '4', hours: '30', skills: ['Customer Service', 'Sales', 'Lead Generation'],
    payNote: 'OLJ Suggest-a-Salary for customer service (2026-10): beginner about $3, mean about $3.71, experienced about $5.25 an hour. Start just above the mean, with commission on top.',
    lookFor: [
      'Natural, friendly written English in the message itself (this matters most)',
      'A sample reply that asks for the details (sizes, garment, artwork, the 20th) and does not invent a price',
      'Customer service or sales experience, ideally e-commerce, print or apparel',
      'A speed test of at least 25 Mbps',
      'Has taken the OnlineJobs IQ test ("Tests Taken" on their profile). Not required: rank applicants without it lower, never reject them for it',
    ],
    body: `Love helping customers and closing sales? Earn an hourly wage PLUS commission on every order you win.

About us
June's Tees is a growing US custom apparel and print shop (screen printing, DTF, embroidery, signs, promo items). We serve schools, sports teams, small businesses and event organizers. We're hiring one dependable, long-term assistant to help customers get from first question to paid order, and to find new customers when it's quiet.

What you'll do
1. Reply to customer emails, website enquiries and messages quickly, in friendly, clear English
2. Build quotes in our quote system. It does all the pricing; you put in the right details
3. Follow up on open quotes so customers don't go quiet, and ask past customers about reorders
4. Gather order details (sizes, colors, artwork, deadlines, delivery or pickup) and reply to our Google reviews
5. Find new customers in quiet time: schools, sports teams, churches and local businesses that need shirts

You'll do great here if you are
- A confident, natural writer in English (this matters most)
- Someone who enjoys selling and follows up without being reminded
- Organized and careful with details
- A fast learner who asks when unsure

Tools you'll use
Gmail, Google Docs and Sheets, Facebook and Instagram messages, and our own staff dashboard (quotes, leads, team chat). Canva is a plus. We'll train you on everything else.

Nice to have: sales or customer service experience in e-commerce, print or apparel; knowledge of DTF, screen printing or embroidery; experience selling to US schools or teams.

Schedule
- Monday–Friday, 10:00am–4:00pm US Central Time (30 hours/week)
- That's 11:00pm–5:00am Philippine time now, and 12:00am–6:00am from November. Fixed hours: you work while our customers are awake.

Pay
- $4.00 USD/hour ($120/week, about $520/month), paid weekly during training
- $4.50/hour once training is signed off (60–90 days), with pay reviews every 6 months after that
- Plus 3% commission on every sale you close once your training is signed off and you're building your own quotes. That includes customers you find yourself. The more you sell, the more you earn, with no cap.
- Commission is paid 14 days after the customer pays in full, and your dashboard shows your earnings live.
${PAY_TERMS}

${TIME_OFF}

Training
You start with guided training: a playbook for every common task, a practice quote, and a quick quiz. The owner checks your work before it reaches customers. Once training is signed off, you build your own quotes, your pay goes up, and you start earning commission.

Career path
We want someone to grow with us. As the business grows, strong performers get more hours, raises and more responsibility.

${howToApply('Purple Tee', [
  '3–5 sentences about your sales or customer service experience',
  'A screenshot of your internet speed test (speedtest.net)',
  'Your reply to this customer message, written as you\'d really send it:\n   "Hi, I need 40 shirts for my daughter\'s softball team by the 20th. How much and can you do it?"',
])}`,
  },

  designer: {
    prefix: 'Graphic',
    gem: ['Video editing or motion graphics (Reels, TikTok, product videos)', 'Social media content and marketing that grew a page',
      'Photography: product shots, mockup shoots, job photos', 'Web or landing page design', 'Customer-facing sales or quoting experience'],
    code: 'Gold Ink',
    title: 'Graphic Designer for Custom Apparel – Screen Print, Embroidery & DTF Artwork',
    type: 'Part Time', wage: '4.5', hours: '20', skills: ['Adobe Illustrator', 'Graphic Design', 'Adobe Photoshop'],
    payNote: 'Check OLJ\'s Suggest-a-Salary box for graphic design before posting. Graphic design posts on OLJ mostly offer $4–6 an hour (2026-10); $4.50 starts just above the common rate, the same approach as sales.',
    lookFor: [
      'A portfolio link that opens, with work made for print on clothing or merch, not only social posts or web',
      'Their one apparel piece explained concretely: colours, file type, how it was prepared for print',
      'Illustrator (vector) skill; Photoshop; CorelDRAW or Affinity is fine too',
      'The sample answer turns "make it pop" into specific choices and mentions a proof',
      'A speed test of at least 25 Mbps',
    ],
    body: `Love seeing your designs worn by real teams and businesses? Design custom apparel for a growing US print shop.

About us
June's Tees is a growing US custom apparel and print shop (screen printing, DTF, embroidery, signs, promo items). We serve schools, sports teams, churches, small businesses and event organizers. We're hiring one dependable, long-term graphic designer to turn customer ideas into great shirts.

What you'll do
1. Turn customer requests from our sales team into designs and mockups
2. Prepare print-ready files: vector art, spot-colour separations for screen printing, simplified versions for embroidery, and transparent PNGs for DTF
3. Send proofs to customers, make their changes quickly and kindly, and follow up when their artwork or approval is late
4. Redraw low-quality customer logos as clean vector art
5. In quiet time, create ready-made designs for upcoming seasons and events, and mockups for our website and social media

You'll do great here if you are
- Strong in Adobe Illustrator (vector work is most of the job)
- Someone who thinks about how a design will actually print
- Clear and friendly when explaining design choices to customers
- Organized: files named and saved so a reorder takes minutes

Tools you'll use
Adobe Illustrator and Photoshop (your own licence), Google Drive, and our own staff dashboard (jobs, proofs, team chat). Canva is a plus. We'll train you on our printing methods and systems.

Nice to have: experience designing for screen printing, embroidery or DTF; embroidery digitising; colour separations; video or Reels editing.

Schedule
- 20 hours/week, Monday–Friday
- You choose your working hours, as long as you work the full 20 hours each week and stay in close contact with the team, so proofs and customer questions get quick replies.

Pay
- $4.50 USD/hour ($90/week, about $390/month), paid weekly during training
- $5.00/hour once training is signed off (60–90 days), with pay reviews every 6 months after that
${PAY_TERMS}

${TIME_OFF}

Training
You start with guided training: a playbook for every common task, how our printing methods work, and practice proofs. The owner checks your work before it reaches customers.

Career path
We want someone to grow with us. As the business grows, strong performers get more hours, raises and more responsibility.

${howToApply('Gold Ink', [
  'A link to your portfolio (Behance, Google Drive, Dribbble or a website), including work made for print on clothing or merchandise',
  '3–5 sentences about one apparel or merch design you made: the brief, your tools, and how you prepared it for print',
  'A screenshot of your internet speed test (speedtest.net)',
  'Your reply to this customer message, written as you\'d really send it:\n   "We love the design but can you make it pop more on a black hoodie?"',
])}`,
  },

  developer: {
    prefix: 'Dev',
    gem: ['UI/UX or graphic design', 'SEO, analytics or marketing websites with results', 'Setting up ad tracking (Google Ads, Meta pixel, Tag Manager)',
      'Automating business workflows (Zapier, n8n, scripts) or AI tools for non-developers', 'Customer or technical support'],
    code: 'Navy Server',
    title: 'Full-Stack Developer – Websites, iOS/Android Apps & AI (Node.js, React Native, Claude)',
    type: 'Part Time', wage: '8', hours: '30', skills: ['Node.js', 'React Native', 'iOS App Development'],
    payNote: 'Check OLJ\'s Suggest-a-Salary box for web development before posting. Developer rates run far higher than VA rates (about $10/hr and up on the open market, 2026); $8 is a starting point to check against it, raised if strong applicants ask for more.',
    lookFor: [
      'GitHub or live links that work, with code they can explain: Node.js/Express, PHP, React/Next.js or React Native',
      'Experience looking after a LIVE site with real users or payments, not only tutorials',
      'Daily use of Claude (Claude Code or the Claude API) or a similar AI coding assistant, AND says how they check its work',
      'Has published an iOS app: Xcode, TestFlight, App Store Connect, and getting through App Store review',
      'The sample answer checks logs and what changed first, and says how they would update the owner',
      'Careful with secrets and live data (no "I would test on production")',
      'A speed test of at least 25 Mbps and a computer that runs a local database',
    ],
    body: `Want to own a set of real websites and apps that real customers use every day? Join a growing US business as our developer.

About us
June's Tees is a growing US custom apparel and print shop (screen printing, DTF, embroidery, signs, promo items), and we build our own software: a quote and order system, an online design studio, and new web and mobile apps. We're hiring one dependable, long-term developer to keep it all running and help build what's next.

What you'll do
1. Keep our live websites and apps healthy: fix bugs, watch error logs, apply security updates
2. Build new features in our Node.js/Express + Postgres backend and our PHP/MySQL design studio
3. Build and publish our iPhone and Android apps (React Native/Expo): TestFlight, App Store Connect and App Store review
4. Build new projects, including features that use AI (the Claude API), and work alongside Claude Code every day
5. Be our QA: write tests for what you change, test every release on real phones and browsers before it goes live, and explain progress and problems in plain English to a non-technical owner

You'll do great here if you are
- Careful with live systems, customer data, payments and passwords
- Someone who finds the real cause of a bug instead of guessing
- A clear writer who gives updates before being asked
- A self-starter who finds useful work when nothing is assigned

Must have
- Daily experience with Claude (Claude Code or the Claude API) or a similar AI coding assistant, and the habit of checking and testing what it writes
- Node.js and JavaScript/TypeScript, SQL (Postgres), Git and GitHub
- React Native (Expo) and publishing iOS apps: Xcode, TestFlight, App Store Connect, App Store review guidelines
- A Mac you can build iOS apps on

Tools you'll use
Claude Code and the Claude API, GitHub, Railway, Postgres and MySQL, Node.js/Express, PHP, React/Next.js, React Native with Expo (EAS builds), Xcode and App Store Connect, Google Play Console, Stripe, RevenueCat, Cloudflare, Sentry, UptimeRobot, Brevo (email) and Twilio (texts). We'll walk you through each codebase.

Nice to have: Shopify apps; Clerk sign-in; Cloudinary; Stripe Connect; SEO and site speed; Python.

Schedule
- 30 hours/week, Monday–Friday
- You choose your working hours, as long as you work the full 30 hours each week and stay in close contact with the team, so questions and urgent fixes get quick replies.

Pay
- $8.00 USD/hour ($240/week, about $1,040/month), paid weekly during training
- A raise once training is signed off (60–90 days), with pay reviews every 6 months after that
${PAY_TERMS}

${TIME_OFF}

Training
You start with access to one codebase at a time, small fixes first, and the owner reviews your work before it goes live.

Career path
We want someone to grow with us. As our software grows, strong performers get more hours, raises and more responsibility.

${howToApply('Navy Server', [
  'Links to your GitHub, live sites, and any App Store or Google Play apps you built or published',
  '3–5 sentences about a live system you looked after: what broke and how you fixed it',
  '2–3 sentences on how you use Claude or another AI coding assistant, and how you check its work',
  'A screenshot of your internet speed test (speedtest.net)',
  'Your answer to this, as you\'d really write it:\n   "Our website\'s checkout stopped working after this morning\'s update. What are the first three things you check?"',
])}`,
  },

  content: {
    prefix: 'Content',
    gem: ['Graphic design: thumbnails, brand graphics, carousels', 'Running paid ads or boosts with results', 'Photography or filming and lighting',
      'Website, SEO or email marketing', 'Sales or community management that turns comments and DMs into enquiries'],
    code: 'Green Screen',
    title: 'Video Content Editor – YouTube, TikTok & Reels, Organic Growth (AI-Assisted Editing)',
    type: 'Part Time', wage: '5', hours: '30', skills: ['Video Editing', 'Social Media Management', 'TikTok Marketing'],
    payNote: 'Check OLJ\'s Suggest-a-Salary box for video editing before posting. Video editor posts on OLJ commonly offer about $4-8 an hour (2026); $5 starts a little above the common entry rate, the same approach as sales.',
    lookFor: [
      'Links to videos they edited, ideally short-form (TikTok, Reels, Shorts) AND longer YouTube',
      'Real numbers: views, watch time, followers or sales from their videos, not only "I am creative"',
      'The sample answer leads with a hook in the first seconds, and mentions captions and the platform',
      'Uses AI tools (CapCut, Descript, Opus Clip and similar) and says how they check the output',
      'A speed test of at least 25 Mbps (upload matters too) and a computer that edits 1080p smoothly',
    ],
    body: `Love making videos people actually watch to the end? Edit and grow our YouTube, TikTok and Reels.

About us
June's Tees is a growing US custom apparel and print shop (screen printing, DTF, embroidery, signs, promo items), and we run other brands and projects too. We serve schools, sports teams, churches, small businesses and event organizers. We're hiring one dependable, long-term content editor to turn our footage into videos that grow our following without paid ads.

What you'll do
1. Edit prerecorded footage (print jobs, behind the scenes, customer reveals, how-tos) into YouTube videos and short videos for TikTok, Instagram Reels, YouTube Shorts and Facebook
2. Repurpose long videos into shorts, with strong hooks, captions and the right format for each platform
3. Use AI tools to work faster (transcripts, captions, clip finding, audio clean-up), and check everything they produce
4. Grow organic engagement: post on a steady schedule, reply to comments, follow what works, and adapt trends to our brand
5. Track what performs each week and plan the next week's videos and shot lists

You'll do great here if you are
- Someone who knows exactly what keeps people watching past the first 2 seconds
- Fast and organized: footage named and filed, posts scheduled ahead
- Honest with AI: you use it, you check it, you never fake a customer or a review
- A self-starter who finds the next video to make without being told

Tools you'll use
Premiere Pro, CapCut, DaVinci Resolve or Final Cut; Descript or similar for transcripts; AI tools such as CapCut AI, Opus Clip and ChatGPT or Claude for ideas; Canva or Photoshop for thumbnails; Meta Business Suite, TikTok and YouTube Studio; Google Drive. We'll show you our brands and footage library.

Nice to have: thumbnails and motion graphics; YouTube SEO; community management; experience with a small business or e-commerce brand.

Schedule
- 30 hours/week, Monday–Friday, including at least 10:00am–12:00pm US Central Time so you overlap with us
- That overlap is 11:00pm–1:00am Philippine time now, and 12:00am–2:00am from November. The rest of your hours are flexible; posts are scheduled for US times.

Pay
- $5.00 USD/hour ($150/week, about $650/month), paid weekly during training
- $5.50/hour once training is signed off (60–90 days), with pay reviews every 6 months after that
${PAY_TERMS}

${TIME_OFF}

Training
You start with our brand guide, our best and worst videos and why, and practice edits. The owner approves your first posts before they go live.

Career path
We want someone to grow with us. As our channels grow, strong performers get more hours, raises and more responsibility.

${howToApply('Green Screen', [
  'Links to 2 or 3 videos you edited (YouTube, TikTok, Instagram or Google Drive), with the views or results each got',
  '2–3 sentences on which AI tools you use in editing and how you check their work',
  'A screenshot of your internet speed test (speedtest.net)',
  'Your answer to this, as you\'d really write it:\n   "We have a 30-second clip of a shirt being printed. Describe the first 3 seconds of the TikTok you would make from it."',
])}`,
  },

  ads: {
    prefix: 'Ads',
    gem: ['Making the ads themselves: design or short video', 'Building landing pages or websites', 'SEO or email marketing with results',
      'Social media content that grew a page', 'Sales or lead follow-up experience'],
    code: 'Red Squeegee',
    title: 'Part-Time Google & Meta Ads Specialist – Local Custom Apparel Shop (Small Budget, Real Results)',
    type: 'Part Time', wage: '7', hours: '10', skills: ['Google Ads', 'Facebook Ads', 'Google Analytics'],
    payNote: 'Check OLJ\'s Suggest-a-Salary box for PPC / ads before posting. Ads specialists usually cost more per hour than VAs; at about 10 hours a week, $7 is a starting point to check against it.',
    lookFor: [
      'Real results in numbers from an account they ran: cost per lead or sale, return on ad spend, with the budget',
      'Google Ads Search experience (keywords, match types, negatives) for a small or local business, not only boosted Facebook posts',
      'Sets up conversion tracking (Google Ads conversions, GA4, Tag Manager) before spending',
      'The sample answer spots the wasted clicks and the wrong location, not just "raise the budget"',
      'A speed test of at least 25 Mbps',
    ],
    body: `Want to prove what a small, well-run ad budget can do? Run Google and Meta ads for a growing Chicago print shop, part-time.

About us
June's Tees is a growing US custom apparel and print shop in Chicago (screen printing, DTF, embroidery, signs, promo items). We serve schools, sports teams, churches, small businesses and event organizers, and take online orders through our design studio. We're hiring a dependable, long-term ads specialist, part-time, to turn a small monthly budget into quote requests and orders.

What you'll do
1. Set up and check conversion tracking: quote requests and online orders in Google Ads and GA4
2. Run Google Search campaigns on the searches most likely to order, with tight targeting and negative keywords
3. Run small Meta (Facebook and Instagram) campaigns: retargeting and local awareness with our real job photos
4. Check the search terms and results every week, cut waste, and move budget to what brings orders
5. Send a short weekly report in plain English: spend, quote requests, orders, and what you changed

You'll do great here if you are
- Someone who judges ads on orders and profit, not clicks
- Careful with a small budget: every dollar has a job
- Honest in ad copy and clear in reports
- A self-starter who plans seasonal campaigns ahead

Tools you'll use
Google Ads, Google Analytics 4, Google Tag Manager, Meta Ads Manager, Google Sheets, and our staff dashboard. We'll give you access to everything.

Nice to have: landing page building; ad creative and short video; SEO; email marketing; experience with local service businesses.

Schedule
- About 10 hours/week, flexible, with a weekly check-in during US Central business hours
- Check the campaigns at least 3 times a week

Pay
- $7.00 USD/hour, paid weekly
- A raise once training is signed off (60–90 days) and pay reviews every 6 months, with more hours as the ad budget grows
${PAY_TERMS}

${TIME_OFF}

Training
You start with our customers, prices, seasons and margins, so you can judge ads on profit. The owner approves the first campaigns before they go live.

Career path
As the ads pay back, the budget and your hours grow with them.

${howToApply('Red Squeegee', [
  'One ad account you managed: the business, monthly budget, goal, and results in numbers (cost per lead or sale, return on ad spend)',
  'A screenshot of your internet speed test (speedtest.net)',
  'Your answer to this, as you\'d really write it:\n   "Our Google Ads campaign got 3,000 clicks last month but only 2 quote requests. What are the first three things you check?"',
])}`,
  },

  bookkeeper: {
    prefix: 'Books',
    code: 'Blue Ledger',
    title: 'Part-Time Bookkeeper – Small US Custom Apparel Shop (Stripe, PayPal, Sales Tax)',
    type: 'Part Time', wage: '6', hours: '10', skills: ['Bookkeeping', 'QuickBooks', 'Account Reconciliation'],
    payNote: 'Check OLJ\'s Suggest-a-Salary box for bookkeeping before posting. Experienced bookkeepers for US clients usually ask more than VAs; at about 10 hours a week, $6 is a starting point to check against it.',
    gem: ['Admin or operations: invoicing, supplier orders, purchasing', 'Payroll or HR admin for contractors', 'Collections: following up unpaid customer balances',
      'Spreadsheet automation and dashboards for the owner', 'Inventory or job costing'],
    lookFor: [
      'Real bookkeeping for named small businesses, with the software (QuickBooks Online, Xero or spreadsheets)',
      'Reconciles accounts to statements every month, and can explain a difference',
      'Experience with Stripe or PayPal payouts, fees and refunds',
      'The sample answer works out the numbers and does not book the net deposit as sales',
      'Careful with financial logins and private data',
      'A speed test of at least 25 Mbps',
    ],
    body: `Love it when every dollar matches? Keep the books for a growing US print shop, part-time.

About us
June's Tees is a growing US custom apparel and print shop in Chicago (screen printing, DTF, embroidery, signs, promo items). We take card payments through Stripe, some PayPal and cash, and serve schools, sports teams, churches and businesses, some of them tax-exempt. We're hiring a dependable, long-term bookkeeper, part-time.

What you'll do
1. Reconcile Stripe, PayPal, cash and the bank to their statements every month
2. Record sales, refunds, disputes, card fees and expenses correctly, with a receipt for every cost
3. Track Illinois sales tax, including tax-exempt customers and their certificates
4. Close each month and send the owner a short, plain-English summary
5. Spot savings and problems: unused subscriptions, unpaid balances, missing receipts

You'll do great here if you are
- Accurate and patient: you reconcile before you report
- Someone who asks instead of guessing a category
- Careful with financial logins and private data
- Clear when explaining numbers to a non-accountant

Tools you'll use
Our own Finances page, Stripe, PayPal, our bank's read-only access, Google Sheets, and QuickBooks Online or Xero experience. We'll give you your own login for each.

Nice to have: US sales tax filing; contractor payments; inventory or job costing; Excel or Google Sheets dashboards.

Schedule
- About 10 hours/week, flexible, with the first 3 working days of each month for the close
- A short weekly check-in during US Central business hours

Pay
- $6.00 USD/hour, paid weekly
- A raise once training is signed off (60–90 days) and pay reviews every 6 months, with more hours as we grow
${PAY_TERMS}

${TIME_OFF}

Training
You start with our accounts, how payments flow from Stripe to the bank, and one month's close together with the owner.

Career path
As we grow, strong performers get more hours, raises and more responsibility.

${howToApply('Blue Ledger', [
  '3–5 sentences about the books you keep or have kept: the businesses, the software, and what you do each month',
  'A screenshot of your internet speed test (speedtest.net)',
  'Your answer to this, as you\'d really write it:\n   "Stripe sold $2,000 of orders this week and paid $1,940 into the bank. How do you record it?"',
])}`,
  },
};

/* Messages for applicants who are not going ahead, for the owner to copy into
   OnlineJobs. Kind, short, and never a reason that could start an argument.
   {first} and {job} are filled in; the fee line only when a fee is owed. */
const REJECTIONS = {
  screening: { label: 'Not invited to the test',
    text: `Hi {first}, thank you for applying for the {job} position at June's Tees, and for the time you put into your application. We received many strong applications, and we have decided to move forward with applicants whose experience is a closer match for this role. We will keep your profile in mind for future openings. We wish you all the best in your search!` },
  test: { label: 'After the test',
    text: `Hi {first}, thank you for taking our test for the {job} position. We read every answer ourselves and appreciated the effort you put in. After careful thought, we have decided not to move forward with your application this time.{fee} We will keep your profile in mind for future openings. Thank you again, and all the best!` },
  interview: { label: 'After the video call',
    text: `Hi {first}, thank you for your time on our video call for the {job} position. It was great to meet you and learn about your work. We have chosen another candidate whose experience is a closer fit for what we need right now, which was a hard decision.{fee} We would be glad to keep in touch for future roles. Thank you again, and all the best!` },
};

/** A rejection message ready to paste. */
function rejectionMessage(kind, { name, job, fee } = {}) {
  const t = (REJECTIONS[kind] || REJECTIONS.screening).text;
  const first = String(name || '').trim().split(/\s+/)[0] || 'there';
  return t.replace('{first}', first).replace('{job}', job || 'this')
    .replace('{fee}', fee ? ` ${fee}` : '');
}

/** A job's pay lines, read from its post so round 2 can never disagree with it. */
function payLines(key) {
  const post = POSTS[key] || POSTS.sales;
  const m = post.body.match(/\nPay\n((?:- .*\n?)+)/);
  return m ? m[1].trim().split('\n').map((l) => l.replace(/^- /, '').trim()).filter(Boolean) : [];
}

module.exports = { TRUST, TRUST_CALL, PAY_TERMS, payLines, SCREENING, SHARED_LABELS, POSTS, REJECTIONS, labelsFor, gemLabel, rejectionMessage };
