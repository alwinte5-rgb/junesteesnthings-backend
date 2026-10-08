'use strict';

/* The consolidated Sales course: eight hours that every salesperson walks,
   whatever their role, until all three sales jobs are filled.

   Ten modules, then a final exam. Each module is lessons (playbook articles,
   added once by title so the owner's edits are kept; `existing` points at an
   article the playbook already has), any practice steps (real work that ticks
   itself, or an owner sign-off), a quiz the server marks, and a buffer row:
   catch-up time to re-read, ask June, or retake the quiz.

   Every fact here comes from the playbook or the system itself. Anything only
   the owner knows is written "[owner to fill in]", which the Training page's
   "Playbook gaps" card lists for her.

   Quiz `article` names the lesson to re-read after a wrong answer, so it must
   be a lesson in this course or an article the playbook already seeds. */

const A = {
  welcome:   'Sales course 1: Welcome to June\'s Tees',
  tour:      'Sales course 2: The back office, screen by screen',
  methods:   'Sales course 3a: Print methods and when to use each',
  products:  'Sales course 3b: Garments, signs, cutouts and the rules behind a price',
  leads:     'Sales course 4: Answering leads',
  quotes:    'Sales course 5: Building a quote',
  practice:  'Practice quote: a basic screen print order',
  social:    'Social posts in COS Creator Studio',
  upsell:    'Sales course 7: Upselling',
  prospect:  'Sales course 8: Finding new leads',
  reorders:  'Sales course 9: Reorders and repeat customers',
  money:     'Sales course 10: Follow-ups, deposits, proofs and getting paid',
  never:     'What never to promise',
};

const GLOSSARY = {
  'screen printing': 'Ink pushed through a mesh screen, one screen per colour. Cheapest per shirt on bigger runs; starts at 50 pieces.',
  'DTF': 'Direct-to-film: the design is printed on a film and heat-pressed on. Full colour, no minimum, great for small runs.',
  'embroidery': 'The design is stitched in thread. Best for logos on polos, caps and jackets. Done in house.',
  'digitizing': 'Turning a logo into a stitch file for the embroidery machine. A one-time setup fee per design.',
  'white base': 'A layer of white ink printed under the colours so they stay bright. It goes on every garment and counts as one extra screen.',
  'Pantone': 'A numbered colour system. The only way to promise an exact colour match.',
  'vector': 'Artwork made of shapes, not pixels (AI, EPS, PDF, SVG). It can be enlarged without going blurry.',
  'transparent PNG': 'An image with no background, so only the design prints. DTF needs one at 300 dpi.',
  'halftone': 'Shading made from tiny dots, so screen printing can show gradients and photos.',
  'print place': 'Where a design goes on the garment: front, back, left sleeve, right sleeve. Each one is priced on its own.',
  'ink colours': 'How many colours are in the design. In screen printing each one is a screen and changes the price.',
  'price break': 'A quantity where the price per piece drops. The Upsell ideas box shows the next one.',
  'Run number': 'Gives several items on one quote a shared price band, so their quantities add together.',
  'optional item': 'An item the customer can tick to add on their quote page. It is not in the total until they do.',
  'draft': 'A quote saved privately: the customer link does not open and nothing is sent.',
  'deposit': 'The first payment that starts an order: 50%, or the full amount under $100.',
  'balance': 'What is left to pay after the deposit, due when the order is ready.',
  'card fee': 'A 4% charge when a customer pays by card.',
  'tax-exempt': 'A customer who does not pay Illinois sales tax, because of an exemption letter (E-number) or a resale certificate (CRT-61).',
  'E-number': 'The number on an Illinois tax-exemption letter. Schools, churches and charities usually have one.',
  'CRT-61': 'The Illinois resale certificate, for customers buying to resell.',
  'rush': 'Faster turnaround for a fee: next day +80%, 2 days +50%, 3 days +30%, 4 days +10%. Only after checking the press.',
  'turnaround': 'How many business days an order takes after the proof is approved and the deposit is paid.',
  'proof': 'The picture of the design on the garment that the customer approves in writing before anything is printed.',
  'lead': 'Anyone who has asked about an order, on any channel. Every lead lives on the Leads page.',
  'rep lead': 'A customer you found through your own outreach and registered with "I found this customer" before quoting. It earns your commission.',
  'shop lead': 'A customer who came to the shop (website, chat, ads, calls, walk-ins) or that the shop already knew. Your wage covers it.',
  'follow-up date': 'The day a lead comes back on My Day for your next message. Every lead you touch gets one.',
  'prospect': 'A group or business that probably needs shirts soon but has not asked yet.',
  'upsell': 'Offering something that makes the order better for the customer: more pieces at a lower price each, a second print place, a pack.',
  'reorder': 'A past customer ordering again. Schools, teams and businesses often reorder every season.',
  'My Day': 'Your start page: leads waiting, follow-ups due, tasks, training and the owner\'s latest note.',
  'Playbook': 'Ready replies, how-tos and guides. Type a question or a /shortcut to find one.',
  'commission': 'Your % of the price before tax, on your own (rep) leads only.',
  'cutout pack': 'Big Head Cutouts sold as a pack of heads. Often cheaper per head than singles.',
  'Team chat': 'Your private conversation with June. Ask here whenever you are unsure.',
  'quote exam': 'Real requests the owner has already quoted. You build each one and the system checks it against her answer.',
};

/* Each lesson: id (unique), article (playbook title), minutes, goals,
   checks (ungraded "check yourself"), tryIt (links to the real screen), body. */
