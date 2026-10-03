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
              is done once a passing attempt is stored; nobody ticks it.

   The last sign-off, "ready", ends training: page tips stop, and the Team page
   suggests moving the helper up from Training. Moving them stays the owner's
   decision on /admin/staff.

   A step can name a `needs` feature that ships later (the end-of-day note,
   proofs). It is hidden until that feature is listed in FEATURES, so nobody
   is asked to do something the workspace cannot do yet. */

/* Features this deploy has. A later PR adds its name here, and the steps
   that wait for it appear. */
const FEATURES = new Set([]);

const STEPS = [
  { key: 'read:never', type: 'read', article: 'What never to promise',
    title: 'Read: what never to promise' },
  { key: 'read:lead', type: 'read', article: 'New lead: first reply to quote',
    title: 'Read: how to answer a new lead' },
  { key: 'do:lead', type: 'do', fact: 'leads',
    title: 'Answer your first lead', hint: 'Open a lead from My Day and log the call, email, text or chat you sent.' },
  { key: 'read:options', type: 'read', article: 'Quote with options the customer picks',
    title: 'Read: quotes with options' },
  { key: 'do:quote', type: 'do', fact: 'quotes',
    title: 'Build your first quote', hint: 'Use the Quote button on a lead so it links back. The owner checks it before it goes out.' },
  { key: 'do:message', type: 'do', fact: 'messages',
    title: 'Write your first customer message', hint: 'From a job page. While you are in training it waits for the owner.' },
  { key: 'read:proof', type: 'read', article: 'Proof approval',
    title: 'Read: proof approval' },
  { key: 'read:deposits', type: 'read', article: 'Chasing deposits and balances',
    title: 'Read: chasing deposits and balances' },
  { key: 'read:tax', type: 'read', article: 'Tax certificate pre-screen',
    title: 'Read: tax certificate pre-screen' },
  { key: 'read:social', type: 'read', article: 'Social inbox check (twice a day)',
    title: 'Read: the social inbox check' },
  { key: 'read:ai', type: 'read', article: 'AI rules',
    title: 'Read: the AI rules (ChatGPT, image tools)' },
  { key: 'read:prospect', type: 'read', article: 'Finding new leads in quiet time',
    title: 'Read: finding new leads in quiet time' },
  { key: 'quiz:basics', type: 'quiz', quiz: 'basics',
    title: 'Pass the quick quiz', hint: '10 questions, about 5 minutes. Get 8 right. You can take it again.' },
  { key: 'do:eod', type: 'do', fact: 'eod', needs: 'eod',
    title: 'Send your first end-of-day note', hint: 'Use "Wrap up the day" on My Day.' },
  { key: 'do:proof', type: 'do', fact: 'proofs', needs: 'proofs',
    title: 'Upload your first proof', hint: 'From a job page. The owner checks it before the customer sees it.' },
  { key: 'signoff:screenprint', type: 'signoff',
    title: 'Quotes a two-location screen print correctly', hint: 'The owner ticks this after checking one of your quotes.' },
  { key: 'signoff:handoff', type: 'signoff',
    title: 'Knows when to hand a customer to the owner', hint: 'Discounts, refunds, logos the customer does not own, angry customers.' },
  { key: 'signoff:ready', type: 'signoff',
    title: 'Ready to send small quotes on their own', hint: 'The last step. The owner decides when to move you up from Training.' },
];

const READY_KEY = 'signoff:ready';

function visibleSteps(features = FEATURES) {
  return STEPS.filter((s) => !s.needs || features.has(s.needs));
}

function stepByKey(key, features = FEATURES) {
  return visibleSteps(features).find((s) => s.key === key) || null;
}

/** May this person tick this step? A helper ticks their own reading; only
 *  the owner signs off; "do" steps are never ticked by hand. */
