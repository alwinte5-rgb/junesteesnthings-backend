'use strict';

/* Training: the path a new helper walks before working on their own.

   Three kinds of step, and who can tick each:

     read     a playbook article. The helper ticks "I've read it".
     do       a first piece of real work (a lead answered, a quote built). It
              ticks ITSELF from what is in the database, computed on every
              view the way commission is, so it can never say done when the
              work was not.
     signoff  a skill the owner has seen. Only the owner can tick it.

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
    const done = s.type === 'do' ? Number(facts[s.fact] || 0) > 0 : !!t;
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

/** Unfilled placeholders like "[standard turnaround]" or "[owner to fill in]"
 *  in a playbook article. Markdown links "[text](url)" are not placeholders. */
function placeholders(text) {
  const out = [];
  const re = /\[([^\]\n]{1,60})\](?!\()/g;
  let m;
  while ((m = re.exec(String(text || '')))) out.push(m[1]);
  return [...new Set(out)];
}

module.exports = { FEATURES, STEPS, READY_KEY, PAGE_TIPS, visibleSteps, stepByKey, mayTick, progress, placeholders };