const MODULES = [
  /* ── 1 ── */
  {
    key: 's1', icon: '👋', title: 'Welcome: the shop, our customers, and the lines we never cross',
    goal: 'Know who we serve, what a good day looks like, and which decisions are always June\'s.',
    lessons: [{
      id: 's1-welcome', article: A.welcome, minutes: 15, tags: 'welcome, rules, hand off, never promise',
      goals: ['Describe what June\'s Tees makes and for whom', 'List the five things you never promise', 'Know when and how to hand a customer to June'],
      tryIt: [{ label: 'Open Team chat and say hello to June', href: '/admin/team-chat' }],
      body:
`Welcome to the team! This first lesson explains who we are, who our customers are, and the few rules that protect the shop. Everything else in this course builds on it.

**Who we are**

June's Tees is a custom print shop in Chicago. We make custom T-shirts, hoodies, polos, hats and more, decorated with screen printing, DTF (full-colour transfers) and embroidery. We also make signs and banners, Big Head Cutouts and other printed products. Customers order two ways: they request a quote (that is your work), or they design and pay online at jtees.net.

**Who our customers are**

- Schools, PTOs and booster clubs: spirit wear, field day, graduation, staff shirts
- Sports leagues and teams: uniforms and fan shirts every season
- Churches, camps, charity runs and walks
- Small businesses: staff shirts, polos, uniforms, opening events
- Families and groups: reunions, birthdays, memorials, trips, Greek life

Most of them order for a date: an event, a season, a game. That date drives everything, so you always ask for it.

**What a good day looks like**

- Every new enquiry gets a reply within 1 hour during your shift (chats within 15 minutes)
- Every quote you send gets a friendly follow-up, and every lead has a next follow-up date
- In quiet time you find new customers instead of waiting
- You end the day with a short note to June: what you did, what is stuck, and what you will do first tomorrow

**What you never promise**

These are always June's decisions. Promising them, even kindly, can cost the shop money or break the law:

- A delivery date, before you have checked stock and the production board
- A discount, a free item or a price match
- Printing a logo the customer does not own (sports teams, brands, characters, celebrities)
- An exact colour match without a Pantone number
- A refund or a free reprint

**How to hand a customer to June**

You never leave a customer waiting while you find out. The pattern is always the same:

- Reply to the customer straight away: thank them and say you are checking
- Give them a time you will update them by ("I'll get back to you by 3pm")
- Message June in Team chat with the details (the lead or quote number, what they asked, any photos)
- Reply to the customer by the time you gave, even if the answer is "still checking"

**How you learn here**

This course is about 8 hours. Each module has lessons, a short quiz (80% to pass, retake as often as you need), and catch-up time. The Playbook has ready-made replies for almost everything; search it before you ask. When you are unsure, ask June in Team chat. Asking is never wrong; guessing can be.`,
    }],
    practice: [],
    quiz: {
      key: 'sales-s1', title: 'Module 1 quiz: the shop and the rules', minutes: 10,
      questions: [
        { id: 'who', q: 'Which group is a typical June\'s Tees customer?',
          choices: ['Only online shoppers buying one shirt', 'Schools, teams, churches, businesses and family groups ordering for a date', 'Other print shops buying blanks', 'Clothing stores reselling our designs'],
          answer: 1, article: A.welcome, why: 'Most of our customers are groups ordering for an event, a season or their staff, and the date drives everything.' },
        { id: 'reply', q: 'A quote form comes in during your shift. What is the longest it should wait for a reply?',
          choices: ['1 hour', 'End of the day', '24 hours', 'Until the quote is ready'],
          answer: 0, article: A.welcome, why: 'Forms get a reply within 1 hour and chats within 15 minutes. The first shop to answer usually wins.' },
        { id: 'discount', q: 'A customer asks for 10% off because they are a non-profit. What do you do?',
          choices: ['Give 10%, it is a good cause', 'Say we never give discounts', 'Say you will check with June and reply by a set time, then ask June', 'Offer 5% as a compromise'],
          answer: 2, article: A.never, why: 'Discounts and price matches are always June\'s decision. Reply quickly, give a time, ask June.' },
        { id: 'logo', q: 'A customer wants 40 shirts with a Chicago Bears logo for a party. What is right?',
          choices: ['Quote it like any order', 'Redraw the logo a little so it is different', 'Bring it to June: we do not print logos the customer does not own, and an original design is the usual offer', 'Tell them to buy official merch'],
          answer: 2, article: A.never, why: 'Logos the customer does not own always go to June. An original design on the same theme is the usual offer.' },
        { id: 'date', q: 'When may you promise a delivery date?',
          choices: ['Whenever the customer asks', 'After checking stock and the production board (and June for anything tight)', 'Never, only June talks about dates', 'Only for orders over $500'],
          answer: 1, article: A.never, why: 'A date is a promise. Check stock and the production board first, and bring tight dates to June.' },
        { id: 'colour', q: 'A customer wants "exactly our school\'s green". What do you need before promising it?',
          choices: ['A photo of their old shirt', 'The Pantone number for the green', 'Nothing, we can match it by eye', 'A link to their website'],
          answer: 1, article: A.never, why: 'Only a Pantone number lets us promise an exact match.' },
        { id: 'handoff', q: 'A customer asks something only June can answer. What is the first thing you do?',
          choices: ['Wait until June replies, then answer the customer', 'Reply to the customer now, say you are checking, and give a time you will update them by', 'Tell them to email June directly', 'Guess, then correct it later if needed'],
          answer: 1, article: A.welcome, why: 'Never leave a customer waiting in silence. Reply, give a time, ask June, and keep the time.' },
        { id: 'refund', q: 'A customer is upset that two shirts have a small print flaw and asks for a refund. What do you say?',
          choices: ['"Of course, I\'ll refund you now"', '"Sorry, small flaws are normal"', '"I\'m so sorry. Could you send a photo? I\'m bringing this to June now and will update you by [time]"', '"We can reprint them for free tomorrow"'],
          answer: 2, article: A.never, why: 'Refunds and reprints are June\'s. Apologise once, ask for photos, bring it to June, and give a time.' },
        { id: 'eod', q: 'What do you send June at the end of each shift?',
          choices: ['Nothing, she can see everything', 'A short note: what you did, what is stuck, and what you will do first tomorrow', 'A screenshot of My Day', 'Only a list of quotes sent'],
          answer: 1, article: A.welcome, why: 'The end-of-day note means June starts with a clear list and nothing slips.' },
        { id: 'unsure', q: 'You are not sure of an answer and June is busy. What is right?',
          choices: ['Guess, most guesses are right', 'Search the Playbook, and if it is not there, say you will check and ask June in Team chat', 'Ignore the question', 'Ask the customer to call back tomorrow'],
          answer: 1, article: A.welcome, why: 'The Playbook answers most questions. When it does not, never guess: say you will check and ask June.' },
      ],
    },
    buffer: 5,
  },

  /* ── 2 ── */
  {
    key: 's2', icon: '🧭', title: 'The back office, screen by screen',
    goal: 'Find your way around every screen you will use, and know what each one is for.',
    lessons: [{
      id: 's2-tour', article: A.tour, minutes: 20, tags: 'back office, menu, my day, leads, quotes, production, customers, playbook, team chat, levels, sign in',
      goals: ['Open each screen from the menu and say what it is for', 'Start every shift from My Day', 'Know what your training level lets you do'],
      tryIt: [
        { label: 'My Day', href: '/admin/my-day' }, { label: 'Leads', href: '/admin/leads' }, { label: 'Quotes', href: '/admin/quotes' },
        { label: 'Production', href: '/admin/production' }, { label: 'Customers', href: '/admin/customers' }, { label: 'Playbook', href: '/admin/playbook' },
      ],
      body:
`This lesson is a tour. Open each screen as you read about it (the buttons at the bottom of this page open them). Take your time and click around: nothing on these screens reaches a customer by itself.

**Signing in**

You sign in with your own email, through Cloudflare. Never share your sign-in, and never use someone else's: everything you do is recorded under your name. If you are locked out, tell June in Team chat.

**My Day: start here every shift**

My Day is your to-do list, built for you. Work it top to bottom:

- Leads waiting for a reply, oldest first
- Follow-ups due today (the dates you set on leads)
- Your tasks, your training, and June's latest note

If you only remember one screen, remember this one. An empty My Day means you have time to find new customers (module 8).

**Leads: every enquiry**

Every person who has asked about an order is a lead: quote forms, website chats, calls, texts, social messages, walk-ins. On a lead you:

- Log every call, email, text or chat you send. Logging is what counts as "answered"
- Set a follow-up date before you leave it
- Press **Quote** to build a quote that stays linked to the lead
- Add a new lead with **Add a lead**. For a customer you found yourself, choose **I found this customer** before you quote them (module 8 explains why)

**Quotes: the money board**

Every quote, and where it stands: draft, sent, accepted, waiting on a deposit, paid. Build a new quote from a lead with its Quote button, so the two stay linked.

**Production: the work board**

Every job and its step: artwork, proof, blanks, printing, ready. Open a job to see its whole story: the quote, payments, artwork, proofs and every message. You send customer messages and proofs from the job page.

**Customers**

Everyone who has ordered or asked. Search by name, email or phone to see their whole history before you reply. A team that ordered last season is your easiest next sale.

**Playbook**

Ready-made replies and how-tos. Type a question in plain words ("deposit", "rush") or a shortcut like /quote. Copy a reply, then make it personal: their name, their event, their numbers. These course lessons live in the Playbook too.

**Team chat**

Your private conversation with June. Ask here whenever you are unsure: it is faster than guessing, and asking is never wrong.

**Training and My earnings**

Training is this course. My earnings shows your wage, commission and bonuses (module 10 explains how pay works).

**Your level, and why some things wait**

You start at **Training**. At this level June sees your quotes and customer messages before the customer does, so a mistake costs nothing. Something that needs June shows as **waiting for approval**: that is normal, not an error. Once approved it shows on My Day; then you copy the message and send it. Later levels (Supervised, then Trusted) let you send more on your own. June decides when you move up.

**Page tips**

While you are in training, each screen shows a short tip at the top: what the page is for and the one mistake to avoid. Read each one, then hide it.

**Your password manager**

Some shop tools (social accounts, Canva, supplier sites) have shared logins. They are never sent in chat or email. June invites you to the team password manager, and the Resources page lists each tool and where its login is. [owner to fill in: which password manager, and which tools sales uses]`,
    }],
    practice: [
      { key: 'signoff:vault', type: 'signoff', minutes: 0, needs: 'resources',
        title: 'Set up your password manager', hint: 'Accept June\'s invite, then open one shared login from the Resources page. June signs this off.' },
    ],
    quiz: {
      key: 'sales-s2', title: 'Module 2 quiz: where do you find it?', minutes: 10,
      questions: [
        { id: 'start', q: 'Your shift starts. Which screen do you open first?',
          choices: ['Quotes', 'My Day', 'Customers', 'Playbook'],
          answer: 1, article: A.tour, why: 'My Day lists leads waiting, follow-ups due and your tasks, oldest first.' },
        { id: 'answered', q: 'What counts as "answered" on a lead?',
          choices: ['Opening the lead', 'Logging the call, email, text or chat you sent on the lead', 'Reading the customer\'s message', 'Building a quote'],
          answer: 1, article: A.tour, why: 'Logging the contact on the lead is what counts, and it is what June sees.' },
        { id: 'linked', q: 'How do you start a quote so it stays linked to the enquiry?',
          choices: ['Quotes, then New quote', 'The Quote button on the lead', 'Copy an old quote', 'Ask June to start it'],
          answer: 1, article: A.tour, why: 'The Quote button on the lead links the two, so the history and credit stay together.' },
        { id: 'history', q: 'A returning customer writes in. Where do you see everything they ordered before?',
          choices: ['Customers, searching by name, email or phone', 'Team chat', 'Training', 'My earnings'],
          answer: 0, article: A.tour, why: 'Customers shows each person\'s whole history.' },
        { id: 'job', q: 'Where do you send a customer a message about their order in production?',
          choices: ['From your personal email', 'From the job page (Production, then the job)', 'From the Playbook', 'From Team chat'],
          answer: 1, article: A.tour, why: 'Messages go from the job page, so they are recorded on the order.' },
        { id: 'waiting', q: 'Your quote shows "waiting for approval". What does that mean?',
          choices: ['The system is broken', 'The customer has not opened it', 'June checks it before the customer sees it, because you are in training', 'The quote expired'],
          answer: 2, article: A.tour, why: 'At the Training level June checks quotes and messages first. It is normal.' },
        { id: 'reply', q: 'A customer asks about deposits. Where is the quickest ready-made reply?',
          choices: ['Google', 'The Playbook: search "deposit" or use its shortcut', 'An old email', 'Team chat history'],
          answer: 1, article: A.tour, why: 'The Playbook has a ready reply for most questions. Make it personal before you send it.' },
        { id: 'signin', q: 'A teammate asks to use your sign-in for a minute. What do you do?',
          choices: ['Share it, it is only a minute', 'Never share it: everything is recorded under your name. They ask June for their own', 'Share it but change the password after', 'Sign in for them'],
          answer: 1, article: A.tour, why: 'Your sign-in is yours alone; everything done with it is recorded as you.' },
        { id: 'board', q: 'Which screen shows each job\'s step: artwork, proof, blanks, printing, ready?',
          choices: ['Quotes', 'Leads', 'Production', 'My Day'],
          answer: 2, article: A.tour, why: 'Production is the work board.' },
        { id: 'logins', q: 'You need the login for the shop\'s Instagram. Where do you get it?',
          choices: ['Ask June to text it to you', 'The team password manager (the Resources page says where)', 'A teammate\'s notes', 'Reset the password yourself'],
          answer: 1, article: A.tour, why: 'Shared logins live only in the password manager, never in chat, email or texts.' },
      ],
    },
    buffer: 5,
  },

  /* ── 3 ── */
  {
    key: 's3', icon: '👕', title: 'What we make: print methods, garments and products',
    goal: 'Recommend the right decoration for any order, and know what changes a price.',
    lessons: [{
      id: 's3-methods', article: A.methods, minutes: 20, tags: 'screen printing, dtf, embroidery, patches, vinyl, puff, minimum, colours, white base, which method',
      goals: ['Choose between screen printing, DTF and embroidery for any order', 'Explain the 50-piece screen print minimum in a friendly way', 'Know what artwork each method needs'],
      tryIt: [{ label: 'Search the Playbook for "artwork"', href: '/admin/playbook?q=artwork' }],
      body:
`Customers rarely know which decoration they need. Your job is to recommend the best value for their order. Three methods cover almost everything.

**Screen printing**

Ink is pushed through a fine mesh screen onto the garment. Each ink colour needs its own screen.

- **Best for:** 50 pieces or more, designs with a few solid colours, the lowest price per shirt on bigger runs
- **Minimum:** 50 pieces. Each screen is set up once and runs the whole job, so small runs are expensive. Under 50, the quote form shows an orange warning and suggests DTF
- **What changes the price:** the number of ink colours, the number of print places (front, back, each sleeve), and the quantity. Screens are a one-time charge: (ink colours + 1 for the white base) × print places
- **The white base:** a layer of white printed under the colours so they stay bright. It goes on every garment and counts as one screen
- **Artwork:** vector art, or 300 dpi at print size. Lines at least 1pt, text at least 6pt. Gradients and photos need halftones, so check with June before quoting them
- **Exact colours:** only with a Pantone number

**DTF (direct-to-film)**

The design is printed in full colour onto a film, then heat-pressed onto the garment.

- **Best for:** small runs, full-colour designs, photos, many different names or designs, and mixed garments
- **Minimum:** none. One shirt is fine
- **Artwork:** a transparent PNG at 300 dpi at print size. No white box behind the design (it prints as a white box). Soft glows and shadows print as a haze, so they must be made solid

**Embroidery**

The design is stitched in thread. We embroider in house.

- **Best for:** logos on polos, caps, jackets, bags and workwear. It looks premium and lasts
- **Digitizing:** the logo is turned into a stitch file once. That is a one-time setup fee per design; reorders reuse the file. If the customer supplies a usable stitch file, there is no fee (the quote form has a box for that)
- **Artwork:** bold, simple shapes. Text at least 0.25 inch tall. No gradients, photos or fine detail. A left-chest logo is about 3.5 to 4 inches wide
- **Never promise:** small text on caps

**Patches, vinyl and puff print**

We offer these too, but check with June before quoting: [owner to fill in: minimum size and quantity, colour limits, which garments each one works on].

**Choosing, in one line each**

- 50+ pieces, a few solid colours: **screen printing**
- Under 50 pieces, or full colour, or every shirt different: **DTF**
- A logo on polos, caps or jackets: **embroidery**

When you recommend, explain why in plain words: "For 30 shirts, DTF is the better value. Screen printing needs 50 because every colour has its own screen." The Playbook prompt "Explain screen print vs DTF vs embroidery" helps you write this.

**Logos the customer does not own**

Whatever the method: sports teams, brands, characters and celebrities go to June. We offer an original design on the same theme.`,
    }, {
      id: 's3-products', article: A.products, minutes: 15, tags: 'garments, blanks, signs, banners, cutouts, turnaround, rush, delivery, shipping, pickup',
      goals: ['Name the product families beyond shirts', 'Quote turnaround and rush correctly', 'Explain pickup, shipping and local delivery'],
      tryIt: [{ label: 'See how the shop looks to customers', href: 'https://www.jtees.net' }],
      body:
`Shirts are most of what we sell, but not all of it. This lesson covers garments, the other products, and the timing rules behind every quote.

**Garments**

- T-shirts, long sleeves, hoodies and sweatshirts, polos, jackets, hats and caps, bags, youth sizes, and more
- Our blanks come from S&S Activewear. The quote form lists the products and prices for you; you never look up a garment price by hand
- Brands and weights differ in price and feel. When a customer is unsure, ask their budget and the vibe (soft and fitted, heavy and classic, performance for sports) and suggest two options
- Sizes: always ask for the size mix. Bigger sizes (2XL and up) can cost more, and the quote form adds that for you once the sizes are in

**Signs and banners**

We make signs and banners in any size, through our sign supplier:

- Banners, yard signs (with stakes), rigid signs, window graphics, wall and floor graphics, vehicle graphics and magnets, custom magnets, photo panels and stretched canvas
- Every sign is sized and priced by the system from the size and material you enter. You never work out a sign price yourself
- Artwork needs to be high resolution for the full printed size

**Big Head Cutouts**

Giant printed heads of players, graduates or family members, for games, parties and graduations. They come as singles or as packs. A pack is often cheaper per head than buying singles; the quote form's Upsell ideas box tells you when (module 7).

**Turnaround**

- Most orders are ready in [standard turnaround, owner to fill in] business days after the customer approves the proof and pays the deposit
- The clock starts at proof approval and deposit, not at the first message. Late artwork or a late approval moves the date

**Rush**

For a fee, depending on what is on the press:

- Next business day: +80%
- 2 business days: +50%
- 3 business days: +30%
- 4 business days: +10%

The quote form sets the rush from the **Needed by** date you enter, so get the real date from the customer. Never promise a rush date before June confirms the press can do it.

**Getting the order to the customer**

- **Pickup** at the shop, free
- **Shipping** with tracking. Double-check the address: a label cannot be moved once bought
- **Local delivery** to nearby ZIP codes, priced by zone and booked into a date and time window at checkout

**Online orders**

Customers can also design and pay online at jtees.net. Those show on **Orders**. If a customer wants something the online designer cannot do (many designs, special garments, embroidery details), a quote from you is the way.`,
    }],
    practice: [],
    quiz: {
      key: 'sales-s3', title: 'Module 3 quiz: methods and products', minutes: 10,
      questions: [
        { id: 'small', q: 'A coach wants 30 shirts with a 2-colour logo. What do you suggest?',
          choices: ['Screen printing, it is always cheapest', 'DTF (or embroidery), because screen printing starts at 50 pieces', 'Tell them 30 is too few', 'Ask them to order 50'],
          answer: 1, article: A.methods, why: 'Screen printing starts at 50. DTF has no minimum. Offer the best-value option, never a refusal.' },
        { id: 'big', q: '300 staff shirts with a 1-colour logo. Usually the best value?',
          choices: ['DTF', 'Embroidery', 'Screen printing', 'Vinyl'],
          answer: 2, article: A.methods, why: 'Screens are a one-time charge, so on big runs with few colours screen printing is cheapest per shirt.' },
        { id: 'screens', q: 'How many screens does a 3-colour design printed on the front only need?',
          choices: ['3', '4: three colours plus the white base', '1', '6'],
          answer: 1, article: A.methods, why: 'Screens = (ink colours + 1 for the white base) × print places. 3 + 1 = 4.' },
        { id: 'whitebox', q: 'A DTF file has a white box behind the design. What happens?',
          choices: ['Nothing, white disappears', 'The white box prints too. The file needs a transparent background', 'It prints faster', 'DTF removes it automatically'],
          answer: 1, article: A.methods, why: 'DTF needs a transparent PNG at 300 dpi. A white box prints as a white box.' },
        { id: 'polo', q: 'A business wants its logo on 24 polos. What fits best?',
          choices: ['Embroidery, with a one-time digitizing fee', 'Screen printing', 'Vinyl', 'Puff print without asking June'],
          answer: 0, article: A.methods, why: 'Logos on polos look best embroidered. Digitizing is a one-time setup fee per design.' },
        { id: 'captext', q: 'A customer wants a long, tiny slogan embroidered on a cap. What do you say?',
          choices: ['"No problem"', 'Embroidered text needs to be at least 0.25 inch tall, so suggest a shorter slogan or a bigger place', 'Switch to DTF without asking', 'Shrink it to fit'],
          answer: 1, article: A.methods, why: 'Small text fills in and cannot be read. Never promise small text on caps.' },
        { id: 'rush', q: 'Rush for 2 business days adds what to the price?',
          choices: ['+10%', '+30%', '+50%', '+80%'],
          answer: 2, article: A.products, why: 'Next day +80%, 2 days +50%, 3 days +30%, 4 days +10%, and only after checking the press.' },
        { id: 'clock', q: 'When does the turnaround clock start?',
          choices: ['When the customer first writes', 'When you send the quote', 'When the customer approves the proof and pays the deposit', 'When the blanks arrive'],
          answer: 2, article: A.products, why: 'Turnaround counts from proof approval and deposit, so late artwork moves the date.' },
        { id: 'sign', q: 'A church wants a 6-foot banner. How do you price it?',
          choices: ['Guess from a similar job', 'Enter the size and material on the quote form; the system prices signs', 'Ask the customer what they want to pay', 'Signs are not something we make'],
          answer: 1, article: A.products, why: 'Signs and banners are sized and priced by the system from the size and material.' },
        { id: 'label', q: 'Before you buy a shipping label, what do you check?',
          choices: ['Nothing, labels can be moved', 'The address, because a label cannot be moved once bought', 'The weather', 'That the customer has reviewed us'],
          answer: 1, article: A.products, why: 'A bought label cannot be changed, so the address must be right first.' },
      ],
    },
    buffer: 5,
  },

  /* ── 4 ── */
  {
    key: 's4', icon: '💬', title: 'Answering leads',
    goal: 'Answer every enquiry fast, get every detail a quote needs in one message, and never lose a lead.',
    lessons: [{
      id: 's4-leads', article: A.leads, minutes: 20, tags: 'new lead, first reply, five details, quote reply, chat, phone, follow up, logging, social inbox',
      goals: ['Reply within the time limits on every channel', 'Ask for the five details in one friendly message', 'Log every contact and set a follow-up date'],
      tryIt: [{ label: 'Open Leads', href: '/admin/leads' }, { label: 'The /quote reply in the Playbook', href: '/admin/playbook?q=quote' }],
      body:
`The first shop to answer usually wins the order. A quick, friendly reply that asks the right questions beats a perfect quote tomorrow.

**How fast**

- Quote forms and emails: within **1 hour** during your shift
- Website chats: within **15 minutes**
- Calls you missed: call back the same shift
- Social comments and DMs: checked twice a day, morning and afternoon (module 10)

Answer the oldest lead first. My Day lists them for you.

**The five details**

You cannot quote without these, so ask for all of them in ONE message (the /quote reply in the Playbook does it):

- How many pieces, and the size mix
- The garment (or the vibe and budget, and you suggest some)
- Where the design goes (front, back, sleeve) and how many colours
- Their artwork, or a description of it
- The date they need them by

Never send a random price to "how much for shirts?". The price depends on all five.

**A good first reply**

- Thank them by name
- Answer anything they asked directly
- Ask for the missing details, numbered, so they are easy to answer
- Offer to help ("If you're not sure on garments, tell me your budget and I'll suggest two")
- Keep it short and warm. Check the spelling of their name and their group

**Phone and chat**

- On the phone, take notes as you go and read the five details back at the end
- In chat, ask one or two questions at a time, then offer to email the full quote
- After any call or chat, log it on the lead with a short summary

**Logging and follow-up dates**

Every contact you make goes on the lead: Call, Email, Text or Chat, with a one-line note. That is what counts as answered, and it is how June (and you, next week) know what happened. Before you leave a lead, set a **follow-up date**: the day it comes back on My Day.

**When they answer the five questions**

Press **Quote** on the lead and build it (module 5). If your quote is waiting for June's approval, it shows on My Day once approved; then copy the message and send it.

**Spotting a bigger order**

A business, school or team asking about one thing often needs more: staff polos, embroidered jackets, new-hire kits, event shirts, reorders. Ask about them once, kindly, without pushing (the /business reply).

**When you do not know**

Never guess. "Good question! Let me check and I'll get back to you by 2pm." Then ask June, and reply by 2pm even if the answer is "still checking" (/checking).`,
    }],
    practice: [
      { key: 'do:lead', type: 'do', fact: 'leads', minutes: 10,
        title: 'Answer your first real lead', hint: 'Open a lead from My Day, reply with the /quote questions, log it on the lead and set a follow-up date. While you are in training, June sees your message first.' },
    ],
    quiz: {
      key: 'sales-s4', title: 'Module 4 quiz: answering leads', minutes: 10,
      questions: [
        { id: 'vague', q: 'A message says only "how much for shirts?". What is the best reply?',
          choices: ['The price of our cheapest shirt', 'Thanks, and ask how many, which garment, where the design goes and how many colours, their artwork, and the date', 'Ask them to call June', 'The whole catalogue'],
          answer: 1, article: A.leads, why: 'You cannot quote without the five details. The /quote reply asks for all of them in one message.' },
        { id: 'chat', q: 'A website chat comes in. How fast should you answer?',
          choices: ['Within 15 minutes', 'Within 1 hour', 'By the end of the shift', 'Next day'],
          answer: 0, article: A.leads, why: 'Chats within 15 minutes, forms within 1 hour.' },
        { id: 'oldest', q: 'Three leads are waiting. Which do you answer first?',
          choices: ['The biggest order', 'The oldest', 'The easiest', 'The one with a phone number'],
          answer: 1, article: A.leads, why: 'Oldest first, so nobody waits longest. My Day orders them for you.' },
        { id: 'log', q: 'You emailed a customer from the lead. What else must you do before leaving it?',
          choices: ['Nothing', 'Log it on the lead and set a follow-up date', 'Tell June in chat', 'Delete the lead'],
          answer: 1, article: A.leads, why: 'Log every contact and set a follow-up date, or the lead can be forgotten.' },
        { id: 'phone', q: 'On a phone call, how do you make sure you got the details right?',
          choices: ['Trust your memory', 'Take notes and read the five details back at the end, then log the call', 'Ask them to email instead', 'Record the call without telling them'],
          answer: 1, article: A.leads, why: 'Read it back, then log the call with a summary.' },
        { id: 'bigger', q: 'A local gym asks for 20 staff tees. What else might you ask, once and kindly?',
          choices: ['Nothing, just quote the tees', 'Whether they also need polos, hoodies or event shirts, and if they reorder for new staff', 'For a bigger order to get a discount', 'For their annual revenue'],
          answer: 1, article: A.leads, why: 'Businesses often need more than one item. Ask once, without pushing (/business).' },
        { id: 'unknown', q: 'A customer asks if we can print on a fabric you have never heard of. What do you say?',
          choices: ['"Yes, we print on anything"', '"No"', '"Good question! Let me check and get back to you by [time]", then ask June', 'Nothing until June answers'],
          answer: 2, article: A.leads, why: 'Never guess. Give a time, ask June, and keep the time.' },
        { id: 'quote', q: 'The customer answered all five questions. How do you start the quote?',
          choices: ['Quotes, New quote', 'The Quote button on their lead', 'Email them a price', 'Ask June to quote it'],
          answer: 1, article: A.leads, why: 'The Quote button links the quote to the lead.' },
        { id: 'held', q: 'Your quote is waiting for June\'s approval. When do you send it to the customer?',
          choices: ['Right away, from your email', 'When it shows as approved on My Day: copy the message and send it', 'Never, June sends all quotes', 'After 24 hours'],
          answer: 1, article: A.leads, why: 'Approved quotes show on My Day, ready to copy and send.' },
        { id: 'missed', q: 'You missed a call from a number on a lead. What now?',
          choices: ['Wait for them to call again', 'Call back the same shift and log it', 'Text them a price', 'Remove the lead'],
          answer: 1, article: A.leads, why: 'Missed calls get a call back the same shift, logged on the lead.' },
      ],
    },
    buffer: 5,
  },

  /* ── 5 ── */
  {
    key: 's5', icon: '🧾', title: 'Building quotes',
    goal: 'Build an accurate quote from a lead, with options, sizes, dates and the right tax, and save it safely.',
    lessons: [{
      id: 's5-quotes', article: A.quotes, minutes: 25, tags: 'quote form, items, decoration, ink colours, where, sizes, options, run number, draft, rush, deposit, tax exempt, digitizing',
      goals: ['Fill in every part of the quote form', 'Use optional items and Run numbers', 'Know when tax comes off and how deposits work'],
      tryIt: [{ label: 'Open the quote form (save as a draft only)', href: '/admin/quote/new' }],
      body:
`The quote form does all the maths. Your job is to put the right things in the right boxes. A wrong box means a wrong price, so go slowly at first. In the next lesson you build a practice quote step by step.

**Starting the quote**

Always start from the lead's **Quote** button, so the quote, the lead and your credit stay linked. The customer's name, email and mobile come across from the lead. Check them: a typo in the email means the quote never arrives.

**Each item**

An item is one product, decorated one way. For each:

- **What is it:** a short description the customer sees, e.g. "24 tees, 1 colour front"
- **Product:** the garment. The list comes with prices; you never look up a garment price
- **Colour** of the garment
- **Qty:** how many pieces
- **Each $:** leave it **blank**. The system prices it from the list. A typed price is a custom price, and June checks those
- **Decoration and Where:** one row per print place (front, back, each sleeve), each with its decoration method and **Ink colours**. Add a row for each place the customer wants
- **Screens** and **Digitizing** show automatically for screen printing and embroidery. Tick "No digitizing — they supplied a usable file" only when they really did

**Sizes and details**

Open **Details, photos & sizes** and enter the size mix. The sizes must add up to the Qty. Bigger sizes may cost more; the form adds that. The details line ("Black tee, white logo, front") is what the customer sees, so make it clear.

**Warnings**

If something is off, an orange warning shows under the item: for example screen printing under 50 pieces ("quote DTF instead"). Read every warning before you save.

**Optional items: let them choose**

When a customer wants to compare (tee or hoodie?) or might add extras (a back print, hats), put everything on ONE quote:

- Tick **Optional — the customer chooses** on each item they get to pick. Items left unticked are always included
- The totals count only the required items; optional ones show on their own row
- On their quote page, each optional item has an **Add this to my order** box, and their total, tax and deposit change as they tick
- To offer several items as one choice, tick Optional on each and give them the same **Run number**. A Run number gives items a shared price band, so their quantities add together. It cannot be on both optional and required items (the form warns you)

**Dates and notes**

- **Needed by:** the customer's real date. The form sets the rush from it, so never guess
- **Quote good for:** leave it at 14 days unless June says otherwise
- **Notes for the customer:** a friendly line, e.g. "Thanks for choosing June's Tees! A proof comes before anything is printed."

**Tax**

Illinois sales tax is added automatically. It comes off only when the customer is tax-exempt with an approved certificate: an exemption letter (E-number) for schools, churches and charities, or a CRT-61 for resellers. The customer uploads it on their quote page; you pre-screen it on **Certificates** and June approves it. If tax is off, the form asks **Why no tax?**, and the reason is shown to the customer.

**Discounts**

The Discount box is June's. Do not use it without her say-so.

**Deposits**

The quote shows the **Deposit to start**: 50% of the total, or the full amount for orders under $100. Customers pay from their quote link; card payments carry a 4% card fee.

**Save as draft, or finish**

- **Save as draft** keeps it private: the customer link does not open and nothing is sent. Use it while you are unsure or waiting on a detail
- Finishing makes it ready to send. While you are in training it goes to June first; once approved it shows on My Day for you to send

**After it is sent**

The customer's link always shows the latest version, so a fix is just an edit and a save. You cannot change a customer's name, email or phone on a sent quote: ask June.`,
    }, {
      id: 's5-practice', article: A.practice, existing: true, minutes: 20,
      goals: ['Build a full screen print quote in the real form', 'Save it as a draft so nothing is sent'],
      tryIt: [{ label: 'Open the quote form', href: '/admin/quote/new' }],
    }],
    practice: [
      { key: 'signoff:screenprint', type: 'signoff', minutes: 5,
        title: 'Practice quote built correctly', hint: 'Tell June in Team chat: "Practice quote saved, total $___". She opens your draft and signs this off.' },
    ],
    quiz: {
      key: 'sales-s5', title: 'Module 5 quiz: building quotes', minutes: 10,
      questions: [
        { id: 'each', q: 'What do you put in "Each $" for a normal item?',
          choices: ['The price you think is fair', 'Leave it blank so the system prices it', 'The garment cost', 'The competitor\'s price'],
          answer: 1, article: A.quotes, why: 'Blank means the system prices it from the list. A typed price is a custom price June checks.' },
        { id: 'compare', q: 'A customer wants to choose between tees and hoodies. What do you build?',
          choices: ['Two separate quotes', 'One quote with both items ticked Optional', 'A quote for tees only', 'An email with two prices'],
          answer: 1, article: A.quotes, why: 'Optional items let the customer tick what they want on one quote.' },
        { id: 'places', q: 'The design goes on the front and the back. How does that go on the item?',
          choices: ['One row, with "front and back" in the description', 'Two Where rows: front and back, each with its method and ink colours', 'Two separate items', 'Double the quantity'],
          answer: 1, article: A.quotes, why: 'Each print place is its own row, priced on its own.' },
        { id: 'sizes', q: 'The size mix is 10 S, 20 M, 15 L but the Qty says 50. What is wrong?',
          choices: ['Nothing', 'The sizes must add up to the Qty: 45 is not 50', 'Sizes do not matter', 'The Qty should be 100'],
          answer: 1, article: A.quotes, why: 'Sizes must add up to the quantity, or the order is wrong.' },
        { id: 'needed', q: 'Why does the real "Needed by" date matter on the form?',
          choices: ['It does not', 'The form sets the rush from it', 'It changes the garment colour', 'It sets the deposit'],
          answer: 1, article: A.quotes, why: 'Rush is worked out from the Needed by date, so it must be the customer\'s real date.' },
        { id: 'draft', q: 'You are waiting on the customer\'s artwork. How do you keep your work?',
          choices: ['Send the quote anyway', 'Save as draft: private, nothing is sent', 'Write it on paper', 'Delete it and start again later'],
          answer: 1, article: A.quotes, why: 'A draft is private and the customer link does not open.' },
        { id: 'tax', q: 'A PTO asks you to remove sales tax. What do you need?',
          choices: ['Nothing, schools never pay tax', 'Their Illinois exemption letter (E-number), approved before tax comes off', 'A promise by email', 'June\'s permission only'],
          answer: 1, article: A.quotes, why: 'Tax comes off only with an approved certificate: an E-number letter, or a CRT-61 for resellers.' },
        { id: 'deposit', q: 'A quote total is $80. What is the deposit?',
          choices: ['$40', '$80, the full amount: orders under $100 are paid in full', '$0', '$20'],
          answer: 1, article: A.quotes, why: '50% deposit, or the full amount under $100.' },
        { id: 'discount', q: 'May you fill in the Discount box to win a sale?',
          choices: ['Yes, up to 10%', 'Only for schools', 'No, discounts are June\'s', 'Yes, if the customer asks twice'],
          answer: 2, article: A.quotes, why: 'The Discount box is June\'s.' },
        { id: 'digitize', q: 'When do you tick "No digitizing — they supplied a usable file"?',
          choices: ['Always, to lower the price', 'Only when the customer really supplied a usable stitch file', 'When the order is big', 'Never'],
          answer: 1, article: A.quotes, why: 'Digitizing is a real cost. Only waive it when we really have a usable file.' },
      ],
    },
    buffer: 5,
  },

  /* ── 6 ── */
  {
    key: 's6', icon: '🎯', title: 'The quote exam',
    goal: 'Prove you can quote real orders the way June does.',
    lessons: [],
    practice: [
      { key: 'exam:quotes', type: 'exam', exam: 'sales-core', minutes: 45, needs: 'quoteexam',
        title: 'Pass the quote exam', hint: 'Real requests June has already quoted. Build each one in practice mode; the system checks it against her quote. 80% to pass.' },
    ],
    quiz: null,
    buffer: 5,
  },

  /* ── 7 ── */
  {
    key: 's7', icon: '⬆️', title: 'Upselling',
    goal: 'Offer what genuinely makes the order better, at the right moment, without pushing.',
    lessons: [{
      id: 's7-upsell', article: A.upsell, minutes: 25, tags: 'upsell, price break, more pieces, second print, back print, sleeve, pack, cutouts, optional items, rush, embroidery upgrade, bundle',
      goals: ['Read the Upsell ideas box and turn an idea into one friendly sentence', 'Offer upsells as optional items', 'Know when not to upsell'],
      tryIt: [{ label: 'Open a quote and find the Upsell ideas box', href: '/admin/quotes' }],
      body:
`A good upsell helps the customer: more for their money, a better-looking order, or one less thing to organise. A bad upsell feels like pressure. We only do the first kind.

**The Upsell ideas box**

On the quote form, a blue **Upsell ideas** box appears when the system spots a better deal. It is for you, never the customer. It uses the same prices as the form, so its numbers are right. It suggests three kinds:

- **The next price break:** "at 48 pieces (6 more) the price drops to $X each from $Y". Many customers order a few spares for new members once they see this
- **A second print place:** adding a back print or a sleeve in the same method, with the extra cost
- **A pack instead of singles:** for Big Head Cutouts, when a pack gives more heads for little more (or even less) money

**Apply & save** changes the item and saves the quote straight away, and the change is kept in the quote's history. Only press it when the customer has said yes. Otherwise, offer it.

**How to offer it**

- Lead with their benefit, in money: "6 more shirts brings every shirt down to $X, so the extra 6 cost only $Y"
- Connect it to their reason: spares for new players, staff who join later, a back print with the sponsor's name, the year on the sleeve
- Make it easy to say yes or no: add it as an **optional item** on the same quote, so they can tick it themselves
- Offer it once. If they say no, drop it

**Upsells that fit common orders**

- **Teams:** player names and numbers on the back, a sleeve logo, matching hoodies or hats for coaches
- **Schools and PTOs:** a second colour of shirt for staff, spirit-wear hoodies, a field-day banner
- **Businesses:** embroidered polos or jackets for front-of-house staff, hats, yard signs or a banner for an opening, a reorder plan for new hires
- **Events and reunions:** a back print with the date, matching cutouts or a banner for photos
- **Any order with a tight date:** rush, offered honestly, only after checking the press

**When the timing is right**

- In the first quote, as optional items
- In the follow-up message, if they have not decided: "By the way, at 36 the price drops to..."
- Never after they have paid, unless they ask

**When not to upsell**

- When they told you their budget is fixed, except a price break that lowers their per-piece price
- When it would push the order past their date
- When it is not really better for them

**Never**

- Add anything to their order without a clear yes
- Use the Discount box, or promise a discount, to close an upsell
- Invent a price. The box and the form price everything`,
    }],
    practice: [],
    quiz: {
      key: 'sales-s7', title: 'Module 7 quiz: upselling', minutes: 10,
      questions: [
        { id: 'box', q: 'Who is the Upsell ideas box on the quote form for?',
          choices: ['The customer', 'You, the salesperson. The customer never sees it', 'June only', 'The printer'],
          answer: 1, article: A.upsell, why: 'It is a private suggestion for you to offer when it helps.' },
        { id: 'apply', q: 'When do you press "Apply & save" on an upsell idea?',
          choices: ['Always, to raise the total', 'Only after the customer has said yes', 'Before sending every quote', 'Never'],
          answer: 1, article: A.upsell, why: 'Apply & save changes their order. Only with their yes; otherwise offer it.' },
        { id: 'how', q: 'Best way to offer a price break?',
          choices: ['"Buy more!"', '"At 48 the price drops to $X each, so the 6 extra cost only $Y. Spares for new players?"', '"You should really order more"', 'Change the quantity without asking'],
          answer: 1, article: A.upsell, why: 'Lead with their benefit in money and connect it to their reason.' },
        { id: 'optional', q: 'How do you make an upsell easy to say yes or no to?',
          choices: ['Add it as an optional item on the same quote', 'Send a second quote', 'Add it to the required items', 'Mention it on the phone only'],
          answer: 0, article: A.upsell, why: 'An optional item lets them tick it themselves.' },
        { id: 'team', q: 'Which upsell fits a youth baseball team order?',
          choices: ['Player names and numbers on the back, or matching coach hats', 'A discount if they order today', 'A bigger shirt size for everyone', 'Nothing, teams never add anything'],
          answer: 0, article: A.upsell, why: 'Names and numbers, sleeve logos and coach gear are natural team add-ons.' },
        { id: 'budget', q: 'The customer said their budget is fixed. Which upsell is still OK?',
          choices: ['Any upsell, it is your job', 'A price break that lowers what they pay per piece', 'Rush', 'Embroidered jackets'],
          answer: 1, article: A.upsell, why: 'On a fixed budget, only offer what saves them money.' },
        { id: 'no', q: 'You offered a back print and they said no. What next?',
          choices: ['Ask again in every message', 'Drop it and carry on', 'Add it anyway as a surprise', 'Offer a discount on it'],
          answer: 1, article: A.upsell, why: 'Offer once. A no is a no.' },
        { id: 'business', q: 'A cafe orders 15 tees for staff. A good, honest upsell?',
          choices: ['Embroidered aprons or hats for front-of-house, or a reorder plan for new hires', '1,000 tees', 'A 20% discount', 'Rush, whatever their date'],
          answer: 0, article: A.upsell, why: 'Businesses often need workwear and reorders for new staff.' },
        { id: 'cutout', q: 'The box suggests a cutout pack instead of singles. Why?',
          choices: ['Packs are always more expensive', 'The pack gives more heads for little more, or even less, money', 'Singles are discontinued', 'It is random'],
          answer: 1, article: A.upsell, why: 'A pack can be cheaper per head than singles.' },
        { id: 'never', q: 'Which is NEVER OK when upselling?',
          choices: ['Offering it as an optional item', 'Mentioning it in a follow-up', 'Promising a discount to close it', 'Connecting it to their event'],
          answer: 2, article: A.upsell, why: 'Discounts are June\'s, including to close an upsell.' },
      ],
    },
    buffer: 5,
  },

  /* ── 8 ── */
  {
    key: 's8', icon: '🔎', title: 'Finding new leads',
    goal: 'Find groups that need shirts soon, register them as yours, and make a first contact that gets replies.',
    lessons: [{
      id: 's8-prospect', article: A.prospect, minutes: 25, tags: 'prospecting, new leads, find customers, outreach, seasonal calendar, google maps, facebook, eventbrite, chamber, opener, follow up cadence, rep lead',
      goals: ['Name who needs shirts in each season', 'Find prospects in six places', 'Register a prospect as yours and send a first message that gets replies'],
      tryIt: [{ label: 'Leads: Add a lead', href: '/admin/leads' }, { label: 'Search Google Maps for youth soccer near the shop', href: 'https://www.google.com/maps/search/youth+soccer+league+chicago' }],
      body:
`Quiet time is selling time. A few well-chosen prospects, contacted personally, are worth more than a long list nobody follows up.

**Who needs shirts, and when**

- **August to September:** back to school, fall sports, PTO spirit wear, homecoming
- **October to December:** fall festivals, charity runs and walks, holiday staff gifts, winter sports
- **January to March:** spring sports sign-ups, business kickoffs, spring break trips
- **April to June:** field day, graduation, end-of-year staff shirts, summer camps, family reunions
- **All year:** businesses (staff shirts, uniforms, openings), churches, clubs, Greek life, birthdays and memorials

Contact a group 4 to 6 weeks before they need shirts, when they are deciding.

**Where to look**

- **Google Maps:** search "youth soccer league", "PTO", "church", "dance studio", "gym", "new restaurant" near the shop
- **League, school and PTO websites:** schedules, coaches and parent volunteers, events pages
- **Facebook:** local groups and events pages (fun runs, festivals, reunions, school events)
- **Eventbrite and city event calendars:** upcoming runs, walks and fundraisers
- **The Chamber of Commerce and business directories:** new and growing businesses
- **Past customers, on Customers:** a team that ordered last season needs shirts again (module 9)

**What makes a good prospect**

- They will need shirts **soon** (a season, an event, an opening)
- You can find a real person to contact (a coach, a PTO volunteer, an owner, an organiser)
- They are near enough for pickup or local delivery, or happy to ship

**Register them as yours first**

On **Leads**, press **Add a lead** and choose **I found this customer**, before you quote them. Add where you found them (the link) and why they need shirts now ("spring season starts April 6"). This makes it a **rep lead**: it earns your commission, and so do their reorders for 12 months. If the shop already knew them, it stays a shop lead and the page tells you why. When two people register the same new customer, the first one wins.

**The first message**

One short, personal email or DM:

- Mention their team, school or event by name, and something specific ("Congrats on the new season!")
- One line on what we do for groups like them
- One easy next step: "Want a couple of design ideas and a price?"
- Sign with your name and June's Tees

Example: "Hi Coach Rivera, congrats on the spring season at Lincoln Park Youth Soccer! We make team shirts and hoodies for local leagues here in Chicago. Want a couple of quick design ideas and a price for your players? — Christine, June's Tees"

**Follow-up**

Follow up twice at most: about 3 days after, then about 10 days after. Set the follow-up date on the lead each time. Then stop.

**Never**

- Text or call a number you found online. Email or DM only
- Add anyone to the newsletter who did not sign up
- Post the same message across many groups
- Contact anyone who has said no

**Your target**

[owner to fill in: new prospects per quiet hour, and first messages per day]`,
    }],
    practice: [
      { key: 'do:prospects', type: 'do', fact: 'prospects', need: 3, minutes: 10,
        title: 'Register 3 real prospects', hint: 'On Leads, Add a lead, "I found this customer", with the link and why they need shirts now. This ticks itself at 3.' },
    ],
    quiz: {
      key: 'sales-s8', title: 'Module 8 quiz: finding new leads', minutes: 10,
      questions: [
        { id: 'quiet', q: 'You have a quiet hour with no leads waiting. Best use of it?',
          choices: ['Find new customers who need shirts soon and add each one on Leads', 'Log off early', 'Post the same ad in every Facebook group', 'Re-read old emails'],
          answer: 0, article: A.prospect, why: 'Quiet time is for finding new leads, logged on Leads so the sale is credited to you.' },
        { id: 'prospect', q: 'You find a youth soccer league with the coach\'s email. What do you do?',
          choices: ['Add them to the newsletter', 'Text the coach', 'Add them on Leads as "I found this customer", then send one short personal email with an easy next step', 'Send the full price list'],
          answer: 2, article: A.prospect, why: 'Register first, then one personal message with an easy yes. Never newsletter or cold-text.' },
        { id: 'when', q: 'When is the best time to contact a group about shirts for an event?',
          choices: ['The day before', '4 to 6 weeks before, when they are deciding', 'A year before', 'After the event'],
          answer: 1, article: A.prospect, why: 'Reach them while they are deciding, with time to make the order.' },
        { id: 'spring', q: 'It is February. Who is most likely to need shirts soon?',
          choices: ['Spring sports leagues and spring break trips', 'Back-to-school PTOs', 'Holiday staff gifts', 'Homecoming'],
          answer: 0, article: A.prospect, why: 'January to March: spring sports sign-ups, business kickoffs, spring break trips.' },
        { id: 'register', q: 'Why click "I found this customer" before you quote?',
          choices: ['It sends them a welcome email', 'It makes it your rep lead, earning your commission (and their reorders for 12 months)', 'It gives them a discount', 'It is optional and changes nothing'],
          answer: 1, article: A.prospect, why: 'Only a customer registered as found before quoting becomes your rep lead.' },
        { id: 'known', q: 'You register a business, but the shop quoted them last year. What happens?',
          choices: ['It becomes your rep lead anyway', 'It stays a shop lead, and the page says why', 'The lead is deleted', 'June is emailed a complaint'],
          answer: 1, article: A.prospect, why: 'A customer the shop already knew stays a shop lead.' },
        { id: 'follow', q: 'How many follow-ups after your first message, at most?',
          choices: ['None', 'Two: about 3 days, then about 10 days', 'One every day until they reply', 'Five'],
          answer: 1, article: A.prospect, why: 'Follow up twice at most, then stop.' },
        { id: 'phone', q: 'You found a church\'s phone number on Google. May you text it?',
          choices: ['Yes', 'Only once', 'No. Email or DM only for prospects', 'Yes, if it is a mobile'],
          answer: 2, article: A.prospect, why: 'Never text or call a number you found online.' },
        { id: 'opener', q: 'Which first message is best?',
          choices: ['"BUY CUSTOM SHIRTS NOW! Best prices in Chicago!"', '"Hi Coach Lee, congrats on the new season at Oak Park Little League! Want a couple of design ideas and a price for your players? — Christine, June\'s Tees"', 'Our full price list with no greeting', '"Do you need shirts?"'],
          answer: 1, article: A.prospect, why: 'Personal, specific to them, with one easy next step.' },
        { id: 'where', q: 'Which is a good place to find businesses that just opened?',
          choices: ['The Chamber of Commerce and business directories', 'Our newsletter list', 'Random phone numbers', 'Other print shops\' customer lists'],
          answer: 0, article: A.prospect, why: 'Chambers, directories and Google Maps show new and growing businesses.' },
      ],
    },
    buffer: 5,
  },

  /* ── 9 ── */
  {
    key: 's9', icon: '🔁', title: 'Reorders and repeat customers',
    goal: 'Bring past customers back at the right time, and look after the reviews that bring new ones.',
    lessons: [{
      id: 's9-reorders', article: A.reorders, minutes: 15, tags: 'reorder, repeat customers, seasonal, schools, teams, churches, businesses, reviews, tax exempt, customers history',
      goals: ['Find who is due a reorder', 'Send a personal reorder note at the right time', 'Reply to reviews the way we do'],
      tryIt: [{ label: 'Customers', href: '/admin/customers' }, { label: 'Reviews', href: '/admin/reviews' }, { label: 'The /reorder reply', href: '/admin/playbook?q=reorder' }],
      body:
`The easiest sale is a customer who already liked their last order. Schools, teams, churches and businesses order on a calendar, so you can be there first.

**What the system already does**

About 90 days after a customer pays, the system emails them about a reorder. When one replies, answer within the hour like any new enquiry, starting from their last order.

**Where you add the personal touch**

The best customers order every season: schools, teams, churches and businesses. For them:

- On **Customers**, open their history: what they ordered, how many, which design, and when
- Work out when they will need it next (the same season, the yearly event, new staff)
- A few weeks before, send a short personal note (the /reorder reply): what we made last time, their upcoming season or event, and an easy next step
- Log it on the lead with the next follow-up date

Example: "Hi Ms. Patel, it's Christine from June's Tees! Last spring we made your field day shirts in royal blue and they looked great. With field day coming up in May, would you like the same again, or anything new? If we start by April 10, they'll be ready in plenty of time."

**Quoting a reorder**

Start from their last quote so the garment, colours and artwork match. Check the details with them: quantities and sizes change every year, and so might the design (a new year, new names). If the artwork changes, a new proof is needed.

**Tax-exempt customers**

Schools and churches are often tax-exempt. Check that their certificate is on file and not expired; if it is, ask for the new one before you quote.

**Reviews**

New reviews show on **Reviews**. They bring new customers, so:

- Reply to every review within two days
- Use the draft button for a start, then make it personal: thank them by first name, mention what we made, two to four sentences, signed by June
- A bad review: thank them, apologise for their experience without arguing, and invite them to message us so we can put it right. Tell June the same day, before you post
- June approves replies before they go live

**Asking for reviews**

Review requests are sent automatically after an order. Never offer anything in return for a review, and never write one yourself.`,
    }],
    practice: [],
    quiz: {
      key: 'sales-s9', title: 'Module 9 quiz: reorders', minutes: 10,
      questions: [
        { id: 'auto', q: 'What does the system send by itself about reorders?',
          choices: ['Nothing', 'An email about a reorder about 90 days after the customer paid', 'A discount code every month', 'A text every week'],
          answer: 1, article: A.reorders, why: 'The 90-day reorder email is automatic; you add the personal touch for the best customers.' },
        { id: 'timing', q: 'A school orders field day shirts every May. When do you contact them?',
          choices: ['In May', 'A few weeks before, around early April', 'In September', 'Only if they write first'],
          answer: 1, article: A.reorders, why: 'Get there a few weeks before they need it, while they are deciding.' },
        { id: 'history', q: 'Where do you check what a customer ordered last time?',
          choices: ['Customers, their history', 'Team chat', 'Training', 'The Playbook'],
          answer: 0, article: A.reorders, why: 'Customers shows every order, design and date.' },
        { id: 'start', q: 'What is the best starting point for a reorder quote?',
          choices: ['A blank quote', 'Their last quote, then confirm quantities, sizes and any design changes', 'The online designer', 'A competitor\'s price'],
          answer: 1, article: A.reorders, why: 'Start from the last quote so garment, colours and art match, then check what changed.' },
        { id: 'proof', q: 'A team reorders with a new year on the design. Do they need a new proof?',
          choices: ['No, it was approved last year', 'Yes, any change to the artwork needs a new proof and written approval', 'Only if they ask', 'Only for over 100 shirts'],
          answer: 1, article: A.reorders, why: 'We print exactly what is approved. A changed design is approved again.' },
        { id: 'cert', q: 'A church reorders. Their exemption letter on file has expired. What do you do?',
          choices: ['Use the old one', 'Ask for the new one before quoting without tax', 'Charge tax without telling them', 'Ignore it'],
          answer: 1, article: A.reorders, why: 'Tax comes off only with a valid, approved certificate.' },
        { id: 'review', q: 'How soon do we reply to a new review?',
          choices: ['Within two days', 'Within a month', 'Only bad ones', 'Never'],
          answer: 0, article: A.reorders, why: 'Every review gets a reply within two days, approved by June.' },
        { id: 'bad', q: 'A customer leaves an angry review. What do you do?',
          choices: ['Argue the facts publicly', 'Delete it', 'Tell June the same day; draft a calm reply that apologises for their experience and invites them to message us', 'Ignore it'],
          answer: 2, article: A.reorders, why: 'Calm, kind, never arguing, and June sees it before it posts.' },
        { id: 'incentive', q: 'May you offer a free shirt for a 5-star review?',
          choices: ['Yes', 'Only to big customers', 'No. Never offer anything for a review', 'Only on Google'],
          answer: 2, article: A.reorders, why: 'Never offer anything in return for a review.' },
        { id: 'log', q: 'You sent a reorder note. What else do you do?',
          choices: ['Nothing', 'Log it on the lead with the next follow-up date', 'Email June a copy', 'Add them to the newsletter'],
          answer: 1, article: A.reorders, why: 'Every reorder conversation is logged with a follow-up date.' },
      ],
    },
    buffer: 5,
  },

  /* ── 10 ── */
  {
    key: 's10', icon: '💸', title: 'Following up, getting paid, and how you are paid',
    goal: 'Follow quotes through to payment and production, and understand your own pay.',
    lessons: [{
      id: 's10-money', article: A.money, minutes: 15, tags: 'follow up, objections, price match, deposits, balances, proofs, artwork, social inbox, ai rules, end of day, commission, pay',
      goals: ['Follow up a quote without chasing', 'Hand artwork to the designer and get written proof approval', 'Explain how your wage and commission work'],
      tryIt: [{ label: 'My earnings', href: '/admin/my-earnings' }, { label: 'How the platform works and how you are paid', href: '/admin/playbook?q=commission' }],
      body:
`A sent quote is halfway. Most sales are won on the follow-up, and an order only becomes real when it is paid, proofed and printed.

**Following up a quote**

- No reply after 3 days: one short, friendly note. Any questions? The quote is good for 14 days. Then set the next follow-up date
- Give a reason to act now: their date, the 14 days, a price break they are close to
- Never chase every day, and never offer a discount just to get a reply

**Objections**

- **"It's too expensive":** ask what they compared it with. Offer a cheaper honest option (a different garment, fewer colours, DTF for a small run)
- **"Another shop is cheaper":** ask to see their quote. Prices differ because of the garment, colours, print places, setup and turnaround. Explain what ours includes, and check with June before promising anything (/pricematch)
- **"We need to think about it":** ask what they are deciding between, and set a follow-up date

**Deposits and balances**

- The system sends payment reminders automatically. Your job is the human touch
- Check the Quotes board for "accepted but deposit unpaid": text or call once, friendly, with the quote link, and log it
- Customers pay the shop only: the payment link on their quote, or cash or Zelle that you record. Recorded cash or Zelle shows "not confirmed" until June confirms it arrived
- Never offer a discount to get paid; ask June

**Artwork and proofs**

- Once you know what the customer wants, open the job and press **Send to the designer**, with the design, colours, placement, sizes, method and the date
- The designer sends a proof. Approval must be **in writing** (email, text or chat) and logged as a note on the job. Nothing prints until then
- Chase late artwork and approvals kindly and specifically: exactly what you need and the date it affects

**The social inbox, twice a day**

Morning and afternoon, check comments and DMs on the shop's accounts. Answer with Playbook replies. Anyone asking about an order or price goes on Leads (Add a lead, pick the platform, paste their profile link). Nothing negative gets a reply without June seeing it first.

**AI tools**

ChatGPT and the image tools make you faster, but never put a customer's name, email, phone, address, totals or back-office screenshots into them. Everything AI writes is a draft: prices, dates and promises come from the quote and the Playbook, never from AI. Read the full "AI rules" in the Playbook.

**Your end-of-day note**

Before you sign off: leads answered, quotes sent, follow-ups done, anything stuck and what you need, and the first thing you will do tomorrow.

**How you are paid**

- **Hourly wage** for every hour you work, tracked in TimeProof
- **Commission** on your own **rep leads** only: your % of the price **before sales tax**, plus their reorders for 12 months. Example at 3%: a $1,082.50 quote with $82.50 tax is $1,000 before tax, so $30
- **Shop leads** (website, chat, ads, calls, walk-ins, customers the shop knew) are covered by your wage, even when you close them
- Commission is payable once the customer has paid in full and 14 days have passed, never while a card dispute is open. A refund lowers it by the same share
- Commission starts once June signs off your training
- My earnings shows every figure and its status. The full guide is "How the platform works and how you are paid" in the Playbook`,
    }, {
      id: 's10-social', article: A.social, existing: true, minutes: 10,
      goals: ['Make and check a post in COS Creator Studio', 'Know what may never be posted'],
      tryIt: [{ label: 'The Resources page (COS and other tools)', href: '/admin/resources' }],
    }],
    practice: [
      { key: 'do:message', type: 'do', fact: 'messages', minutes: 5,
        title: 'Write your first customer message', hint: 'From a job page. While you are in training it waits for June.' },
      { key: 'do:eod', type: 'do', fact: 'eod', needs: 'eod', minutes: 0,
        title: 'Send your first end-of-day note', hint: 'Use "Wrap up the day" on My Day.' },
    ],
    quiz: {
      key: 'sales-s10', title: 'Module 10 quiz: follow-ups, social posts and pay', minutes: 10,
      questions: [
        { id: 'post', q: 'A customer\'s finished team shirts look great. May you post the photo?',
          choices: ['Yes, it is our work', 'Only with their permission, and a parent\'s OK for any child\'s face', 'Only without the team name', 'Only on Facebook'],
          answer: 1, article: A.social, why: 'Never post a customer\'s photo, name or design without permission; no children\'s faces without a parent\'s OK.' },
        { id: 'cos', q: 'COS Creator Studio generates a post. What do you do before it is scheduled?',
          choices: ['Nothing, it is automatic', 'Read every post: our voice, spelling, business details, one clear next step, and no unapproved prices', 'Add more hashtags', 'Ask the customer'],
          answer: 1, article: A.social, why: 'Every generated post is read and checked before it goes on the calendar.' },
        { id: 'followup', q: 'You sent a quote 3 days ago and heard nothing. Best next step?',
          choices: ['Wait', 'A friendly note asking if they have questions, mentioning the quote is good for 14 days, then a new follow-up date', 'Offer a discount', 'Call every day'],
          answer: 1, article: A.money, why: 'One friendly nudge with a reason to act, then a new follow-up date.' },
        { id: 'match', q: 'A customer says another shop is 15% cheaper. What do you do?',
          choices: ['Match it', 'Offer 10%', 'Say we never match', 'Ask to see their quote, explain what ours includes, and check with June before promising anything'],
          answer: 3, article: A.money, why: 'Price matches are June\'s. Comparing what is included often wins the sale.' },
        { id: 'expensive', q: '"It\'s too expensive." What is a good first response?',
          choices: ['Drop the price', 'Ask what they compared it with, and offer an honest cheaper option (a different garment, fewer colours, DTF)', 'End the conversation', 'Tell them quality costs money'],
          answer: 1, article: A.money, why: 'Find out what they compared, then offer real options, never a discount.' },
        { id: 'deposit', q: 'A quote is accepted but the deposit is unpaid. What do you do?',
          choices: ['Nothing, reminders are automatic', 'Text or call once, friendly, with the quote link, and log it', 'Start production anyway', 'Offer 10% off to pay today'],
          answer: 1, article: A.money, why: 'The system reminds; you add one friendly human touch, logged.' },
        { id: 'zelle', q: 'A customer says they paid by Zelle. What shows after you record it?',
          choices: ['Paid', '"Not confirmed" until June confirms it arrived', 'Refunded', 'Nothing'],
          answer: 1, article: A.money, why: 'Cash and Zelle you record wait for June to confirm the money arrived.' },
        { id: 'approved', q: 'When can a job\'s proof be marked approved?',
          choices: ['When you send it', 'When they say yes on the phone', 'Only with approval in writing (email, text or chat), logged as a note', 'After 24 hours with no reply'],
          answer: 2, article: A.money, why: 'Written approval, logged, before anything prints.' },
        { id: 'ai', q: 'Which may you paste into ChatGPT to polish a reply?',
          choices: ['The reply with the customer\'s name and email', 'The reply with the name and contact details removed', 'A screenshot of the quote', 'Their payment details'],
          answer: 1, article: A.money, why: 'Never put customer details, totals or back-office screenshots into AI tools.' },
        { id: 'commission', q: 'At 3%, what is your commission on a $1,082.50 rep-lead quote that includes $82.50 tax?',
          choices: ['$32.48', '$30.00', '$2.48', '$0, commission is on shop leads'],
          answer: 1, article: A.money, why: '3% of the price before tax: 3% of $1,000 = $30.' },
        { id: 'shoplead', q: 'You close a big order that came in through the website chat. Commission?',
          choices: ['Yes, you closed it', 'No: it is a shop lead, covered by your wage', 'Half', 'Only if over $1,000'],
          answer: 1, article: A.money, why: 'Shop leads are covered by your wage, even when you close them.' },
        { id: 'payable', q: 'When does commission become payable?',
          choices: ['When the quote is sent', 'When the deposit is paid', 'Once the customer has paid in full and 14 days have passed, with no open dispute', 'At the end of the year'],
          answer: 2, article: A.money, why: 'Paid in full, plus 14 days, and never during a card dispute.' },
      ],
    },
    buffer: 5,
  },
];

