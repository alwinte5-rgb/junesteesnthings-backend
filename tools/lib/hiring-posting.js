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
  return [`${prefix} 1 · Top pick`, `${prefix} 2 · Maybe`, `${prefix} 3 · Rejected`];
}
const SHARED_LABELS = [
  { name: 'Gem · Marketing-Social-SEO', use: 'A top pick who can also do social media, SEO, ads or marketing. The owner values these most.' },
  { name: 'Apparel-Print Experience', use: 'Has worked with custom apparel, printing or merch before.' },
  { name: 'Future Pool', use: 'Rejected for this post but worth contacting for a later one.' },
  { name: 'Verify Before Hiring', use: 'Anything that does not add up. Verify means reject: do not send them the test.' },
];

const SCREENING = {
  rules: [
    'Reject straight away: no code words, or the required sample/links missing. The post says so, so it is fair.',
    'Verify = reject. If anything does not add up, label it Verify Before Hiring and move on.',
    'Maybe is only a holding spot: every Maybe ends as Top pick or Rejected before tests go out.',
    'Run the free Background Data Check on every top pick: ID proof score, verification, account age, last-login country and TimeProof history.',
    'A last login from outside the Philippines (for example Brazil) = Verify, so reject.',
    'Opening a conversation marks it read. OnlineJobs slows down after many page loads, so go slower.',
    'Send the paid test link (Hiring, New test link, choose the role) to the top picks only. Round 2 and your results email follow on their own.',
  ],
  steps: [
    'Post the job (copy the fields below). Approval can take up to 2 days.',
    'Label every applicant with the role\'s labels as they come in.',
    'Check the top picks (Background Data Check), and turn every Maybe into Top pick or Rejected.',
    'Make a test link for each top pick on Hiring and send it with the ready message.',
    'Read the one results email per applicant. Book a video call for "Book the video call", using the interview guide and the questions in the email.',
    'Hire, then add them on Staff. Their Training page and the playbook take it from there.',
  ],
};

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
    code: 'Purple Tee',
    title: 'Sales & Customer Service Assistant – Earn Commission on Every Sale (Custom Apparel)',
    type: 'Part Time', wage: '4', hours: '30', skills: ['Customer Service', 'Sales', 'Lead Generation'],
    payNote: 'OLJ Suggest-a-Salary for customer service (2026-10): beginner about $3, mean about $3.71, experienced about $5.25 an hour. Start just above the mean, with commission on top.',
    lookFor: [
      'Natural, friendly written English in the message itself (this matters most)',
      'A sample reply that asks for the details (sizes, garment, artwork, the 20th) and does not invent a price',
      'Customer service or sales experience, ideally e-commerce, print or apparel',
      'A speed test of at least 25 Mbps',
    ],
    body: `Love helping customers and closing sales? Earn an hourly wage PLUS commission on every order you win.

About us
June's Tees is a growing US custom apparel and print shop (screen printing, DTF, embroidery, signs, promo items). We serve schools, sports teams, small businesses and event organizers. We're hiring one dependable, long-term assistant to help customers get from first question to paid order, and to find new customers when it's quiet.

What you'll do
1. Reply to customer emails, website enquiries and messages quickly, in friendly, clear English
2. Build quotes in our quote system. It does all the pricing; you put in the right details
3. Follow up on open quotes so customers don't go quiet
4. Gather order details: sizes, colors, artwork, deadlines, and delivery or pickup
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
    code: 'Gold Ink',
    title: 'Graphic Designer for Custom Apparel – Screen Print, Embroidery & DTF Artwork',
    type: 'Part Time', wage: '4.5', hours: '30', skills: ['Adobe Illustrator', 'Graphic Design', 'Adobe Photoshop'],
    payNote: 'Check OLJ\'s Suggest-a-Salary box for graphic design before posting. Graphic design posts on OLJ mostly offer $4–6 an hour (2026-10); $4.50 starts just above the common rate, the same approach as sales.',
    lookFor: [
      'A portfolio link that opens, with work made for print on clothing or merch, not only social posts or web',
      'Their one apparel piece explained concretely: colours, file type, how it was prepared for print',
      'Illustrator (vector) skill; Photoshop; CorelDRAW or Affinity is fine too',
      'The sample answer turns "make it pop" into specific choices and mentions a proof',
      'A speed test of at least 25 Mbps',
      'Gem: also does embroidery digitising, separations, video/Reels or social media',
    ],
    body: `Love seeing your designs worn by real teams and businesses? Design custom apparel for a growing US print shop.

About us
June's Tees is a growing US custom apparel and print shop (screen printing, DTF, embroidery, signs, promo items). We serve schools, sports teams, churches, small businesses and event organizers. We're hiring one dependable, long-term graphic designer to turn customer ideas into great shirts.

What you'll do
1. Turn customer requests from our sales team into designs and mockups
2. Prepare print-ready files: vector art, spot-colour separations for screen printing, simplified versions for embroidery, and transparent PNGs for DTF
3. Send proofs to customers and make their changes quickly and kindly
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
- Monday–Friday, 10:00am–4:00pm US Central Time (30 hours/week)
- That's 11:00pm–5:00am Philippine time now, and 12:00am–6:00am from November. Fixed hours, so proofs go out while our customers are awake.

Pay
- $4.50 USD/hour ($135/week, about $585/month), paid weekly during training
- $5.00/hour once training is signed off (60–90 days), with pay reviews every 6 months after that

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
      'Gem: has handled an App Store rejection, in-app purchases (RevenueCat), Shopify apps, or built features on the Claude API',
    ],
    body: `Want to own a set of real websites and apps that real customers use every day? Join a growing US business as our developer.

About us
June's Tees is a growing US custom apparel and print shop (screen printing, DTF, embroidery, signs, promo items), and we build our own software: a quote and order system, an online design studio, and new web and mobile apps. We're hiring one dependable, long-term developer to keep it all running and help build what's next.

What you'll do
1. Keep our live websites and apps healthy: fix bugs, watch error logs, apply security updates
2. Build new features in our Node.js/Express + Postgres backend and our PHP/MySQL design studio
3. Build and publish our iPhone and Android apps (React Native/Expo): TestFlight, App Store Connect and App Store review
4. Build new projects, including features that use AI (the Claude API), and work alongside Claude Code every day
5. Write tests for what you change and deploy carefully, and explain progress and problems in plain English to a non-technical owner

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
- 30 hours/week, Monday–Friday, including at least 10:00am–1:00pm US Central Time so you overlap with us
- That overlap is 11:00pm–2:00am Philippine time now, and 12:00am–3:00am from November. The rest of your hours are flexible.

Pay
- $8.00 USD/hour ($240/week, about $1,040/month), paid weekly during training
- A raise once training is signed off (60–90 days), with pay reviews every 6 months after that

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
      'Gem: also does thumbnails, motion graphics, YouTube SEO or community management',
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
};

module.exports = { SCREENING, SHARED_LABELS, POSTS, labelsFor };