function mayTick(key, byOwner, features = FEATURES) {
  const s = stepByKey(key, features);
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
function progress(ticks, facts = {}, features = FEATURES) {
  const steps = visibleSteps(features).map((s) => {
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
        answer: 1, why: 'Forms get a reply within 1 hour, chats within 15 minutes. The first shop to answer usually gets the order.' },
      { id: 'vague', q: 'A message says only: "how much for shirts?" What is the best reply?',
        choices: ['Send the price of our cheapest shirt', 'Ask them to call the owner',
          'Thank them, and ask how many, which garment, where the design goes, their artwork and the date they need them',
          'Send the whole catalogue'],
        answer: 2, why: 'You cannot quote without the details. The /quote reply in the playbook asks for all five in one friendly message.' },
      { id: 'minimum', q: 'A coach wants 30 shirts with a 2-colour logo. What do you suggest?',
        choices: ['Screen printing, it is always cheapest', 'Tell them 30 is too few for us',
          'DTF (or embroidery), because screen printing starts at 50 pieces', 'Ask them to order 50 so we can screen print'],
        answer: 2, why: 'Screen printing starts at 50 pieces. DTF has no minimum and suits small runs. Offer the best-value option, never a refusal.' },
      { id: 'pricematch', q: 'A customer says another shop is 15% cheaper and asks you to match it. What do you do?',
        choices: ['Match it, to win the order', 'Offer 10% off as a middle ground',
          'Say we never match prices', 'Ask to see the other quote, explain what ours includes, and check with the owner before promising anything'],
        answer: 3, why: 'Discounts and price matches are the owner\'s call. Comparing what is included often wins the sale without any discount.' },
      { id: 'logo', q: 'A customer asks for 60 shirts with an NFL team logo for a watch party. What do you do?',
        choices: ['Quote it like any other order', 'Quote it but use DTF instead', 'Bring it to the owner: we do not print logos the customer does not own',
          'Ignore the message'],
        answer: 2, why: 'Logos the customer does not own (teams, brands, characters) always go to the owner. Suggest an original design for the party instead.' },
      { id: 'followup', q: 'You sent a quote 3 days ago and heard nothing. What is the best next step?',
        choices: ['Wait. They will reply when ready', 'Send a friendly note asking if they have questions, mention the quote is good for 14 days, and set the next follow-up date',
          'Offer a discount to get a reply', 'Call them every day until they answer'],
        answer: 1, why: 'Most sales are won on the follow-up. One friendly nudge with a reason to act now, then a new follow-up date on the lead.' },
      { id: 'rush', q: 'A customer needs 40 shirts by Friday, 3 business days away. What do you say?',
        choices: ['"No problem, they\'ll be ready Friday"', '"Sorry, we can\'t do that"',
          '"We offer rush for a fee. Let me check what\'s on the press and confirm today"', '"Order now and we\'ll try our best"'],
        answer: 2, why: 'Never promise a date without checking stock and the production board. Rush is a paid option, so offer it and confirm.' },
      { id: 'upset', q: 'A customer writes: "One shirt is printed crooked and our event is tomorrow!" What do you do first?',
        choices: ['Promise a full refund', 'Apologise, ask for a photo, and bring it to the owner right away',
          'Explain that small differences are normal', 'Wait for the owner to see it'],
        answer: 1, why: 'Apologise and act fast, but refunds and reprints are the owner\'s decision. A photo lets the owner fix it quickly.' },
      { id: 'quiet', q: 'You have a quiet hour with no leads waiting. What is the best use of it?',
        choices: ['Find new customers: schools, teams, churches and businesses with events coming up, and add each one on Leads',
          'Log off early', 'Post the same message in as many Facebook groups as you can', 'Re-read old emails'],
        answer: 0, why: 'Quiet time is for finding new leads. Look for groups that need shirts soon and add each one on Leads, so nothing is lost and the sale is credited to you.' },
      { id: 'prospect', q: 'You find a youth soccer league with the coach\'s email on its website. What do you do?',
        choices: ['Add them to our email newsletter', 'Text the coach\'s phone number',
          'Add them on Leads, then send one short personal email about their season with an easy next step',
          'Send our full price list'],
        answer: 2, why: 'One short, personal message mentioning their team, with an easy yes ("Want a couple of design ideas and a price?"). Never add strangers to the newsletter, and never cold-text.' },
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
             answer: x.answer, answerText: x.choices[x.answer], right: n === x.answer, why: x.why };
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

module.exports = { FEATURES, STEPS, READY_KEY, PAGE_TIPS, QUIZZES, quizForPage, gradeQuiz, visibleSteps, stepByKey, mayTick, progress, placeholders };