/* The final exam: new questions across the whole course, 80% to pass. */
const FINAL = {
  floating: 15,
  quiz: {
    key: 'sales-final', title: 'Final exam: the Sales course', minutes: 25,
    questions: [
      { id: 'f1', q: 'A parent fills in the quote form at 2pm during your shift asking for 12 shirts. Your first reply goes out by…',
        choices: ['3pm at the latest', 'Tomorrow morning', 'When the quote is ready', 'End of the week'], answer: 0, article: A.leads, why: 'Forms within 1 hour.' },
      { id: 'f2', q: '12 shirts, full-colour photo of the family on the front. Which method?',
        choices: ['Screen printing', 'DTF', 'Embroidery', 'Vinyl'], answer: 1, article: A.methods, why: 'Full colour, small run, no minimum: DTF.' },
      { id: 'f3', q: 'Same family wants the photo with a soft glow around it. What do you tell them?',
        choices: ['Glows print perfectly', 'Soft glows print as a haze on DTF, so we make it solid or remove it', 'Switch to embroidery', 'Nothing'], answer: 1, article: A.methods, why: 'Semi-transparent glows print as a haze on DTF.' },
      { id: 'f4', q: '75 navy tees, 2-colour front, 1-colour back. How many screens?',
        choices: ['3', '5', '2', '4'], answer: 1, article: A.methods, why: '(2+1) front + (1+1) back = 5.' },
      { id: 'f5', q: 'A dentist wants her logo on 12 polos and 12 caps. Best fit?',
        choices: ['Screen printing', 'Embroidery, with a one-time digitizing fee', 'DTF on caps', 'Vinyl'], answer: 1, article: A.methods, why: 'Logos on polos and caps: embroidery.' },
      { id: 'f6', q: 'She asks if the digitizing fee is charged again when she reorders next year. Answer?',
        choices: ['Yes, every time', 'No, it is one-time: reorders reuse the stitch file', 'Only for caps', 'It depends on the season'], answer: 1, article: A.methods, why: 'Digitizing is a one-time fee per design.' },
      { id: 'f7', q: 'A customer needs shirts in 3 business days. What is the rush fee and what do you say?',
        choices: ['+30%, and "let me check the press and confirm today by [time]"', '+80%, guaranteed', 'No rush available', '+10%, no need to check'], answer: 0, article: A.products, why: '3 days is +30%, only after checking the press.' },
      { id: 'f8', q: 'A message says "price for hoodies?" and nothing else. You…',
        choices: ['Send the cheapest hoodie price', 'Thank them and ask the five details in one message', 'Ignore it until they send more', 'Send a catalogue'], answer: 1, article: A.leads, why: 'Ask for all five in one message (/quote).' },
      { id: 'f9', q: 'You replied to a chat but did not log it. On the board, the lead shows as…',
        choices: ['Answered', 'Not answered: logging is what counts', 'Closed', 'Won'], answer: 1, article: A.tour, why: 'Logging on the lead is what counts as answered.' },
      { id: 'f10', q: 'You leave a lead after replying. What must it have?',
        choices: ['A discount', 'A follow-up date', 'A quote', 'A note to June'], answer: 1, article: A.leads, why: 'Every lead you touch gets a follow-up date.' },
      { id: 'f11', q: 'The customer wants to compare a tee at $X and a hoodie at $Y. You build…',
        choices: ['Two quotes', 'One quote with both items ticked Optional', 'One quote with both required', 'An email'], answer: 1, article: A.quotes, why: 'Optional items on one quote.' },
      { id: 'f12', q: 'Three optional hoodie colours should share one price band. You…',
        choices: ['Give them the same Run number', 'Add them as one item', 'Type a custom price', 'Make them required'], answer: 0, article: A.quotes, why: 'The same Run number gives items a shared price band.' },
      { id: 'f13', q: 'You typed $9 into "Each $" on a tee. What happens?',
        choices: ['Nothing special', 'It becomes a custom price June has to check', 'The tax comes off', 'The deposit doubles'], answer: 1, article: A.quotes, why: 'Leave Each $ blank so the system prices it.' },
      { id: 'f14', q: 'A $90 quote is accepted. How much is due to start?',
        choices: ['$45', '$90', '$0', '$22.50'], answer: 1, article: A.quotes, why: 'Under $100 is paid in full.' },
      { id: 'f15', q: 'A $600 quote is accepted. The deposit to start is…',
        choices: ['$600', '$300', '$150', '$0'], answer: 1, article: A.quotes, why: '50% deposit.' },
      { id: 'f16', q: 'A customer pays the $300 deposit by card. What else is added?',
        choices: ['Nothing', 'A 4% card fee', 'Sales tax again', 'A rush fee'], answer: 1, article: A.quotes, why: 'Card payments carry a 4% fee.' },
      { id: 'f17', q: 'A Catholic school asks for no sales tax. What do you need?',
        choices: ['Nothing', 'Their Illinois exemption letter (E-number), approved before tax comes off', 'A CRT-61', 'A letter from the principal'], answer: 1, article: A.quotes, why: 'Schools use the E-number letter; resellers use CRT-61.' },
      { id: 'f18', q: 'A boutique wants to buy shirts to resell. Which certificate?',
        choices: ['E-number letter', 'CRT-61', 'None', 'A business card'], answer: 1, article: A.quotes, why: 'CRT-61 is the resale certificate.' },
      { id: 'f19', q: 'You are waiting on a detail. How do you keep the quote private?',
        choices: ['Save as draft', 'Send it anyway', 'Email it to yourself', 'Delete it'], answer: 0, article: A.quotes, why: 'A draft is private and sends nothing.' },
      { id: 'f20', q: 'The Upsell ideas box says 6 more shirts lowers every shirt\'s price. The customer has not answered yet. You…',
        choices: ['Press Apply & save', 'Offer it as an optional item or in your follow-up, with the money it saves', 'Ignore it', 'Add the 6 shirts as required'], answer: 1, article: A.upsell, why: 'Offer it; apply only with their yes.' },
      { id: 'f21', q: 'Which upsell fits a family reunion order?',
        choices: ['A back print with the date, or a banner for photos', 'A discount', 'Embroidered jackets for everyone', 'Nothing'], answer: 0, article: A.upsell, why: 'Event dates on the back and a photo banner fit reunions.' },
      { id: 'f22', q: 'A customer said "our budget is $400, no more". Which upsell is still OK?',
        choices: ['Rush', 'A price break that lowers their per-piece price within budget', 'Hoodies for everyone', 'Any'], answer: 1, article: A.upsell, why: 'On a fixed budget, only what saves them money.' },
      { id: 'f23', q: 'It is late July. Which prospects are best right now?',
        choices: ['Back-to-school PTOs, fall sports leagues and homecoming committees', 'Spring break trips', 'Graduation', 'Field day'], answer: 0, article: A.prospect, why: 'August to September: back to school and fall sports, so reach out in late July.' },
      { id: 'f24', q: 'You find a fun run on Eventbrite with the organiser\'s email. Steps, in order?',
        choices: ['Text them, then add them', 'Add on Leads as "I found this customer" with the link and why now, then one personal email, then a follow-up date', 'Add to the newsletter', 'Post in their event comments'], answer: 1, article: A.prospect, why: 'Register first, one personal email, follow-up date.' },
      { id: 'f25', q: 'Your prospect has not replied after two follow-ups. Next?',
        choices: ['Follow up weekly', 'Stop', 'Call them', 'Message them on three platforms'], answer: 1, article: A.prospect, why: 'Two follow-ups at most, then stop.' },
      { id: 'f26', q: 'Which is never allowed with prospects?',
        choices: ['A personal email', 'A DM on their page', 'Texting a number found online', 'Logging them on Leads'], answer: 2, article: A.prospect, why: 'Email or DM only; never text or call numbers found online.' },
      { id: 'f27', q: 'A league you registered last year as your rep lead reorders this season. Commission?',
        choices: ['No', 'Yes, reorders from your rep lead earn commission for 12 months after your first sale', 'Only half', 'Only if over $500'], answer: 1, article: A.money, why: 'Rep-lead reorders count for 12 months.' },
      { id: 'f28', q: 'Last season\'s soccer club is due again. Where do you start?',
        choices: ['Customers: their history, then a personal reorder note a few weeks before the season', 'A blank quote', 'The newsletter', 'Wait for them'], answer: 0, article: A.reorders, why: 'Use their history and get there first.' },
      { id: 'f29', q: 'A reorder adds new players\' names. What about the proof?',
        choices: ['No proof needed', 'A new proof, approved in writing', 'June approves it instead', 'Only if they ask'], answer: 1, article: A.reorders, why: 'Changed artwork is approved again in writing.' },
      { id: 'f30', q: 'A 2-star review says the order was late. What do you do?',
        choices: ['Reply defending the shop', 'Tell June the same day and draft a calm reply that apologises and invites them to message us', 'Delete it', 'Offer a free order publicly'], answer: 1, article: A.reorders, why: 'Calm, kind, June sees it first.' },
      { id: 'f31', q: 'A customer says "looks great" about the proof on a call. You…',
        choices: ['Mark it approved', 'Ask them to confirm in writing (email, text or chat), then log it', 'Print it', 'Wait 24 hours'], answer: 1, article: A.money, why: 'Approval must be in writing and logged.' },
      { id: 'f32', q: 'A shirt arrives crooked and their event is tomorrow. First step?',
        choices: ['Promise a free reprint', 'Apologise, ask for a photo, bring it to June right away with a time you will update them', 'Say small differences are normal', 'Wait for June'], answer: 1, article: A.never, why: 'Reprints are June\'s; act fast and give a time.' },
      { id: 'f33', q: 'A customer wants a Disney character on 50 shirts. You…',
        choices: ['Quote it', 'Bring it to June and suggest an original design on the theme', 'Use DTF so it is allowed', 'Change the colours'], answer: 1, article: A.never, why: 'Characters the customer does not own go to June.' },
      { id: 'f34', q: 'A teammate asks for the Canva login by text. You…',
        choices: ['Text it', 'Point them to the password manager (Resources says where)', 'Email it', 'Post it in Team chat'], answer: 1, article: A.tour, why: 'Shared logins live only in the password manager.' },
      { id: 'f35', q: 'You record $200 cash from a customer. On the quote it shows…',
        choices: ['Paid', 'Not confirmed until June confirms it arrived', 'Refunded', 'Nothing'], answer: 1, article: A.money, why: 'Recorded cash or Zelle waits for June\'s confirmation.' },
      { id: 'f36', q: 'Which goes in your end-of-day note?',
        choices: ['Leads answered, quotes sent, follow-ups done, what is stuck, and your first task tomorrow', 'Only hours worked', 'A list of every email', 'Nothing'], answer: 0, article: A.money, why: 'A clear summary so June starts with a list.' },
      { id: 'f37', q: 'A big order for a business needs a decision you cannot make. The customer is waiting. You…',
        choices: ['Make the decision', 'Reply now that you are checking, give a time, ask June, and keep the time', 'Stop replying until June answers', 'Tell them to call June'], answer: 1, article: A.welcome, why: 'Never leave a customer in silence; give a time and keep it.' },
      { id: 'f38', q: 'A customer pastes a shirt they like from another shop and asks for "the same design". You…',
        choices: ['Copy it exactly', 'Offer an original design inspired by what they like; we never copy another shop\'s design', 'Refuse the order', 'Ask AI to copy it'], answer: 1, article: 'AI rules', why: 'We make new designs, not copies, by hand or with AI.' },
      { id: 'f39', q: 'A quote is 20 days old and the customer wants to accept. You…',
        choices: ['Accept as is', 'Re-check it first: quotes are good for 14 days because garment prices can change', 'Add 10%', 'Refuse'], answer: 1, article: A.quotes, why: 'Quotes are good for 14 days; re-check before ordering.' },
      { id: 'f40', q: 'Which is always June\'s decision?',
        choices: ['Which garment to suggest', 'A refund, a discount or a price match', 'When to follow up', 'Which Playbook reply to use'], answer: 1, article: A.never, why: 'Refunds, discounts and price matches are always June\'s.' },
    ],
  },
  signoffs: [
    { key: 'signoff:handoff', type: 'signoff', minutes: 0,
      title: 'Knows when to hand a customer to June', hint: 'Discounts, refunds, logos the customer does not own, rush dates, angry customers. June signs this off after seeing you do it.' },
    { key: 'signoff:ready', type: 'signoff', minutes: 0,
      title: 'Ready to send small quotes on their own', hint: 'The last step. Commission starts here, on quotes you create from now on. June decides when to move you up from Training.' },
  ],
};

