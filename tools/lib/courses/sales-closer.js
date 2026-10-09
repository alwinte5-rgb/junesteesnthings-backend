'use strict';

/* The Sales Closer course: the second eight hours for a salesperson the owner
   gives the Sales Closer role on Staff. It follows the consolidated Sales
   course and goes deeper on turning every lead into a paid order: fast
   replies, discovery, a quote that closes, upsells, objections, the deposit
   and the follow-up.

   Same shape as the other courses. Every rule here is one the Sales course or
   the system already sets; what only the owner can decide is written
   "[owner to fill in: ...]" for the Training page's Playbook gaps card. */

const A = {
  job:       'Sales Closer 1: The job',
  speed:     'Sales Closer 2: Speed to lead',
  discovery: 'Sales Closer 3: Discovery: the questions that win',
  quote:     'Sales Closer 4: A quote that closes',
  upsell:    'Sales Closer 5: Upselling in practice',
  objection: 'Sales Closer 6: Objections and price matches',
  yes:       'Sales Closer 7: The yes, the deposit and the proof',
  pipeline:  'Sales Closer 8: Your pipeline and your day',
};

const GLOSSARY = {
  'speed to lead': 'How fast a new enquiry gets its first real reply. The first shop to answer usually wins.',
  'discovery': 'The questions that find out what the customer really needs, beyond the five details.',
  'conversion': 'Quotes accepted divided by quotes sent.',
  'average order value': 'The average total of the orders you close.',
  'objection': 'A reason the customer gives for not saying yes yet: price, timing, another shop.',
};

