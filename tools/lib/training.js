'use strict';

/* Training: the path a new helper walks before working on their own.

   Three kinds of step, and who can tick each:

     read     a playbook article. The helper ticks "I've read it".
     do       a first piece of real work (a lead answered, a quote built). It
              ticks ITSELF from what is in the database, computed on every
              view the way commission is, so it can never say done when the
              work was not.
     signoff  a skill the owner has seen. Only the owner can tick it.
     quiz     a short multiple-choice quiz. The server marks it, and the step
              is done once a passing attempt is stored; nobody ticks it. A
              helper may retake it, so their result never shows the answers:
              only which questions were wrong, and the article to re-read.

   The last sign-off, "ready", ends training: page tips stop, and the Team page
   suggests moving the helper up from Training. Moving them stays the owner's
   decision on /admin/staff.

   Two paths, by the helper's job (staff.training_track): `sales` and
   `design`. A step lists the tracks it belongs to (sales only when it says
   nothing), and can carry per-track wording, e.g. `design: { title, hint }`.
   Keys stay unique across the whole list, so a tick means one thing.

   A step can name a `needs` feature that ships later (the end-of-day note,
   proofs). It is hidden until that feature is listed in FEATURES, so nobody
   is asked to do something the workspace cannot do yet. */

/* Features this deploy has. A later PR adds its name here, and the steps
   that wait for it appear. */
const FEATURES = new Set(['proofs']);

const TRACKS = {
  sales:  { label: 'Sales', note: 'Leads, quotes, follow-ups and finding new customers.' },
  design: { label: 'Design', note: 'Print-ready artwork, proofs, social posts in COS, and blog updates.' },
};
const DEFAULT_TRACK = 'sales';
const BOTH = ['sales', 'design'];

/** A track name from anywhere (a form, a row), or the default. */
function trackOf(t) {
  return Object.prototype.hasOwnProperty.call(TRACKS, t) ? t : DEFAULT_TRACK;
}