/* Photos for each lesson, from the shop's own work. Its pages and their
   questions are in sales-core-pages.js. */
const W = (f) => `/assets/images/work/${f}.jpg`;
const LESSON_EXTRAS = {
  's1-welcome': {
    images: [{ src: W('hero-banner'), alt: 'Finished custom shirts from June\'s Tees' }, { src: W('youth-team-shirts'), alt: 'A youth team in their custom shirts' }],
  },
  's2-tour': {
    images: [{ src: '/assets/images/work/logo-tee-and-cap-set.jpg', alt: 'A logo tee and cap set' }],
  },
  's3-methods': {
    images: [{ src: W('screen-printing-press'), alt: 'Screen printing: one screen per colour' }, { src: W('full-color-dtf-transfer'), alt: 'DTF: a full-colour transfer' },
      { src: W('embroidery-machine-polos'), alt: 'Embroidery on polos' }],
  },
  's3-products': {
    images: [{ src: W('company-zip-hoodies'), alt: 'Company zip hoodies' }, { src: W('custom-printed-banner'), alt: 'A custom printed banner' },
      { src: '/assets/images/products/big-head-cutouts.svg', alt: 'Big Head Cutouts' }],
  },
  's4-leads': {
    images: [{ src: '/assets/images/email/school-team.jpg', alt: 'A school team order' }],
  },
  's5-quotes': {
    images: [{ src: W('full-color-team-logo-print'), alt: 'A full-colour team logo print' }],
  },
  's5-practice': {
    images: [],
  },
  's7-upsell': {
    images: [{ src: W('logo-tee-and-cap-set'), alt: 'A tee and cap set: an easy add-on' }, { src: W('youth-team-shirts'), alt: 'Team shirts with names and numbers' }],
  },
  's8-prospect': {
    images: [{ src: W('kindergarten-back-to-school-tee'), alt: 'A back-to-school class shirt' }, { src: W('youth-team-shirts'), alt: 'A youth sports team' }],
  },
  's9-reorders': {
    images: [{ src: W('embroidered-business-apparel'), alt: 'Embroidered business apparel: a classic reorder' }],
  },
  's10-money': {
    images: [{ src: W('screen-printing-silkscreen'), alt: 'A screen ready for the press' }],
  },
  's10-social': {
    images: [{ src: W('juneteenth-graphic-design'), alt: 'A finished design, ready to share' }, { src: W('ghost-graphic-tee'), alt: 'A graphic tee photo for a post' }],
  },
};
const PAGES = require('./sales-core-pages');
for (const l of MODULES.flatMap((m) => m.lessons)) {
  Object.assign(l, LESSON_EXTRAS[l.id] || {});
  l.pages = PAGES[l.id] || [{ from: null, checks: [] }];
  l.checks = l.pages.flatMap((pg) => pg.checks);
}

module.exports = { key: 'sales-core', title: 'Sales', track: 'sales', articles: A, glossary: GLOSSARY, modules: MODULES, final: FINAL };