const MODULES = [
  /* ── 1 ── */
  {
    key: 'cl1', icon: '🏁', title: 'The Sales Closer job',
    goal: 'Know what a Closer owns, how the job is measured, and what stays June\'s.',
    lessons: [{
      id: 'cl1-job', article: A.job, minutes: 20, tags: 'sales closer, role, conversion, reply time, average order value, targets',
      goals: ['Say what a Closer owns', 'Name the three numbers the job is measured on', 'List what is always June\'s decision'],
      tryIt: [{ label: 'Quotes', href: '/admin/quotes' }, { label: 'My stats', href: '/admin/my-stats' }],
      body:
`You finished the Sales course, so you know how to answer a lead and build a quote. This course is about the part that pays the bills: turning those leads into paid orders.

**What a Closer owns**

Every lead that comes in, from every channel, is yours to close:

- Website quote forms, chats, calls, DMs and walk-ins
- Quote requests that Lead Generation hands over
- Every sent quote until it is accepted and the deposit is paid

When a lead is ready to quote, you build it, send it, follow it up and collect the deposit. Then the job goes to production and the designer.

**What you are measured on**

- **Reply time:** how fast a new lead gets its first real answer, in working hours. Your My stats page shows the median
- **Conversion:** quotes accepted divided by quotes sent
- **Average order value:** the average total of the orders you close. Honest upsells raise it

Your targets: [owner to fill in: Sales Closer targets for reply time, conversion and average order value]

**What stays June's**

- Any discount, price match, free item or custom price
- Taking tax off (a customer uploads their certificate and June approves it)
- A delivery date you have not checked on the production board
- Logos the customer does not own, refunds and reprints

You never leave a customer waiting while you ask: reply now, give a time, ask June in Team chat, and keep the time.`,
    }],
    practice: [],
    quiz: {
      key: 'closer-1', title: 'Module 1 quiz: the job', minutes: 10,
      questions: [
        { id: 'owns', q: 'Which leads does a Closer own?',
          choices: ['Only website forms', 'Every lead from every channel, plus Lead Generation\'s quote requests', 'Only past customers', 'Only leads over $500'],
          answer: 1, article: A.job, why: 'Every lead is yours to close.' },
        { id: 'until', q: 'A sent quote is yours until…',
          choices: ['You send it', 'It is accepted and the deposit is paid', 'The customer opens it', 'The end of the week'],
          answer: 1, article: A.job, why: 'You follow it through to the deposit.' },
        { id: 'conv', q: 'You sent 20 quotes and 6 were accepted. Conversion is…',
          choices: ['6%', '30%', '20%', '60%'],
          answer: 1, article: A.job, why: '6 ÷ 20 = 30%.' },
        { id: 'aov', q: 'Which raises your average order value honestly?',
          choices: ['Adding items without asking', 'Upsells the customer says yes to', 'Typing higher prices', 'Removing tax'],
          answer: 1, article: A.job, why: 'Honest upsells raise it.' },
        { id: 'reply', q: 'Where do you see your median reply time?',
          choices: ['My stats', 'The Playbook', 'Resources', 'Nowhere'],
          answer: 0, article: A.job, why: 'My stats shows your own numbers.' },
        { id: 'tax', q: 'A school asks you to take the tax off. You…',
          choices: ['Untick tax', 'Ask them to upload their exemption certificate; June approves it', 'Give a discount instead', 'Refuse'],
          answer: 1, article: A.job, why: 'Taking tax off is June\'s, after the certificate.' },
        { id: 'price', q: 'A customer asks for a custom price on a big order. You…',
          choices: ['Type it in', 'Reply now, give a time, ask June', 'Say no', 'Ignore it'],
          answer: 1, article: A.job, why: 'Custom prices are June\'s; never leave them waiting.' },
        { id: 'date', q: 'When may you promise a date?',
          choices: ['Always', 'After checking stock and the production board, and June for anything tight', 'Never', 'Only on Fridays'],
          answer: 1, article: A.job, why: 'A date is a promise. Check first.' },
        { id: 'handover', q: 'Lead Generation hands you a quote request. What should already be on the lead?',
          choices: ['Nothing', 'Who decides, the date, sizes, artwork and notes', 'A discount', 'A price'],
          answer: 1, article: A.job, why: 'You start from the whole story.' },
        { id: 'after', q: 'Once the deposit is paid, the job goes to…',
          choices: ['Nobody', 'Production and the designer', 'The Account Manager only', 'The customer'],
          answer: 1, article: A.job, why: 'Paid jobs go to production and artwork.' },
      ],
    },
    buffer: 7,
  },

  /* ── 2 ── */
  {
    key: 'cl2', icon: '⚡', title: 'Speed to lead',
    goal: 'Answer every lead inside the time limits, on every channel, with a first reply that moves it forward.',
    lessons: [{
      id: 'cl2-speed', article: A.speed, minutes: 30, tags: 'speed to lead, first reply, chat, missed call, after hours, five details, quote reply',
      goals: ['Reply inside the limit on every channel', 'Write a first reply that moves the lead forward', 'Handle missed calls and after-hours leads'],
      tryIt: [{ label: 'Leads', href: '/admin/leads' }, { label: 'The /quote reply', href: '/admin/playbook?q=quote' }],
      body:
`The first shop to answer usually wins the order. A fast, useful first reply is the single biggest thing a Closer controls.

**The limits**

- Website forms and emails: within **1 hour** during your shift
- Chats: within **15 minutes**
- Missed calls: call back the same hour if you can, or reply by email
- Leads that arrive overnight: first thing in your shift, oldest first

My Day lists what is waiting, oldest first. Start there every shift.

**A first reply that moves it forward**

- Thank them by name and mention what they asked for
- Ask for whatever is missing of the five details, all in one message (the /quote reply does it)
- If you already have all five, say when the quote will arrive: "You'll have it within the hour"
- End with one easy question, so replying is simple

Example: "Hi Maria, thanks for reaching out about shirts for the spring fun run! To get you an exact price, could you tell me roughly how many, the sizes, and whether it's one colour or full colour on the front? And when is the run?"

**When you cannot answer fully**

Reply anyway: "Great question, I'm checking with our production team and will get back to you by 3pm." Then ask June, and reply by 3pm even if the answer is "still checking".

**Log it**

Log every reply on the lead and set a follow-up date. A reply you did not log counts as unanswered on the board and in your numbers.`,
    }],
    practice: [
      { key: 'do:closer-leads', type: 'do', fact: 'leads', need: 10, minutes: 15,
        title: 'Answer 10 leads', hint: 'Real leads you answered and logged. The ones from the Sales course count. This ticks itself at 10.' },
    ],
    quiz: {
      key: 'closer-2', title: 'Module 2 quiz: speed to lead', minutes: 10,
      questions: [
        { id: 'form', q: 'A website form arrives during your shift. The latest your first reply goes is…',
          choices: ['1 hour', '4 hours', 'End of day', 'Tomorrow'], answer: 0, article: A.speed, why: 'Forms within 1 hour.' },
        { id: 'chat', q: 'A chat comes in. You answer within…',
          choices: ['15 minutes', '1 hour', '2 hours', 'A day'], answer: 0, article: A.speed, why: 'Chats within 15 minutes.' },
        { id: 'night', q: 'Three leads came in overnight. Which first?',
          choices: ['The newest', 'The oldest', 'The biggest-looking', 'Any'], answer: 1, article: A.speed, why: 'Oldest first, from My Day.' },
        { id: 'missing', q: 'A lead gave quantity and date but not sizes or colours. Your reply…',
          choices: ['Sends a guessed price', 'Asks for everything missing in one message', 'Asks one question per day', 'Waits for them'], answer: 1, article: A.speed, why: 'All missing details in one message.' },
        { id: 'all', q: 'A lead gave all five details. Your first reply says…',
          choices: ['Nothing yet', 'When the quote will arrive', 'A discount', 'Call us'], answer: 1, article: A.speed, why: 'Tell them when, then deliver.' },
        { id: 'unsure', q: 'They ask something only production can answer. You…',
          choices: ['Wait until you know', 'Reply now with a time, ask June, reply by that time', 'Guess', 'Ignore that part'], answer: 1, article: A.speed, why: 'Reply now, give a time, keep it.' },
        { id: 'end', q: 'A first reply should end with…',
          choices: ['A long price list', 'One easy question', 'Our address', 'Nothing'], answer: 1, article: A.speed, why: 'Make replying simple.' },
        { id: 'log', q: 'You replied by email but did not log it. On the board it shows as…',
          choices: ['Answered', 'Unanswered', 'Won', 'Closed'], answer: 1, article: A.speed, why: 'Logging is what counts.' },
        { id: 'missed', q: 'You missed a call during your shift. Best next step?',
          choices: ['Wait for them to call back', 'Call back the same hour if you can, or reply by email', 'Text a promo', 'Nothing'], answer: 1, article: A.speed, why: 'Answer missed calls quickly.' },
        { id: 'where', q: 'Where do you start every shift?',
          choices: ['My Day', 'Finances', 'The newsletter', 'Resources'], answer: 0, article: A.speed, why: 'My Day lists what is waiting.' },
      ],
    },
    buffer: 7,
  },

  /* ── 3 ── */
  {
    key: 'cl3', icon: '🔍', title: 'Discovery: the questions that win',
    goal: 'Find out what the customer really needs, so the quote is right first time and easy to say yes to.',
    lessons: [{
      id: 'cl3-discovery', article: A.discovery, minutes: 35, tags: 'discovery, questions, budget, event, decision maker, date, listening',
      goals: ['Ask the questions beyond the five details', 'Find the budget and who decides without being pushy', 'Read the order back in one message'],
      tryIt: [{ label: 'Customers: check their history', href: '/admin/customers' }],
      body:
`The five details let you price an order. Discovery tells you which order to price, and what will make them say yes.

**The questions beyond the five details**

- **What is it for?** A run, a reunion, a team, staff. The answer suggests the garment, the method and the upsells
- **Who wears it?** Kids, adults, staff on their feet all day. That decides the garment and the sizes
- **Is the date fixed?** A fixed event date changes everything; a flexible one avoids rush
- **Have you ordered shirts before?** What did they like or dislike last time? Check Customers too: they may have ordered from us
- **What budget did you have in mind?** Ask gently: "So I can suggest the best option, was there a budget per shirt you had in mind?"
- **Who decides?** "Is anyone else choosing with you?" A committee needs a quote they can forward

**Listen more than you talk**

Let them describe it. Write down the words they use ("soft", "vintage", "for the whole family") and use them back in the quote notes. People say yes to a quote that sounds like what they asked for.

**Read it back**

Before you build the quote, read the order back in one message: "So that's about 60 tees for the April 12 run, navy, one-colour logo on the front and sponsors on the back, mostly adult sizes. Did I miss anything?" It catches mistakes before they are on a quote, and the customer feels heard.

**Budget without pressure**

- If they give a budget, build to it: the right garment and method for that price
- If the budget is too low for what they described, say so kindly and offer the closest honest option
- Never pad a quote because the budget is higher than needed`,
    }],
    practice: [],
    quiz: {
      key: 'closer-3', title: 'Module 3 quiz: discovery', minutes: 10,
      questions: [
        { id: 'why', q: 'Why ask what the order is for?',
          choices: ['To make small talk', 'It suggests the garment, method and upsells', 'To fill time', 'It changes the tax'], answer: 1, article: A.discovery, why: 'The purpose points to the right order.' },
        { id: 'who', q: 'Why ask who wears it?',
          choices: ['It decides the garment and sizes', 'For the newsletter', 'It changes the deposit', 'It does not matter'], answer: 0, article: A.discovery, why: 'Kids, adults and workwear need different garments.' },
        { id: 'fixed', q: 'Why ask if the date is fixed?',
          choices: ['A flexible date can avoid rush', 'To add rush always', 'It sets the tax', 'It does not matter'], answer: 0, article: A.discovery, why: 'Flexible dates save the customer money.' },
        { id: 'before', q: 'Where can you check if they ordered from us before?',
          choices: ['Customers', 'Resources', 'Training', 'Team chat'], answer: 0, article: A.discovery, why: 'Customers shows their history.' },
        { id: 'budget', q: 'A gentle way to ask about budget:',
          choices: ['"How much money do you have?"', '"So I can suggest the best option, was there a budget per shirt you had in mind?"', '"Our minimum is $1,000"', 'Do not ask'], answer: 1, article: A.discovery, why: 'Frame it as helping them.' },
        { id: 'committee', q: 'A committee will decide. What helps?',
          choices: ['A quote they can easily forward', 'Calling each member', 'A discount', 'Nothing'], answer: 0, article: A.discovery, why: 'Make it easy to share.' },
        { id: 'words', q: 'The customer said "soft, vintage feel". You…',
          choices: ['Ignore it', 'Use their words in the quote notes', 'Correct them', 'Pick the cheapest tee'], answer: 1, article: A.discovery, why: 'People say yes to what sounds like what they asked for.' },
        { id: 'readback', q: 'Before building the quote, you…',
          choices: ['Read the order back in one message', 'Send a price list', 'Ask for payment', 'Wait'], answer: 0, article: A.discovery, why: 'It catches mistakes and shows you listened.' },
        { id: 'low', q: 'Their budget is too low for what they described. You…',
          choices: ['Quote it anyway and hope', 'Say so kindly and offer the closest honest option', 'Cut quality without saying', 'Refuse'], answer: 1, article: A.discovery, why: 'Honest options win trust.' },
        { id: 'pad', q: 'Their budget is higher than needed. You…',
          choices: ['Pad the quote', 'Quote what fits their needs', 'Add rush', 'Add items without asking'], answer: 1, article: A.discovery, why: 'Never pad a quote.' },
      ],
    },
    buffer: 7,
  },

  /* ── 4 ── */
  {
    key: 'cl4', icon: '🧾', title: 'A quote that closes',
    goal: 'Build a quote that is right, easy to read, and easy to say yes to.',
    lessons: [{
      id: 'cl4-quote', article: A.quote, minutes: 40, tags: 'quote, optional items, run number, draft, size mix, notes, rush, validity, price lock, tax',
      goals: ['Lead with one recommended option and add choices as optional items', 'Use notes the customer reads', 'Know what the form does for you and what you never type'],
      tryIt: [{ label: 'New quote', href: '/admin/quote/new' }],
      body:
`A quote that closes is right, clear, and makes the yes easy.

**One recommendation, then choices**

- Build the order you recommend as the main item: the garment, method and print places that fit what they told you
- Add alternatives as **optional items**: a hoodie version, a back print, a few spares at the next price break. They tick what they want
- Give optional choices of the same kind one **Run number**, so their quantities share a price band
- Too many choices slow a decision. Two or three optional items is plenty

**Let the form price it**

- Enter the size mix, so bigger sizes are priced correctly
- Tick each print place and its method; enter ink colours for screen printing
- Leave the price boxes empty. Prices are June's: if something needs a special price, save it as a draft and leave June a note on the job
- Put in the needed-by date. The form adds rush if the date needs it, and says why
- Tax is added automatically. A tax-exempt customer uploads their certificate on their quote page, and June approves it

**Notes the customer reads**

The notes box appears on their quote. Use it for one or two short lines in their words: "Navy tees for the April 12 fun run, sponsors on the back as discussed." Mention anything they need to send (artwork, sizes) and the next step.

**Drafts and timing**

- Waiting on one detail? **Save as draft**: private, nothing sent
- A quote is good for 14 days. If they come back later, re-check it before they accept
- Send the quote when you said you would. Then tell them it is on its way and what to do: "Tick any extras you'd like and press Accept"

**Check before you send**

Read every orange warning under an item. Read the total the way the customer will. If it looks wrong to you, it will look wrong to them.`,
    }],
    practice: [
      { key: 'do:closer-quotes', type: 'do', fact: 'quotes', need: 5, minutes: 30,
        title: 'Build 5 real quotes', hint: 'Quotes you created or sent, drafts included. The ones from the Sales course count. This ticks itself at 5.' },
    ],
    quiz: {
      key: 'closer-4', title: 'Module 4 quiz: a quote that closes', minutes: 10,
      questions: [
        { id: 'main', q: 'The main item on a quote should be…',
          choices: ['The cheapest thing', 'The order you recommend for what they told you', 'Every option at once', 'A blank line'], answer: 1, article: A.quote, why: 'Lead with your recommendation.' },
        { id: 'opt', q: 'Alternatives go on the quote as…',
          choices: ['Required items', 'Optional items they can tick', 'A second quote', 'Notes only'], answer: 1, article: A.quote, why: 'Optional items make choosing easy.' },
        { id: 'run', q: 'Two optional hoodie colours should share a price band. You give them…',
          choices: ['The same Run number', 'A discount', 'A custom price', 'Separate quotes'], answer: 0, article: A.quote, why: 'A shared Run number pools the quantity.' },
        { id: 'many', q: 'How many optional items is usually plenty?',
          choices: ['Two or three', 'Ten', 'None ever', 'As many as possible'], answer: 0, article: A.quote, why: 'Too many choices slow a decision.' },
        { id: 'price', q: 'An item needs a special price. You…',
          choices: ['Type it in the price box', 'Save as draft and leave June a note on the job', 'Use the discount box', 'Skip the item'], answer: 1, article: A.quote, why: 'Prices are June\'s.' },
        { id: 'rush', q: 'How is rush added?',
          choices: ['You type a percentage', 'The form adds it from the needed-by date', 'June adds it later', 'It never is'], answer: 1, article: A.quote, why: 'Put in the date; the form does the rest.' },
        { id: 'notes', q: 'What belongs in the customer notes?',
          choices: ['Internal comments about the customer', 'One or two short lines in their words, plus the next step', 'Our costs', 'Nothing'], answer: 1, article: A.quote, why: 'They read it on their quote.' },
        { id: 'valid', q: 'A customer wants to accept a 20-day-old quote. You…',
          choices: ['Let them', 'Re-check it first: quotes are good for 14 days', 'Add 10%', 'Delete it'], answer: 1, article: A.quote, why: 'Prices can change after 14 days.' },
        { id: 'warn', q: 'An orange warning appears under an item. You…',
          choices: ['Ignore it', 'Read it and fix the item before sending', 'Send anyway', 'Ask the customer'], answer: 1, article: A.quote, why: 'Warnings catch wrong methods and minimums.' },
        { id: 'sizes', q: 'Why enter the size mix?',
          choices: ['It is optional decoration', 'Bigger sizes are priced correctly', 'It lowers the tax', 'For the newsletter'], answer: 1, article: A.quote, why: '2XL and up cost more.' },
      ],
    },
    buffer: 7,
  },

  /* ── 5 ── */
  {
    key: 'cl5', icon: '⬆️', title: 'Upselling in practice',
    goal: 'Turn the Upsell ideas box into offers customers thank you for, and practise them out loud.',
    lessons: [{
      id: 'cl5-upsell', article: A.upsell, minutes: 30, tags: 'upsell, role play, price break, second print, pack, optional items, follow up',
      goals: ['Say an upsell in money, in one sentence', 'Match the upsell to the customer type', 'Handle a no gracefully'],
      tryIt: [{ label: 'Open a quote and find the Upsell ideas box', href: '/admin/quotes' }],
      body:
`You learned what upsells are in the Sales course. Here you practise saying them so they sound like help, not a sales pitch.

**One sentence, in money**

- Price break: "If you go to 48, every shirt drops to $9.20, so the 6 extra cost about $31 in total. Handy for new players"
- Second place: "Adding the sponsors on the back is $3.50 a shirt. Lots of runs do it to thank their sponsors"
- Pack: "Eight heads in the 24-inch pack comes in under eight singles"

Always use the numbers from the Upsell ideas box or the form. Never round them in your favour.

**Match the customer**

- **Team:** names and numbers, coach hoodies, cutouts for senior night
- **School or PTO:** staff shirts in a second colour, spirit-wear hoodies, a field-day banner
- **Business:** embroidered polos for front-of-house, caps, an opening banner, a reorder plan for new hires
- **Event:** sponsor back print, volunteer shirts in a different colour, a start-line banner

**Where it goes**

As an optional item on the quote, and once in your follow-up if they have not decided. Never after they have paid, unless they ask.

**Handling a no**

"No problem at all!" and move on. Never offer it twice, and never offer a discount to get a yes.

**Role-play**

Practise out loud with June in Team chat or on a call. She will give you an order; you give the one-sentence upsell. Two good role-plays and she signs this module off.`,
    }],
    practice: [
      { key: 'signoff:closer-upsell', type: 'signoff', minutes: 15,
        title: 'Two upsell role-plays with June', hint: 'June gives you an order; you offer the right upsell in one sentence, in money. She signs off after two good ones.' },
    ],
    quiz: {
      key: 'closer-5', title: 'Module 5 quiz: upselling', minutes: 10,
      questions: [
        { id: 'money', q: 'The best way to say an upsell is…',
          choices: ['"You should buy more"', 'One sentence with the money it costs or saves', 'A long paragraph', 'A discount'], answer: 1, article: A.upsell, why: 'One sentence, in money.' },
        { id: 'numbers', q: 'Where do the upsell numbers come from?',
          choices: ['Your memory', 'The Upsell ideas box or the form', 'A competitor', 'A guess'], answer: 1, article: A.upsell, why: 'Use the system\'s numbers.' },
        { id: 'team', q: 'Which upsell fits a youth team?',
          choices: ['Names and numbers on the back', 'An opening banner', 'Embroidered polos for front-of-house', 'Reunion back print'], answer: 0, article: A.upsell, why: 'Teams love names and numbers.' },
        { id: 'biz', q: 'Which fits a business?',
          choices: ['Senior night cutouts', 'Embroidered polos for front-of-house staff', 'Field day banner', 'Spirit-wear hoodies'], answer: 1, article: A.upsell, why: 'Businesses like embroidered workwear.' },
        { id: 'event', q: 'Which fits a charity walk?',
          choices: ['Sponsors on the back and a start-line banner', 'Coach hoodies', 'Staff polos', 'Nothing'], answer: 0, article: A.upsell, why: 'Events thank sponsors.' },
        { id: 'where', q: 'Where does an upsell go first?',
          choices: ['As an optional item on the quote', 'On the invoice after payment', 'In a separate email a week later', 'Nowhere'], answer: 0, article: A.upsell, why: 'Optional items let them tick it.' },
        { id: 'no', q: 'They say no to the upsell. You…',
          choices: ['Offer it again tomorrow', '"No problem at all!" and move on', 'Offer a discount', 'Add it anyway'], answer: 1, article: A.upsell, why: 'Offer once.' },
        { id: 'paid', q: 'They paid yesterday. Should you upsell now?',
          choices: ['Yes, always', 'Only if they ask', 'Yes, with a discount', 'Yes, by adding it'], answer: 1, article: A.upsell, why: 'Never after payment unless they ask.' },
        { id: 'round', q: 'The box says $9.23 each. You tell the customer…',
          choices: ['"About $9"', '$9.23', '"About $8"', '"It\'s cheap"'], answer: 1, article: A.upsell, why: 'Never round in your favour.' },
        { id: 'signoff', q: 'Who signs off this module\'s practice?',
          choices: ['June, after two good role-plays', 'Nobody', 'The customer', 'The designer'], answer: 0, article: A.upsell, why: 'June signs it off.' },
      ],
    },
    buffer: 7,
  },

  /* ── 6 ── */
  {
    key: 'cl6', icon: '🛡️', title: 'Objections and price matches',
    goal: 'Answer the common objections honestly, and know exactly what goes to June.',
    lessons: [{
      id: 'cl6-objection', article: A.objection, minutes: 35, tags: 'objections, too expensive, price match, cheaper elsewhere, think about it, rush, minimum, ghosting',
      goals: ['Answer the five common objections', 'Handle a price match the right way', 'Keep a quiet lead alive without chasing'],
      tryIt: [{ label: 'The /pricematch reply', href: '/admin/playbook?q=price%20match' }],
      body:
`An objection is usually a question in disguise. Answer the question, honestly, and many become a yes.

**"It's too expensive"**

- Ask what they compared it with, or what they hoped to spend
- Offer a cheaper honest option: a different garment, fewer ink colours, DTF instead of screen printing for a small run, one print place instead of two
- Explain what the price includes: the garment, every print place, setup, and the proof before printing

**"Another shop is cheaper"**

- Ask to see their quote. Prices differ because of the garment, colours, print places, setup and turnaround
- Compare like with like, kindly: "Their quote is for a lighter tee and one print place; ours has the heavier tee and the back print"
- Price matches are always June's: say you will check and reply by a set time, then ask June (the /pricematch reply helps)

Discounts you may give on your own: [owner to fill in: which discounts or price matches a Closer may offer without asking, if any]

**"We need to think about it"**

Ask what they are deciding between, answer that, and set a follow-up date. "Of course! Is it the hoodie or the tee you're weighing up? I can send both side by side."

**"We need it sooner"**

Check the production board and ask June. Offer rush only when the press has room. Put the date in the quote and the form adds the rush fee.

**"That's below your minimum"**

Screen printing starts at 50. For fewer, offer DTF: no minimum, full colour.

**When they go quiet**

Follow up twice: about 3 days, then about 10 days, each time with something useful (a mockup idea, their date, a price break). Then stop and set a follow-up for their next season.`,
    }],
    practice: [],
    quiz: {
      key: 'closer-6', title: 'Module 6 quiz: objections', minutes: 10,
      questions: [
        { id: 'expensive', q: '"It\'s too expensive." Your first move?',
          choices: ['Give 10% off', 'Ask what they compared it with or hoped to spend', 'Say sorry and stop', 'Argue'], answer: 1, article: A.objection, why: 'Find the real question first.' },
        { id: 'cheaper', q: 'Which is a cheaper honest option?',
          choices: ['Fewer ink colours or one print place instead of two', 'Lower quality without saying', 'Skipping the proof', 'Removing tax'], answer: 0, article: A.objection, why: 'Change the order, not the honesty.' },
        { id: 'match', q: 'A customer asks you to match another shop\'s price. You…',
          choices: ['Match it', 'Say you will check and reply by a set time, then ask June', 'Refuse', 'Undercut it'], answer: 1, article: A.objection, why: 'Price matches are June\'s.' },
        { id: 'compare', q: 'Their quote is for a lighter tee with one print place. You…',
          choices: ['Say they are lying', 'Compare like with like, kindly', 'Ignore it', 'Copy their price'], answer: 1, article: A.objection, why: 'Explain the difference.' },
        { id: 'think', q: '"We need to think about it." Best reply?',
          choices: ['"OK bye"', 'Ask what they are deciding between, answer it, set a follow-up date', 'Offer a discount', 'Follow up daily'], answer: 1, article: A.objection, why: 'Help them decide.' },
        { id: 'sooner', q: '"We need it sooner." You…',
          choices: ['Promise it', 'Check the production board and June; offer rush only with room', 'Say no', 'Skip the proof'], answer: 1, article: A.objection, why: 'Check before promising.' },
        { id: 'min', q: '30 shirts, they asked for screen printing. You suggest…',
          choices: ['Screen printing anyway', 'DTF: no minimum', 'Embroidery', 'Waiting until 50'], answer: 1, article: A.objection, why: 'Screens start at 50.' },
        { id: 'quiet', q: 'A customer went quiet after the quote. How many follow-ups?',
          choices: ['Two, about 3 and 10 days, then stop', 'Daily', 'None', 'Five'], answer: 0, article: A.objection, why: 'Two, each with something useful.' },
        { id: 'stop', q: 'After two follow-ups with no reply, you…',
          choices: ['Keep going', 'Stop and set a follow-up for their next season', 'Call repeatedly', 'Delete them'], answer: 1, article: A.objection, why: 'Stop, but come back next season.' },
        { id: 'includes', q: 'What does our price include?',
          choices: ['The garment, every print place, setup and the proof', 'Only the garment', 'Only printing', 'Free shipping always'], answer: 0, article: A.objection, why: 'Explain the value.' },
      ],
    },
    buffer: 7,
  },

  /* ── 7 ── */
  {
    key: 'cl7', icon: '✅', title: 'The yes, the deposit and the proof',
    goal: 'Turn an accepted quote into a paid, proofed job without anything slipping.',
    lessons: [{
      id: 'cl7-yes', article: A.yes, minutes: 30, tags: 'accept, deposit, card fee, cash, zelle, awaiting deposit, reminder, proof, artwork, designer',
      goals: ['Explain the deposit and how to pay', 'Get an accepted quote to a paid deposit', 'Hand artwork to the designer and get proof approval in writing'],
      tryIt: [{ label: 'Quotes: accepted, awaiting deposit', href: '/admin/quotes' }],
      body:
`A yes is not a sale until the deposit is paid. Then the proof has to be approved before anything prints.

**How the deposit works**

- Accepting the quote needs no payment. The order starts when the deposit is paid
- The deposit is **50%**, or the **full amount under $100**
- Paying by card adds a **4% card fee**
- Customers pay the shop only: the payment link on their quote, or cash or Zelle that you record. Recorded cash or Zelle shows "not confirmed" until June confirms it arrived

**From yes to paid**

- An accepted quote with no deposit shows **Awaiting deposit** on the boards, and the system sends the customer a reminder after about 12 hours
- Your job is the human touch: one friendly message with the quote link, and log it
- If they have a question about paying, answer it the same hour
- Never offer a discount to get paid; ask June

**Artwork and the proof**

- Open the job and press **Send to the designer**, with the design, colours, placement, sizes, method and date
- The designer sends a proof. Approval must be **in writing** (email, text or chat) and logged on the job. "Looks great" on a call is not approval until they confirm it in writing
- Chase late artwork and approvals kindly and specifically: what you need, and the date it affects

**Tell them what happens next**

After the deposit: "Thank you! Next you'll get a proof to approve. Once you approve it, we start printing." Customers who know the next step do not worry, and they approve faster.`,
    }],
    practice: [],
    quiz: {
      key: 'closer-7', title: 'Module 7 quiz: the yes, the deposit and the proof', minutes: 10,
      questions: [
        { id: 'accept', q: 'Does accepting a quote need a payment?',
          choices: ['Yes, the full amount', 'No; the order starts when the deposit is paid', 'Yes, 10%', 'Only by card'], answer: 1, article: A.yes, why: 'Accepting needs no payment.' },
        { id: 'dep', q: 'A $480 order. The deposit is…',
          choices: ['$480', '$240', '$48', '$0'], answer: 1, article: A.yes, why: '50%.' },
        { id: 'small', q: 'An $85 order. Due to start…',
          choices: ['$42.50', '$85', '$0', '$8.50'], answer: 1, article: A.yes, why: 'Under $100 is paid in full.' },
        { id: 'card', q: 'Paying by card adds…',
          choices: ['Nothing', 'A 4% card fee', 'Tax again', 'A rush fee'], answer: 1, article: A.yes, why: 'Card payments carry 4%.' },
        { id: 'cash', q: 'You record $200 cash. It shows…',
          choices: ['Paid', 'Not confirmed until June confirms it', 'Refunded', 'Nothing'], answer: 1, article: A.yes, why: 'June confirms cash and Zelle.' },
        { id: 'awaiting', q: 'An accepted quote with no deposit shows…',
          choices: ['Awaiting deposit', 'Paid', 'Cancelled', 'Draft'], answer: 0, article: A.yes, why: 'The tag shows on the boards.' },
        { id: 'human', q: 'The system sent a deposit reminder. Your part?',
          choices: ['Nothing', 'One friendly message with the quote link, logged', 'Daily texts', 'A discount'], answer: 1, article: A.yes, why: 'The human touch, once.' },
        { id: 'proof', q: 'The customer says "looks great" about the proof on a call. You…',
          choices: ['Print it', 'Ask them to confirm in writing, then log it', 'Mark it approved', 'Wait a day'], answer: 1, article: A.yes, why: 'Approval must be in writing.' },
        { id: 'designer', q: 'What goes to the designer with "Send to the designer"?',
          choices: ['Just the name', 'The design, colours, placement, sizes, method and date', 'The price', 'Nothing'], answer: 1, article: A.yes, why: 'Everything the designer needs.' },
        { id: 'next', q: 'After the deposit, you tell the customer…',
          choices: ['Nothing', 'That a proof comes next, and printing starts once they approve it', 'The delivery date guaranteed', 'To pay the balance now'], answer: 1, article: A.yes, why: 'Customers who know the next step approve faster.' },
      ],
    },
    buffer: 7,
  },

  /* ── 8 ── */
  {
    key: 'cl8', icon: '📈', title: 'Your pipeline and your day',
    goal: 'Run your day so nothing waits, and use your numbers to get better.',
    lessons: [{
      id: 'cl8-pipeline', article: A.pipeline, minutes: 25, tags: 'pipeline, daily routine, my day, quotes board, follow ups, end of day, my stats, conversion',
      goals: ['Plan a Closer\'s day in the right order', 'Review your pipeline daily', 'Read your own numbers and improve one thing a week'],
      tryIt: [{ label: 'My Day', href: '/admin/my-day' }, { label: 'My stats', href: '/admin/my-stats' }],
      body:
`A Closer's day is mostly people waiting on you. Get to them first, then move every open quote one step forward.

**A sample day**

- **My Day:** new leads and replies, oldest first, inside the time limits
- **Quotes waiting on you:** anything you promised today
- **Follow-ups due:** each with something useful, logged, with the next date set
- **Accepted, awaiting deposit:** one friendly nudge each, logged
- **Artwork and proofs:** anything waiting on the customer, chased kindly
- **My Day again** before you finish, so nothing waits overnight
- **End-of-day note to June:** leads answered, quotes sent, accepted, deposits in, what is stuck, and your first task tomorrow

**Your pipeline, every day**

Open Quotes and read it as a list of promises: every sent quote has a next step and a date. A quote with no follow-up date is a quote you will forget.

**Your numbers**

My stats shows your reply time, quotes sent and accepted, conversion and average order. Your targets are in lesson 1 of this course.

- Slow replies: start each shift on My Day, and keep it open
- Low conversion: look at discovery and the quote itself. Did it match what they asked for?
- Low average order: are you offering the right optional items?

**Getting better each week**

Pick one number. Change one habit. Look again next week. Share what worked with June in your end-of-day note.`,
    }],
    practice: [],
    quiz: {
      key: 'closer-8', title: 'Module 8 quiz: your pipeline and your day', minutes: 10,
      questions: [
        { id: 'first', q: 'What comes first each day?',
          choices: ['My Day: new leads and replies, oldest first', 'Finances', 'Social posts', 'The newsletter'], answer: 0, article: A.pipeline, why: 'People waiting first.' },
        { id: 'quote', q: 'Every sent quote should have…',
          choices: ['A discount', 'A next step and a follow-up date', 'A rush fee', 'Nothing'], answer: 1, article: A.pipeline, why: 'A quote with no date gets forgotten.' },
        { id: 'deposit', q: 'Accepted, awaiting deposit. Daily action?',
          choices: ['One friendly nudge each, logged', 'Cancel it', 'Daily calls', 'Nothing'], answer: 0, article: A.pipeline, why: 'Human touch, once.' },
        { id: 'end', q: 'Before you finish, you…',
          choices: ['Check My Day again so nothing waits overnight', 'Log off', 'Delete old leads', 'Send the newsletter'], answer: 0, article: A.pipeline, why: 'No reply waits overnight.' },
        { id: 'eod', q: 'The end-of-day note includes…',
          choices: ['Leads answered, quotes sent, accepted, deposits, what is stuck, tomorrow\'s first task', 'Only hours', 'Nothing', 'A list of every email'], answer: 0, article: A.pipeline, why: 'June starts with a clear list.' },
        { id: 'slow', q: 'Your reply time is slow. Best fix?',
          choices: ['Start each shift on My Day and keep it open', 'Reply less', 'Use a discount', 'Ignore chats'], answer: 0, article: A.pipeline, why: 'Be where the leads are.' },
        { id: 'conv', q: 'Your conversion is low. Look at…',
          choices: ['Discovery and whether the quote matched what they asked', 'The weather', 'Tax', 'Nothing'], answer: 0, article: A.pipeline, why: 'Wrong quotes do not close.' },
        { id: 'aov', q: 'Your average order is low. Ask yourself…',
          choices: ['Am I offering the right optional items?', 'Should I raise prices?', 'Should I skip proofs?', 'Nothing'], answer: 0, article: A.pipeline, why: 'Honest upsells lift it.' },
        { id: 'week', q: 'How do you improve each week?',
          choices: ['Pick one number, change one habit, look again', 'Change everything', 'Do nothing', 'Ask customers for 5 stars'], answer: 0, article: A.pipeline, why: 'One change at a time.' },
        { id: 'where', q: 'Where are your own numbers?',
          choices: ['My stats', 'Resources', 'Training only', 'Nowhere'], answer: 0, article: A.pipeline, why: 'My stats shows them.' },
      ],
    },
    buffer: 7,
  },
];