const STEPS = [
  { key: 'read:never', type: 'read', tracks: BOTH, article: 'What never to promise',
    title: 'Read: what never to promise' },
  { key: 'read:lead', type: 'read', article: 'New lead: first reply to quote',
    title: 'Read: how to answer a new lead' },
  { key: 'do:lead', type: 'do', fact: 'leads',
    title: 'Answer your first lead', hint: 'Open a lead from My Day and log the call, email, text or chat you sent.' },
  { key: 'read:options', type: 'read', article: 'Quote with options the customer picks',
    title: 'Read: quotes with options' },
  { key: 'read:firstquote', type: 'read', article: 'Practice quote: a basic screen print order',
    title: 'Practice: build a basic screen print quote', hint: 'Follow the tutorial step by step and save it as a draft. Nothing reaches a customer.' },
  { key: 'do:quote', type: 'do', fact: 'quotes',
    title: 'Build your first quote', hint: 'Use the Quote button on a lead so it links back. The owner checks it before it goes out.' },
  { key: 'do:message', type: 'do', tracks: BOTH, fact: 'messages',
    title: 'Write your first customer message', hint: 'From a job page. While you are in training it waits for the owner.' },
  { key: 'read:artflow', type: 'read', tracks: BOTH, article: 'Artwork pipeline: sales to designer to owner',
    title: 'Read: how artwork moves from sales to the designer to the owner' },
  { key: 'read:proof', type: 'read', tracks: BOTH, article: 'Proof approval',
    title: 'Read: proof approval' },
  { key: 'read:deposits', type: 'read', article: 'Chasing deposits and balances',
    title: 'Read: chasing deposits and balances' },
  { key: 'read:tax', type: 'read', article: 'Tax certificate pre-screen',
    title: 'Read: tax certificate pre-screen' },
  { key: 'read:social', type: 'read', article: 'Social inbox check (twice a day)',
    title: 'Read: the social inbox check' },
  { key: 'read:ai', type: 'read', tracks: BOTH, article: 'AI rules',
    title: 'Read: the AI rules (ChatGPT, image tools)' },
  { key: 'read:prospect', type: 'read', article: 'Finding new leads in quiet time',
    title: 'Read: finding new leads in quiet time' },
  { key: 'quiz:basics', type: 'quiz', quiz: 'basics',
    title: 'Pass the quick quiz', hint: '10 questions, about 5 minutes. Get 8 right. Retake it as often as you need.' },
  /* The design path: the artwork rules for each method, proofs, COS and the blog. */
  { key: 'read:screenart', type: 'read', tracks: ['design'], article: 'Screen printing: artwork do\'s and don\'ts',
    title: 'Read: screen printing artwork' },
  { key: 'read:dtfart', type: 'read', tracks: ['design'], article: 'DTF: artwork do\'s and don\'ts',
    title: 'Read: DTF artwork' },
  { key: 'read:embart', type: 'read', tracks: ['design'], article: 'Embroidery: artwork do\'s and don\'ts',
    title: 'Read: embroidery artwork' },
  { key: 'read:patches', type: 'read', tracks: ['design'], article: 'Patches, vinyl and puff print: what to check',
    title: 'Read: patches, vinyl and puff print' },
  { key: 'read:proofhow', type: 'read', tracks: ['design'], article: 'Making and sending a proof',
    title: 'Read: making and sending a proof' },
  { key: 'do:proof', type: 'do', tracks: ['design'], fact: 'proofs', needs: 'proofs',
    title: 'Upload your first proof', hint: 'From a job page. The owner checks it before the customer sees it.' },
  { key: 'read:cos', type: 'read', tracks: ['design'], article: 'Social posts in COS Creator Studio',
    title: 'Read: social posts in COS Creator Studio' },
  { key: 'read:blog', type: 'read', tracks: ['design'], article: 'Blog updates: copy and images',
    title: 'Read: blog updates (copy and images)' },
  { key: 'quiz:design', type: 'quiz', tracks: ['design'], quiz: 'design',
    title: 'Pass the artwork quiz', hint: '10 questions, about 5 minutes. Get 8 right. Retake it as often as you need.' },
  { key: 'signoff:art', type: 'signoff', tracks: ['design'],
    title: 'Prepares print-ready art correctly', hint: 'The owner checks a few of your files: vectors, colour count, size, transparent background.' },
  { key: 'do:eod', type: 'do', fact: 'eod', needs: 'eod',
    title: 'Send your first end-of-day note', hint: 'Use "Wrap up the day" on My Day.' },
  { key: 'signoff:screenprint', type: 'signoff',
    title: 'Built the practice quote correctly', hint: 'The owner opens your practice draft and checks it against the tutorial.' },
  { key: 'signoff:handoff', type: 'signoff', tracks: BOTH,
    title: 'Knows when to hand a customer to the owner', hint: 'Discounts, refunds, logos the customer does not own, angry customers.' },
  { key: 'signoff:ready', type: 'signoff', tracks: BOTH,
    design: { title: 'Ready to send proofs on their own', hint: 'The last step. Proofs and messages go straight to customers from here. The owner decides when to move you up from Training.' },
    title: 'Ready to send small quotes on their own', hint: 'The last step. Commission starts here, on quotes you create from now on. The owner decides when to move you up from Training.' },
];

const READY_KEY = 'signoff:ready';

function visibleSteps(features = FEATURES, track = DEFAULT_TRACK) {
  const t = trackOf(track);
  return STEPS.filter((s) => (!s.needs || features.has(s.needs)) && (s.tracks || [DEFAULT_TRACK]).includes(t))
    .map((s) => (s[t] ? { ...s, ...s[t] } : s));
}

function stepByKey(key, features = FEATURES, track = DEFAULT_TRACK) {
  return visibleSteps(features, track).find((s) => s.key === key) || null;
}

/** May this person tick this step? A helper ticks their own reading; only
 *  the owner signs off; "do" steps are never ticked by hand. */
function mayTick(key, byOwner, features = FEATURES, track = DEFAULT_TRACK) {
  const s = stepByKey(key, features, track);
  if (!s) return false;
  if (s.type === 'read') return true;
  if (s.type === 'signoff') return !!byOwner;
  return false;
}

/**
 * Where a helper stands.
 * @param ticks  Map step_key -> { done_at, signed_by } from staff_training
 * @param facts  counts of real work: { leads, quotes, messages, eod, proofs }
 */
function progress(ticks, facts = {}, features = FEATURES, track = DEFAULT_TRACK) {
  const steps = visibleSteps(features, track).map((s) => {
    const t = ticks.get(s.key);
    const done = s.type === 'do' ? Number(facts[s.fact] || 0) > 0
      : s.type === 'quiz' ? Number((facts.quizzes || {})[s.quiz] || 0) > 0 : !!t;
    return { ...s, done, doneAt: t ? t.done_at : null, signedBy: t ? t.signed_by : null };
  });
  const done = steps.filter((s) => s.done).length;
  return { steps, done, total: steps.length, next: steps.filter((s) => !s.done).slice(0, 3),
           complete: done === steps.length };
}