const FINAL = {
  floating: 15,
  quiz: {
    key: 'closer-final', title: 'Final exam: Sales Closer', minutes: 25,
    questions: [
      { id: 'f1', q: 'A form arrives at 10:05 during your shift. Your first reply goes by…', choices: ['11:05', '5pm', 'Tomorrow', 'When the quote is ready'], answer: 0, article: A.speed, why: 'Within 1 hour.' },
      { id: 'f2', q: 'A chat pings while you build a quote. You…', choices: ['Finish the quote first, however long', 'Answer the chat within 15 minutes', 'Ignore it', 'Close the chat'], answer: 1, article: A.speed, why: 'Chats within 15 minutes.' },
      { id: 'f3', q: '"How much for shirts?" and nothing else. You…', choices: ['Send the cheapest price', 'Thank them and ask the missing details in one message', 'Wait for more', 'Send a catalogue'], answer: 1, article: A.speed, why: 'One message with every question.' },
      { id: 'f4', q: 'You cannot answer a question yet. You…', choices: ['Stay silent', 'Reply now with a time, ask June, keep the time', 'Guess', 'Tell them to call June'], answer: 1, article: A.speed, why: 'Never leave them waiting.' },
      { id: 'f5', q: 'Which question finds the budget gently?', choices: ['"What can you afford?"', '"So I can suggest the best option, was there a budget per shirt in mind?"', '"Minimum is $500"', 'None'], answer: 1, article: A.discovery, why: 'Frame it as help.' },
      { id: 'f6', q: 'A committee decides. You make…', choices: ['A quote that is easy to forward', 'Calls to each member', 'Five quotes', 'A discount'], answer: 0, article: A.discovery, why: 'Make sharing easy.' },
      { id: 'f7', q: 'Before building, you read back…', choices: ['The order, in one message', 'The price list', 'The tax rules', 'Nothing'], answer: 0, article: A.discovery, why: 'Catch mistakes early.' },
      { id: 'f8', q: 'Their date is flexible. That can…', choices: ['Avoid a rush fee', 'Add a rush fee', 'Change the tax', 'Nothing'], answer: 0, article: A.discovery, why: 'Flexible dates save money.' },
      { id: 'f9', q: 'The main item on a quote is…', choices: ['What you recommend', 'The cheapest', 'Every option', 'Blank'], answer: 0, article: A.quote, why: 'Lead with your recommendation.' },
      { id: 'f10', q: 'Alternatives go on as…', choices: ['Optional items', 'Required items', 'A second quote', 'Nothing'], answer: 0, article: A.quote, why: 'They tick what they want.' },
      { id: 'f11', q: 'Optional hoodie colours share a price band through…', choices: ['A Run number', 'A discount', 'Typed prices', 'Notes'], answer: 0, article: A.quote, why: 'Run numbers pool the quantity.' },
      { id: 'f12', q: 'A line needs a special price. You…', choices: ['Type it', 'Save as draft and leave June a note', 'Use the discount box', 'Delete it'], answer: 1, article: A.quote, why: 'Prices are June\'s.' },
      { id: 'f13', q: 'The order is needed in 2 business days. You…', choices: ['Type 50%', 'Put in the date; the form adds rush; check the press with June', 'Ignore it', 'Promise it'], answer: 1, article: A.quote, why: 'The date drives rush; check before promising.' },
      { id: 'f14', q: 'An orange warning says screen printing is under 50. You…', choices: ['Send anyway', 'Switch to DTF or explain the minimum', 'Hide it', 'Add a discount'], answer: 1, article: A.quote, why: 'Read every warning.' },
      { id: 'f15', q: 'A 17-day-old quote is accepted. You…', choices: ['Re-check it first', 'Accept as is', 'Add 20%', 'Cancel'], answer: 0, article: A.quote, why: 'Good for 14 days.' },
      { id: 'f16', q: 'The best upsell sentence…', choices: ['"Buy more!"', '"At 48, every shirt drops to $9.20, so 6 extra cost about $31"', '"Upgrade?"', 'A list'], answer: 1, article: A.upsell, why: 'One sentence, in money.' },
      { id: 'f17', q: 'They say no to the upsell. Next?', choices: ['Ask again tomorrow', 'Move on', 'Discount it', 'Add it'], answer: 1, article: A.upsell, why: 'Offer once.' },
      { id: 'f18', q: 'Which upsell suits a new restaurant?', choices: ['Embroidered polos and an opening banner', 'Senior night cutouts', 'Field day banner', 'Reunion back print'], answer: 0, article: A.upsell, why: 'Businesses: workwear and signs.' },
      { id: 'f19', q: '"It\'s too expensive." First?', choices: ['Discount', 'Ask what they compared it with', 'Hang up', 'Argue'], answer: 1, article: A.objection, why: 'Find the real question.' },
      { id: 'f20', q: '"Shop X is $2 cheaper a shirt." You…', choices: ['Match it', 'Ask to see their quote, compare like with like, ask June about any match', 'Refuse', 'Undercut'], answer: 1, article: A.objection, why: 'Matches are June\'s.' },
      { id: 'f21', q: '"We need to think about it." You…', choices: ['Ask what they are deciding between and set a follow-up date', 'Follow up daily', 'Give up', 'Discount'], answer: 0, article: A.objection, why: 'Help them decide.' },
      { id: 'f22', q: 'A quiet customer gets how many follow-ups?', choices: ['Two', 'Ten', 'None', 'Daily'], answer: 0, article: A.objection, why: 'Two, then stop.' },
      { id: 'f23', q: '25 shirts, full-colour photo. Best method?', choices: ['DTF', 'Screen printing', 'Embroidery', 'Vinyl'], answer: 0, article: A.objection, why: 'Under 50 and full colour: DTF.' },
      { id: 'f24', q: 'Does accepting need payment?', choices: ['No', 'Yes, full', 'Yes, 10%', 'Card only'], answer: 0, article: A.yes, why: 'The deposit starts the order.' },
      { id: 'f25', q: 'A $1,000 order. Deposit?', choices: ['$500', '$1,000', '$100', '$250'], answer: 0, article: A.yes, why: '50%.' },
      { id: 'f26', q: 'A $60 order. Due to start?', choices: ['$60', '$30', '$0', '$6'], answer: 0, article: A.yes, why: 'Under $100 in full.' },
      { id: 'f27', q: 'A $500 deposit paid by card costs the customer…', choices: ['$500', '$520 (4% card fee)', '$550', '$480'], answer: 1, article: A.yes, why: 'Card fee 4%.' },
      { id: 'f28', q: 'Zelle you recorded shows…', choices: ['Paid', 'Not confirmed until June confirms', 'Refunded', 'Cancelled'], answer: 1, article: A.yes, why: 'June confirms.' },
      { id: 'f29', q: 'A customer approves the proof by phone. You…', choices: ['Print', 'Ask for it in writing and log it', 'Mark approved', 'Wait'], answer: 1, article: A.yes, why: 'In writing.' },
      { id: 'f30', q: 'Awaiting deposit for a day. You…', choices: ['Cancel', 'One friendly message with the link, logged', 'Discount', 'Call hourly'], answer: 1, article: A.yes, why: 'The human touch.' },
      { id: 'f31', q: 'A customer asks to pay you personally on Cash App. You…', choices: ['Accept', 'Explain they pay the shop only: the quote link, or cash or Zelle you record', 'Ask June later', 'Ignore'], answer: 1, article: A.yes, why: 'The shop only.' },
      { id: 'f32', q: 'A school wants no tax. You…', choices: ['Untick tax', 'Ask them to upload their certificate on the quote page for June to approve', 'Discount the tax amount', 'Refuse'], answer: 1, article: A.job, why: 'June approves exemptions.' },
      { id: 'f33', q: 'Who decides a refund?', choices: ['June', 'You', 'The designer', 'The customer'], answer: 0, article: A.job, why: 'Refunds are June\'s.' },
      { id: 'f34', q: 'Your conversion is 15% and the shop\'s is 30%. Look first at…', choices: ['Discovery and quote fit', 'The weather', 'Tax', 'The logo'], answer: 0, article: A.pipeline, why: 'Wrong quotes do not close.' },
      { id: 'f35', q: 'A sent quote has no follow-up date. Risk?', choices: ['None', 'You will forget it', 'It expires instantly', 'It raises the price'], answer: 1, article: A.pipeline, why: 'Every quote needs a date.' },
      { id: 'f36', q: 'Which goes in your end-of-day note?', choices: ['Leads, quotes, accepted, deposits, what is stuck, tomorrow\'s first task', 'Only hours', 'Nothing', 'Screenshots'], answer: 0, article: A.pipeline, why: 'A clear list for June.' },
      { id: 'f37', q: 'A Lead Generation hand-off arrives with the five details. Your first move?', choices: ['Ask them all again', 'Tell the customer when the quote will arrive, and build it', 'Wait a day', 'Send a discount'], answer: 1, article: A.speed, why: 'Use what is on the lead.' },
      { id: 'f38', q: 'A customer wants their quote by 3pm and it is 2:50 and not ready. You…', choices: ['Say nothing', 'Message before 3 with an update and a new time', 'Send a guess', 'Wait'], answer: 1, article: A.speed, why: 'Keep every time you give.' },
      { id: 'f39', q: 'Discovery words like "soft, vintage" go…', choices: ['Nowhere', 'In the quote notes, in their words', 'In the price', 'In an internal note only'], answer: 1, article: A.discovery, why: 'Use their words.' },
      { id: 'f40', q: 'When do you upsell after payment?', choices: ['Always', 'Only if they ask', 'With a discount', 'By adding items'], answer: 1, article: A.upsell, why: 'Not after payment unless they ask.' },
    ],
  },
  signoffs: [
    { key: 'signoff:closer-ready', type: 'signoff', minutes: 0,
      title: 'Ready to close on their own', hint: 'June signs this off after seeing your quotes, follow-ups and deposits for a week.' },
  ],
};