/* A short note at the top of each page while a helper is in training: what
   the page is for, and the one mistake to avoid. Keyed by the menu key the
   page passes to adminPage(). Drafted for the owner to edit. */
const PAGE_TIPS = {
  myday: 'Start here every shift. Work top to bottom: leads waiting, then follow-ups, then tasks and jobs. The oldest lead is always first.',
  earnings: 'Your commission on sales credited to you. A sale becomes payable 14 days after it is paid in full, if there is no open dispute.',
  leads: 'Everyone who asked about an order. Log every call, email, text or chat on the lead; that is what counts as answered. Set a follow-up date before you leave a lead.',
  quotes: 'The money board: quotes out, accepted, waiting on a deposit. Build a new quote from a lead with its Quote button so the two stay linked.',
  production: 'The work board: artwork, proof, blanks, printing, ready. Move a job to its next step only when that step is really done.',
  orders: 'Online orders from the design studio. Check the artwork and the tax certificate badge before anything is produced.',
  shipping: 'Labels and tracking for orders going out. Double-check the address before buying a label; a label cannot be moved.',
  delivery: 'Local deliveries by day and window. Mark each one Out when it leaves and Delivered when it is handed over; moving one tells the customer.',
  customers: 'Everyone who has ordered or asked. Search by name, email or phone to see their whole history before you reply.',
  reviews: 'Customer reviews waiting to go on the site. Approve real ones; anything rude or about an order problem goes to the owner first.',
  certificates: 'Tax-exempt certificates. Check the name, the number and the date, leave a note, and let the owner approve or refuse.',
  discounts: 'Discount codes. Never offer one to win or keep a sale without the owner.',
  chat: 'Your private conversation with the owner. Ask here whenever you are unsure; it is faster than guessing.',
  playbook: 'Ready-made replies and how we do things. Type a question in plain words, or a /shortcut. Copy a reply and adjust it to the customer.',
  training: 'Your training path. Reading steps you tick yourself, work steps tick when you do the work, and the owner signs off the rest.',
};

/* The quick quiz: judgment and selling, not sums (the quote builder does
   the maths). Each answer matches a playbook article, so a wrong answer is
   explained by the rule the helper will meet at work. `answer` is the index
   of the right choice; it never reaches the page until the quiz is marked. */
const QUIZZES = {
  basics: {
    title: 'Quick quiz: customers and sales',
    pass: 8,
    questions: [
      { id: 'reply', q: 'A customer fills in the quote form at 10am, during your shift. When should they hear from you?',
        choices: ['By the end of your shift', 'Within 1 hour', 'Once the quote is ready', 'The next morning'],
        answer: 1, article: 'New lead: first reply to quote', why: 'Forms get a reply within 1 hour, chats within 15 minutes. The first shop to answer usually gets the order.' },
      { id: 'vague', q: 'A message says only: "how much for shirts?" What is the best reply?',
        choices: ['Send the price of our cheapest shirt', 'Ask them to call the owner',
          'Thank them, and ask how many, which garment, where the design goes, their artwork and the date they need them',
          'Send the whole catalogue'],
        answer: 2, article: 'What do you need for a quote?', why: 'You cannot quote without the details. The /quote reply in the playbook asks for all five in one friendly message.' },
      { id: 'minimum', q: 'A coach wants 30 shirts with a 2-colour logo. What do you suggest?',
        choices: ['Screen printing, it is always cheapest', 'Tell them 30 is too few for us',
          'DTF (or embroidery), because screen printing starts at 50 pieces', 'Ask them to order 50 so we can screen print'],
        answer: 2, article: 'Is there a minimum order?', why: 'Screen printing starts at 50 pieces. DTF has no minimum and suits small runs. Offer the best-value option, never a refusal.' },
      { id: 'pricematch', q: 'A customer says another shop is 15% cheaper and asks you to match it. What do you do?',
        choices: ['Match it, to win the order', 'Offer 10% off as a middle ground',
          'Say we never match prices', 'Ask to see the other quote, explain what ours includes, and check with the owner before promising anything'],
        answer: 3, article: 'What never to promise', why: 'Discounts and price matches are the owner\'s call. Comparing what is included often wins the sale without any discount.' },
      { id: 'logo', q: 'A customer asks for 60 shirts with an NFL team logo for a watch party. What do you do?',
        choices: ['Quote it like any other order', 'Quote it but use DTF instead', 'Bring it to the owner: we do not print logos the customer does not own',
          'Ignore the message'],
        answer: 2, article: 'What never to promise', why: 'Logos the customer does not own (teams, brands, characters) always go to the owner. Suggest an original design for the party instead.' },
      { id: 'followup', q: 'You sent a quote 3 days ago and heard nothing. What is the best next step?',
        choices: ['Wait. They will reply when ready', 'Send a friendly note asking if they have questions, mention the quote is good for 14 days, and set the next follow-up date',
          'Offer a discount to get a reply', 'Call them every day until they answer'],
        answer: 1, article: 'How long is my quote good for?', why: 'Most sales are won on the follow-up. One friendly nudge with a reason to act now, then a new follow-up date on the lead.' },
      { id: 'rush', q: 'A customer needs 40 shirts by Friday, 3 business days away. What do you say?',
        choices: ['"No problem, they\'ll be ready Friday"', '"Sorry, we can\'t do that"',
          '"We offer rush for a fee. Let me check what\'s on the press and confirm today"', '"Order now and we\'ll try our best"'],
        answer: 2, article: 'How long will my order take?', why: 'Never promise a date without checking stock and the production board. Rush is a paid option, so offer it and confirm.' },
      { id: 'upset', q: 'A customer writes: "One shirt is printed crooked and our event is tomorrow!" What do you do first?',
        choices: ['Promise a full refund', 'Apologise, ask for a photo, and bring it to the owner right away',
          'Explain that small differences are normal', 'Wait for the owner to see it'],
        answer: 1, article: 'What never to promise', why: 'Apologise and act fast, but refunds and reprints are the owner\'s decision. A photo lets the owner fix it quickly.' },
      { id: 'quiet', q: 'You have a quiet hour with no leads waiting. What is the best use of it?',
        choices: ['Find new customers: schools, teams, churches and businesses with events coming up, and add each one on Leads',
          'Log off early', 'Post the same message in as many Facebook groups as you can', 'Re-read old emails'],
        answer: 0, article: 'Finding new leads in quiet time', why: 'Quiet time is for finding new leads. Look for groups that need shirts soon and add each one on Leads, so nothing is lost and the sale is credited to you.' },
      { id: 'prospect', q: 'You find a youth soccer league with the coach\'s email on its website. What do you do?',
        choices: ['Add them to our email newsletter', 'Text the coach\'s phone number',
          'Add them on Leads, then send one short personal email about their season with an easy next step',
          'Send our full price list'],
        answer: 2, article: 'Finding new leads in quiet time', why: 'One short, personal message mentioning their team, with an easy yes ("Want a couple of design ideas and a price?"). Never add strangers to the newsletter, and never cold-text.' },
    ],
  },
  design: {
    title: 'Artwork quiz: print-ready files and proofs',
    pass: 8,
    questions: [
      { id: 'blurry', q: 'A customer sends a blurry 200-pixel logo from Facebook for a 12-inch back print. What do you do?',
        choices: ['Upscale it and print it', 'Ask for the original file, or offer to redraw it as a vector (a design fee may apply)',
          'Print it smaller so the blur shows less', 'Tell them we cannot use it'],
        answer: 1, article: 'What artwork should I send?', why: 'The best file is a vector. With only a small image, ask for the original or redraw it, and say if a fee applies.' },
      { id: 'pantone', q: 'A customer wants their logo screen printed in "exactly our brand red". What do you need?',
        choices: ['Nothing, pick the closest red', 'A screenshot of their website', 'The Pantone number for the red', 'A photo of a shirt they like'],
        answer: 2, article: 'Screen printing: artwork do\'s and don\'ts', why: 'Never promise an exact colour match without a Pantone number.' },
      { id: 'colours', q: 'Why does the number of ink colours matter for screen printing?',
        choices: ['It does not matter', 'Every colour is its own screen, so it changes the price', 'More colours print faster', 'Only white ink costs extra'],
        answer: 1, article: 'Screen printing: artwork do\'s and don\'ts', why: 'Every ink colour needs its own screen, and the price is banded on the colour count.' },
      { id: 'glow', q: 'A DTF design has a soft glow and drop shadow behind the text. What do you do?',
        choices: ['Leave it, DTF prints everything', 'Remove the semi-transparent glow and shadow, or make them solid',
          'Make the glow bigger', 'Switch it to embroidery'],
        answer: 1, article: 'DTF: artwork do\'s and don\'ts', why: 'Semi-transparent pixels, glows and soft shadows print as a haze on DTF.' },
      { id: 'whitebox', q: 'Your DTF file has a white box behind the design. What is wrong?',
        choices: ['Nothing, white disappears on a white shirt', 'The background must be transparent, or the white box prints too',
          'It needs to be a JPG', 'It must be 72 dpi'],
        answer: 1, article: 'DTF: artwork do\'s and don\'ts', why: 'DTF needs a transparent PNG at 300 dpi. A white box behind the design prints as a white box.' },
      { id: 'embtext', q: 'A left-chest embroidery logo has a tiny tagline under it. What do you do?',
        choices: ['Shrink it further to fit', 'Keep text at least 0.25 inches tall: enlarge it or drop the tagline (ask the customer)',
          'Embroider it as is', 'Switch the whole logo to DTF without asking'],
        answer: 1, article: 'Embroidery: artwork do\'s and don\'ts', why: 'Embroidered text needs to be at least 0.25 inches tall. Small text fills in and cannot be read.' },
      { id: 'teamlogo', q: 'A parent asks for a design using the Chicago Bulls logo. What do you do?',
        choices: ['Redraw the logo so it is not an exact copy', 'Design it, it is for personal use', 'Bring it to the owner: we do not print logos the customer does not own',
          'Find the logo on Google Images'],
        answer: 2, article: 'What never to promise', why: 'Logos the customer does not own always go to the owner. Offer an original design instead.' },
      { id: 'typo', q: 'The customer replies "looks great!" to a proof, but you notice their team name is misspelled. What now?',
        choices: ['Print it, they approved it', 'Fix it quietly and print', 'Point out the spelling, send a corrected proof, and get approval in writing again',
          'Ask the owner to print it anyway'],
        answer: 2, article: 'Proof approval', why: 'We print exactly what is approved. A corrected design needs a new proof and a new written approval.' },
      { id: 'approved', q: 'When can you tick "Proof approved" on a job?',
        choices: ['When you send the proof', 'When the customer says yes on a phone call', 'Only when you have their approval in writing (email, text or chat), logged as a note',
          'After 24 hours with no reply'],
        answer: 2, article: 'Proof approval', why: 'Approval must be in writing and logged on the job before anything goes to print.' },
      { id: 'blogimg', q: 'You need a photo for a blog post about team shirts. Which can you use?',
        choices: ['Any photo from Google Images', 'Our own job photos, or stock photos we are licensed to use',
          'A photo from another print shop\'s website', 'A customer\'s child from their Facebook page'],
        answer: 1, article: 'Blog updates: copy and images', why: 'Use our own photos (with permission for any customer in them) or licensed stock. Never copy images from the web.' },
    ],
  },
};