const W = (f) => `/assets/images/work/${f}.jpg`;
const LESSON_EXTRAS = {
  'cl1-job': { images: [{ src: W('hero-banner'), alt: 'Finished custom shirts' }] },
  'cl2-speed': { images: [{ src: W('design-studio-live'), alt: 'The design studio at work' }] },
  'cl3-discovery': { images: [{ src: W('family-reunion-bulk-order'), alt: 'A family reunion order' }] },
  'cl4-quote': { images: [{ src: W('full-color-team-logo-print'), alt: 'A full-colour team logo print' }] },
  'cl5-upsell': { images: [{ src: W('logo-tee-and-cap-set'), alt: 'A tee and cap set: an easy add-on' }] },
  'cl6-objection': { images: [{ src: W('screen-printing-press'), alt: 'Screen printing on the press' }] },
  'cl7-yes': { images: [{ src: W('screen-printing-silkscreen'), alt: 'A screen ready once the proof is approved' }] },
  'cl8-pipeline': { images: [{ src: W('company-zip-hoodies'), alt: 'Company hoodies, a closed order' }] },
};
const PAGES = require('./sales-closer-pages');
for (const l of MODULES.flatMap((m) => m.lessons)) {
  Object.assign(l, LESSON_EXTRAS[l.id] || {});
  l.pages = PAGES[l.id] || [{ from: null, checks: [] }];
  l.checks = l.pages.flatMap((pg) => pg.checks);
}

module.exports = { key: 'sales-closer', title: 'Sales Closer', track: 'sales', articles: A, glossary: GLOSSARY, modules: MODULES, final: FINAL };