/** The quiz as a helper sees it: questions and choices, no answers. */
function quizForPage(key) {
  const z = Object.prototype.hasOwnProperty.call(QUIZZES, key) ? QUIZZES[key] : null;
  if (!z) return null;
  return { title: z.title, pass: z.pass, questions: z.questions.map(({ id, q, choices }) => ({ id, q, choices })) };
}

/**
 * Mark a quiz. `picked` maps question id -> chosen index (form strings are
 * fine). An unanswered or out-of-range pick is wrong, never an error.
 */
function gradeQuiz(key, picked = {}) {
  const z = Object.prototype.hasOwnProperty.call(QUIZZES, key) ? QUIZZES[key] : null;
  if (!z) return null;
  const results = z.questions.map((x) => {
    const raw = Object.prototype.hasOwnProperty.call(picked, x.id) ? String(picked[x.id]) : '';
    const n = /^\d{1,2}$/.test(raw) && Number(raw) < x.choices.length ? Number(raw) : null;
    return { id: x.id, q: x.q, picked: n, pickedText: n === null ? null : x.choices[n],
             answer: x.answer, answerText: x.choices[x.answer], right: n === x.answer, why: x.why, article: x.article };
  });
  const score = results.filter((r) => r.right).length;
  return { score, total: results.length, pass: z.pass, passed: score >= z.pass, results };
}

/** Unfilled placeholders like "[standard turnaround]" or "[owner to fill in]"
 *  in a playbook article. Markdown links "[text](url)" are not placeholders. */
function placeholders(text) {
  const out = [];
  const re = /\[([^\]\n]{1,60})\](?!\()/g;
  let m;
  while ((m = re.exec(String(text || '')))) out.push(m[1]);
  return [...new Set(out)];
}

module.exports = { FEATURES, TRACKS, DEFAULT_TRACK, trackOf, STEPS, READY_KEY, PAGE_TIPS, QUIZZES, quizForPage, gradeQuiz, visibleSteps, stepByKey, mayTick, progress, placeholders };
