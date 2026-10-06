'use strict';

/* Staff accounts: who may do what in the back office.

   Until this, the back office had one identity — whoever knew ADMIN_PASSWORD —
   and every page, Finances included, was open to it. Hiring a helper meant
   handing them the owner's password and the books with it, and nothing could
   say afterwards which of the two had sent a quote.

   Now the owner keeps that password and every page, and each helper has their
   own login carrying a set of PERMISSIONS the owner switches on and off. A
   permission is one of three levels:

     off       the page or action is refused, and hidden from the menu
     approval  the helper may do it, but it waits for the owner before it
               reaches a customer (a quote, a message)
     on        they may do it themselves — optionally up to a limit
               (a quote total, a discount percentage)

   Deny by default: a route the ROUTES table below does not name is refused to
   staff. A new admin route is therefore owner-only until someone decides who
   else should reach it, and a test fails if one is added without an entry. */

const crypto = require('node:crypto');

const LEVELS = ['off', 'approval', 'on'];

/* The permissions, in the order the owner reads them on /admin/staff.
   `levels` is what the toggle offers: some actions have no sensible
   "approval" step (a page you can or cannot read). `limit` names the number
   an "on" can be capped at. */
const PERMISSIONS = {
  'leads.view':            { group: 'Leads',      label: 'See leads and chats', levels: ['off', 'on'] },
  'leads.dismiss':         { group: 'Leads',      label: 'Dismiss leads and abandoned carts', levels: ['off', 'on'] },
  'quotes.view':           { group: 'Quotes',     label: 'See the quote and production boards', levels: ['off', 'on'] },
  'quotes.draft':          { group: 'Quotes',     label: 'Build and edit quotes', levels: ['off', 'on'] },
  'quotes.send':           { group: 'Quotes',     label: 'Send quotes to customers', levels: ['approval', 'on'],
                             limit: { key: 'maxTotal', label: 'Up to $', unit: '$' } },
  'quotes.discount':       { group: 'Quotes',     label: 'Discounts and prices below list', levels: ['off', 'approval', 'on'],
                             limit: { key: 'maxPct', label: 'Up to %', unit: '%' } },
  'quotes.manage':         { group: 'Quotes',     label: 'Cancel and restore quotes', levels: ['off', 'on'] },
  'customers.view':        { group: 'Customers',  label: 'See customers', levels: ['off', 'on'] },
  'customers.message':     { group: 'Customers',  label: 'Email and text customers', levels: ['off', 'approval', 'on'] },
  'production.stage':      { group: 'Production', label: 'Move jobs through production, shipping', levels: ['off', 'on'] },
  'orders.view':           { group: 'Production', label: 'See studio orders', levels: ['off', 'on'] },
  /* A designer's whole view of a job: what to print, where, by when, the
     customer's files and the notes. No prices, no payments, no contact
     details, and no other board (/admin/design). */
  'jobs.design':           { group: 'Production', label: 'Design jobs (no prices or contact details)', levels: ['off', 'on'] },
  'proofs.upload':         { group: 'Production', label: 'Upload proofs to jobs', levels: ['off', 'on'] },
  'art.request':           { group: 'Production', label: 'Send jobs to the designer, answer their questions', levels: ['off', 'on'] },
  'art.work':              { group: 'Production', label: 'Work on artwork: ask sales, upload and submit final art', levels: ['off', 'on'] },
  /* Its own toggle because it spends money: each label is charged to the
     owner's Shippo account. In no preset, like Finances: opened on purpose. */
  'shipping.labels':       { group: 'Production', label: 'Buy shipping labels (charged to your Shippo account)', levels: ['off', 'on'] },
  'reviews.manage':        { group: 'Reviews',    label: 'Manage reviews', levels: ['off', 'on'] },
  'certificates.prescreen':{ group: 'Tax',        label: 'See and attach tax certificates', levels: ['off', 'on'] },
  'payments.record':       { group: 'Money',      label: 'Record cash and Zelle payments (you confirm each one)', levels: ['off', 'on'] },
  'discounts.manage':      { group: 'Money',      label: 'Discount codes', levels: ['off', 'on'] },
  'dashboard.view':        { group: 'Money',      label: 'Dashboard (takings, money owed)', levels: ['off', 'on'] },
  'kb.edit':               { group: 'Playbook',   label: 'Write playbook articles', levels: ['off', 'approval', 'on'] },
};

/* What no helper can ever be given, at any level, by preset or by toggle
   (owner, 2026-10-06: "they never gain these permissions even after
   training"). Tax decisions, money corrections and write-offs, sales credit,
   the books, staff and pay. These are not in PERMISSIONS at all, so there is
   no toggle to turn on; their routes are 'owner' in ROUTES, and a test checks
   every one stays that way. */
const NEVER_STAFF = [
  'POST /admin/certificates/:id/review',
  'POST /admin/quotes/:code/exemption',
  'POST /admin/quote/:code/correct-payment',
  'POST /admin/quote/:code/settle',
  'POST /admin/quote/:code/confirm-payment',
  'POST /admin/unlinked/:id/apply',
  'POST /admin/unlinked/:id/tax',
  'POST /admin/quote/:code/credit',
  'POST /admin/quote/:code/sale-type',
  'POST /admin/quote/:code/restore-version',
  'GET /admin/finances',
  'POST /admin/expenses',
  'POST /admin/expenses/:id',
  'POST /admin/expenses/:id/delete',
  'POST /admin/expenses/roll',
  'GET /admin/exports',
  'GET /admin/exports/quotes.csv',
  'GET /admin/exports/payments.csv',
  'GET /admin/exports/expenses.csv',
  'GET /admin/exports/unlinked.csv',
  'GET /admin/tax.csv',
  'POST /admin/tax/remit',
  'POST /admin/quote/:code/costs',
  'GET /admin/staff',
  'POST /admin/staff',
  'POST /admin/staff/:id',
  'GET /admin/approvals',
  'POST /admin/approvals/:id',
  'GET /admin/commission',
  'POST /admin/commission/pay',
];

/* Starting points, not rules: applying one sets every toggle, and the owner can
   then change any single one. */
const PRESETS = {
  training: {
    label: 'Training',
    note: 'Sees the work, drafts quotes and messages; you approve everything before a customer sees it.',
    perms: {
      'leads.view': 'on', 'quotes.view': 'on', 'quotes.draft': 'on',
      'quotes.send': 'approval', 'quotes.discount': 'approval',
      'customers.view': 'on', 'customers.message': 'approval',
      'orders.view': 'on', 'art.request': 'on', 'kb.edit': 'approval',
    },
  },
  /* Designers see their design jobs and nothing else (owner, 2026-10-06: "no
     access to things that don't pertain to them"): no quote or production
     board, no prices, no customer list, no studio orders, no leads. Proof
     messages go out through the system, so the customer's address is never
     shown to them. */
  design: {
    label: 'Design training',
    note: 'Sees only their design jobs, uploads proofs and writes proof messages; you approve each message before it is sent.',
    perms: {
      'jobs.design': 'on', 'customers.message': 'approval',
      'proofs.upload': 'on', 'art.work': 'on', 'kb.edit': 'approval',
    },
  },
  designer: {
    label: 'Designer',
    note: 'Design training signed off: sends proofs to customers themselves. Still sees only their design jobs.',
    perms: {
      'jobs.design': 'on', 'customers.message': 'on',
      'proofs.upload': 'on', 'art.work': 'on', 'kb.edit': 'approval',
    },
  },
  supervised: {
    label: 'Supervised',
    note: 'Sends quotes up to $500 and messages customers; discounts still come to you.',
    perms: {
      'leads.view': 'on', 'leads.dismiss': 'on', 'quotes.view': 'on', 'quotes.draft': 'on',
      'quotes.send': { level: 'on', maxTotal: 500 }, 'quotes.discount': 'approval',
      'customers.view': 'on', 'customers.message': 'on', 'production.stage': 'on',
      'orders.view': 'on', 'proofs.upload': 'on', 'art.request': 'on', 'certificates.prescreen': 'on', 'reviews.manage': 'on',
      'kb.edit': 'approval',
    },
  },
  trusted: {
    label: 'Trusted',
    note: 'Runs sales day to day: any quote, discounts up to 10%, cancels and restores.',
    perms: {
      'leads.view': 'on', 'leads.dismiss': 'on', 'quotes.view': 'on', 'quotes.draft': 'on',
      'quotes.send': 'on', 'quotes.discount': { level: 'on', maxPct: 10 }, 'quotes.manage': 'on',
      'customers.view': 'on', 'customers.message': 'on', 'production.stage': 'on',
      'orders.view': 'on', 'proofs.upload': 'on', 'art.request': 'on', 'certificates.prescreen': 'on', 'reviews.manage': 'on',
      'kb.edit': 'on',
    },
  },
};

/* Every admin route, and the permission a helper needs for it.
   'owner'  only the owner, whatever toggles are set.
   'any'    any signed-in helper (the menu counts, the sign-in redirect).
   The key is "<METHOD> <route path as written in server.js>"; a route
   registered for several paths is keyed by the paths joined with "|". */
const ROUTES = {
  'POST /admin/orders/create': 'owner',
  'GET /admin/inventory': 'owner',
  'GET /admin': 'any',
  'GET /admin/data': 'owner',
  'GET /admin/nav-counts': 'any',
  'GET /admin/api/test-email': 'owner',

  'GET /admin/leads': 'leads.view',
  'POST /admin/leads/dismiss-old': 'leads.dismiss',
  'POST /admin/lead/:id/dismiss': 'leads.dismiss',
  'POST /admin/cart/dismiss': 'leads.dismiss',

  'GET /admin/quotes': 'quotes.view',
  'GET /admin/production': 'quotes.view',
  'GET /admin/production/:code': 'quotes.view',
  'GET /admin/production/:code/sent-file/:id/:n': 'quotes.view',
  /* A file a customer's emailed reply carried (2026-10-06). */
  'GET /admin/production/:code/reply-file/:id/:n': 'quotes.view',
  /* The customer's artwork, one original or all of them zipped (2026-10-06).
     A designer reaches the same files from their design page. */
  'GET /admin/production/:code/artwork/:n': 'quotes.view',
  'GET /admin/production/:code/artwork.zip': 'quotes.view',
  'GET /admin/quote/new|/admin/quote/:code/edit': 'quotes.draft',
  'GET /admin/api/quotes/prior': 'quotes.draft',
  'POST /admin/api/quotes|/admin/api/quotes/:code': 'quotes.draft',
  'POST /admin/quote/:code/cancel': 'quotes.manage',
  'POST /admin/quote/:code/uncancel': 'quotes.manage',

  'POST /admin/quote/:code/step': 'production.stage',
  'POST /admin/quote/:code/stage': 'production.stage',
  'POST /admin/quote/:code/target': 'production.stage',
  'POST /admin/quote/:code/shipping': 'production.stage',
  'GET /admin/shipping': 'production.stage',
  'POST /admin/shipping/shipped': 'production.stage',
  'POST /admin/shipping/address': 'production.stage',
  'POST /admin/shipping/check': 'production.stage',
  'POST /admin/shipping/buy': 'shipping.labels',

  /* Local delivery. Running the day is production work; what it costs and
     where it goes (zones, fees, windows, the courier's rates) is the owner's. */
  'GET /admin/delivery': 'production.stage',
  'GET /admin/delivery/job/:id': 'production.stage',
  'POST /admin/delivery/job/:id/move': 'production.stage',
  'POST /admin/delivery/job/:id/status': 'production.stage',
  'POST /admin/delivery/job/:id/courier': 'production.stage',
  'POST /admin/delivery/window-courier': 'production.stage',
  'POST /admin/delivery/day-move': 'production.stage',
  'GET /admin/delivery/new': 'production.stage',
  'POST /admin/delivery/new': 'production.stage',
  'GET /admin/delivery/settings': 'owner',
  'POST /admin/delivery/settings/zone': 'owner',
  'POST /admin/delivery/settings/zone/:id/delete': 'owner',
  'POST /admin/delivery/settings/window': 'owner',
  'POST /admin/delivery/settings/window/:id/delete': 'owner',
  'POST /admin/delivery/settings/blackout': 'owner',
  'POST /admin/delivery/settings/blackout/delete': 'owner',
  'POST /admin/delivery/settings/partner': 'owner',

  'POST /admin/quote/:code/message': 'customers.message',
  'POST /admin/quote/:code/email': 'customers.message',
  /* Marks a quote as sent by text or by hand (2026-10-06): sending, so the same permission. */
  'POST /admin/quote/:code/delivered': 'customers.message',
  'POST /admin/quote/:code/receipt': 'customers.message',
  'GET /admin/customers': 'customers.view',
  'GET /admin/customer': 'customers.view',
  /* Find an order: a quote code opens its job page, else a customer search. */
  'GET /admin/find': 'customers.view',
  'GET /admin/orders': 'orders.view',

  'GET /admin/reviews': 'reviews.manage',
  'POST /admin/reviews/google-reply': 'reviews.manage',
  'POST /admin/reviews/:id': 'reviews.manage',
  'POST /admin/reviews/backfill': 'owner',

  'GET /admin/certificates': 'certificates.prescreen',
  'GET /admin/certificates/:id/file': 'certificates.prescreen',
  'POST /admin/quote/:code/certificate': 'certificates.prescreen',
  'POST /admin/certificates/:id/review': 'owner',
  'POST /admin/quotes/:code/exemption': 'owner',

  /* A helper's cash or Zelle payment is recorded unconfirmed and counts for
     nothing (commission included) until the owner confirms it. Correcting,
     voiding, writing off and moving payments are the owner's alone. */
  'POST /admin/quote/:code/mark-paid': 'payments.record',
  'POST /admin/quote/:code/confirm-payment': 'owner',
  'POST /admin/quote/:code/correct-payment': 'owner',
  'POST /admin/quote/:code/settle': 'owner',
  'POST /admin/unlinked/:id/apply': 'owner',

  // Quote history: anyone who can see the job reads it; only the owner restores.
  'POST /admin/quote/:code/restore-version': 'owner',
  'POST /admin/followups/:id/done': 'owner',

  // A designer's own board and job page.
  'GET /admin/design': 'jobs.design',
  'GET /admin/design/:code': 'jobs.design',
  'GET /admin/design/:code/artwork/:n': 'jobs.design',
  'GET /admin/design/:code/artwork.zip': 'jobs.design',
  'POST /admin/design/:code/note': 'jobs.design',

  'GET /admin/discounts': 'discounts.manage',
  'POST /admin/discounts': 'discounts.manage',
  // The reintroduction campaign texts and emails the whole list: the owner's call.
  'GET /admin/campaign': 'owner',
  'GET /admin/campaign/sign': 'owner',
  'POST /admin/campaign/test': 'owner',
  'POST /admin/campaign/text': 'owner',
  'POST /admin/campaign/email': 'owner',
  'POST /admin/discounts/send': 'discounts.manage',
  'POST /admin/discounts/off': 'discounts.manage',
  'POST /admin/discounts/on': 'discounts.manage',
  'POST /admin/discounts/remove': 'discounts.manage',

  'GET /admin/dashboard': 'dashboard.view',

  'GET /admin/finances': 'owner',
  'POST /admin/expenses': 'owner',
  'POST /admin/expenses/:id': 'owner',
  'POST /admin/expenses/:id/delete': 'owner',
  'POST /admin/expenses/roll': 'owner',
  'GET /admin/exports': 'owner',
  'GET /admin/exports/quotes.csv': 'owner',
  'GET /admin/exports/payments.csv': 'owner',
  'GET /admin/exports/expenses.csv': 'owner',
  'GET /admin/exports/unlinked.csv': 'owner',
  'GET /admin/tax.csv': 'owner',
  'POST /admin/tax/remit': 'owner',
  'POST /admin/unlinked/:id/tax': 'owner',
  'POST /admin/quote/:code/costs': 'owner',

  // The staff workspace itself.
  'GET /admin/my-day': 'any',
  'GET /admin/playbook': 'any',
  'GET /admin/playbook/:id': 'any',
  'POST /admin/playbook': 'kb.edit',
  'POST /admin/playbook/:id': 'kb.edit',
  'GET /admin/api/playbook/replies': 'any',
  'POST /admin/lead/:id/note': 'leads.view',
  'POST /admin/lead/:id/assign': 'leads.view',
  'POST /admin/lead/:id/outcome': 'leads.view',
  'POST /admin/leads/add': 'leads.view',
  'POST /admin/leads/call': 'leads.view',
  'POST /admin/quote/:code/note': 'quotes.view',
  'POST /admin/tasks': 'any',
  'POST /admin/tasks/:id/done': 'any',
  'POST /admin/quote/:code/credit': 'owner',
  // Shop lead or rep lead: decided by the records; only the owner relabels (tools/lib/sales-credit.js).
  'POST /admin/quote/:code/sale-type': 'owner',
  'GET /admin/my-earnings': 'any',
  'POST /admin/bonuses': 'owner',
  'POST /admin/bonuses/:id/delete': 'owner',
  'POST /admin/incentives': 'owner',
  'POST /admin/incentives/:id/end': 'owner',
  'POST /admin/incentives/:id/award': 'owner',
  'GET /admin/training': 'any',
  'POST /admin/training/read': 'any',
  'POST /admin/training/tip': 'any',
  'GET /admin/training/quiz/:key': 'any',
  'POST /admin/api/proof-signature': 'proofs.upload',
  'POST /admin/quote/:code/proofs': 'proofs.upload',
  'POST /admin/quote/:code/art/request': 'art.request',
  'POST /admin/quote/:code/art/work': 'art.work',
  'POST /admin/quote/:code/art/file': 'art.work',
  'POST /admin/api/art-signature': 'art.work',
  /* Files for an email from the job page (2026-10-06). */
  'POST /admin/api/message-file-signature': 'customers.message',
  /* Ask Claude for a suggested reply on the job page (2026-10-06). */
  'POST /admin/api/quote/:code/suggest-reply': 'customers.message',
  /* Claude reads a message for accuracy and tone before it is sent. */
  'POST /admin/api/quote/:code/review-message': 'customers.message',
  'POST /admin/quote/:code/art/decide': 'owner',
  'POST /admin/training/quiz/:key': 'any',
  'POST /admin/training/signoff': 'owner',
  'POST /admin/training/tips-reset': 'owner',
  'POST /admin/feedback': 'owner',
  'GET /admin/team-chat': 'any',
  'POST /admin/team-chat': 'any',
  'GET /admin/api/team-chat': 'any',
  'GET /admin/staff': 'owner',
  'POST /admin/staff': 'owner',
  'POST /admin/staff/:id': 'owner',
  'GET /admin/approvals': 'owner',
  'POST /admin/approvals/:id': 'owner',
  'GET /admin/activity': 'owner',
  'GET /admin/team': 'owner',
  'POST /admin/team/hours': 'owner',
  'GET /admin/commission': 'owner',
  // Hiring is the owner's alone: applicants' answers and the scores.
  'GET /admin/hiring': 'owner',
  'POST /admin/hiring': 'owner',
  'GET /admin/hiring/test': 'owner',
  'GET /admin/hiring/:id': 'owner',
  'POST /admin/hiring/:id/grade': 'owner',
  'POST /admin/hiring/:id/link': 'owner',
  'POST /admin/hiring/:id/round2': 'owner',
  'POST /admin/hiring/:id/decision': 'owner',
  'POST /admin/hiring/:id/fee': 'owner',
  'POST /admin/hiring/:id/cancel': 'owner',
  'POST /admin/commission/pay': 'owner',
};

function routeKey(method, routePath) {
  const p = Array.isArray(routePath) ? routePath.join('|') : String(routePath || '');
  // HEAD is served by the GET route.
  const m = String(method || '').toUpperCase() === 'HEAD' ? 'GET' : String(method || '').toUpperCase();
  return `${m} ${p}`;
}

/** The permission a route needs, or null when the table does not name it. */
function permForRoute(method, routePath) {
  return ROUTES[routeKey(method, routePath)] || null;
}

/** A stored permission value → { level, ...limits }. Anything unrecognised is
 *  'off', so a typo in the database can only ever take access away. */
function normalizePerm(key, raw) {
  const def = PERMISSIONS[key];
  if (!def) return { level: 'off' };
  let level = 'off';
  const out = {};
  if (typeof raw === 'string') level = raw;
  else if (raw && typeof raw === 'object') {
    level = String(raw.level || 'off');
    if (def.limit) {
      const n = Number(raw[def.limit.key]);
      if (Number.isFinite(n) && n >= 0) out[def.limit.key] = n;
    }
  }
  if (!LEVELS.includes(level)) level = 'off';
  /* A level the toggle does not offer is folded to the nearest one it does:
     'approval' on a view-only permission is off, since there is nothing for
     the owner to approve; 'off' on quotes.send is 'approval', because a
     helper who can draft a quote must still be able to hand it over. */
  if (!def.levels.includes(level)) {
    level = def.levels.includes('approval') && level !== 'on' ? 'approval' : 'off';
  }
  return { level, ...out };
}

/** The permission set a preset gives, fully normalised. */
function presetPerms(name) {
  const p = PRESETS[name];
  if (!p) return null;
  const out = {};
  for (const key of Object.keys(PERMISSIONS)) out[key] = normalizePerm(key, p.perms[key]);
  return out;
}

/** Everything an actor may do, fully normalised. The owner is 'on' for all. */
function effectivePerms(actor) {
  const out = {};
  for (const key of Object.keys(PERMISSIONS)) {
    out[key] = actor && actor.kind === 'owner'
      ? { level: 'on' }
      : normalizePerm(key, actor && actor.perms && actor.perms[key]);
  }
  return out;
}

function levelOf(actor, key) {
  if (actor && actor.kind === 'owner') return 'on';
  return normalizePerm(key, actor && actor.perms && actor.perms[key]).level;
}

/** May this actor open the route at all? ('approval' counts: they may start
 *  the action; the handler decides whether it is held.) */
function mayUseRoute(actor, method, routePath) {
  if (actor && actor.kind === 'owner') return true;
  if (!actor || actor.kind !== 'staff') return false;
  // Belt and braces: even a ROUTES slip cannot open one of these.
  if (NEVER_STAFF.includes(routeKey(method, routePath))) return false;
  const need = permForRoute(method, routePath);
  if (!need || need === 'owner') return false;
  if (need === 'any') return true;
  return levelOf(actor, need) !== 'off';
}

/* ── Quotes: does this save go straight out, or wait for the owner? ─────────
   `quote` is the saved row's money: total, and the list price the lines were
   discounted from. Returns { held: bool, reasons: [..] } — every reason, so the
   helper is told all of them at once. */
function quoteNeedsApproval(actor, { total, listTotal, discountPct, customPriced = 0, forStaff = false } = {}) {
  if (!actor || actor.kind === 'owner') return { held: false, reasons: [] };
  const reasons = [];
  /* A quote whose email or phone is a staff member's: a helper selling to
     themselves (or a teammate) sets their own price and earns on it. */
  if (forStaff) reasons.push('The customer’s email or phone belongs to someone on the team.');
  const send = normalizePerm('quotes.send', actor.perms && actor.perms['quotes.send']);
  if (send.level !== 'on') reasons.push('Your quotes go to the owner before the customer sees them.');
  else if (send.maxTotal != null && Number(total) > send.maxTotal) {
    reasons.push(`The total is over your $${send.maxTotal} limit.`);
  }
  const pct = Math.max(0, Number(discountPct) || 0,
    listTotal > 0 && total < listTotal ? ((listTotal - total) / listTotal) * 100 : 0);
  if (pct > 0.5) {
    const disc = normalizePerm('quotes.discount', actor.perms && actor.perms['quotes.discount']);
    if (disc.level === 'off') reasons.push('Discounts and below-list prices need the owner.');
    else if (disc.level === 'approval') reasons.push('Discounts and below-list prices go to the owner first.');
    else if (disc.maxPct != null && pct > disc.maxPct + 0.01) {
      reasons.push(`The discount (${Math.round(pct)}%) is over your ${disc.maxPct}% limit.`);
    }
  }
  /* A line with no product and a typed price has no catalogue price, so how
     far below it is cannot be measured. Unless discounts are fully theirs, the
     owner sees it. */
  if (customPriced > 0) {
    const disc = normalizePerm('quotes.discount', actor.perms && actor.perms['quotes.discount']);
    if (disc.level !== 'on') reasons.push('A custom line with a typed price has no catalogue price to check it against.');
  }
  return { held: reasons.length > 0, reasons };
}

/** The most a helper's discount CODE may take off, in percent: their quote
 *  discount limit when discounts are theirs, else nothing (0). A helper with
 *  discounts fully theirs and no limit gets the 10% a trusted helper has,
 *  since a code, unlike a quote, reaches anyone it is passed to. */
function discountCodeCap(actor) {
  if (!actor || actor.kind === 'owner') return 100;
  const d = normalizePerm('quotes.discount', actor.perms && actor.perms['quotes.discount']);
  if (d.level !== 'on') return 0;
  return d.maxPct != null ? d.maxPct : 10;
}

/* ── Passwords ─────────────────────────────────────────────────────────────
   scrypt with a random salt, stored as "scrypt$<N>$<salt hex>$<hash hex>" so
   the cost can be raised later without breaking stored hashes. */
const SCRYPT_N = 16384;
const MIN_PASSWORD = 12;
const MAX_PASSWORD = 200;

function hashPassword(password) {
  const pw = String(password || '');
  if (pw.length < MIN_PASSWORD || pw.length > MAX_PASSWORD) {
    throw new Error(`Password must be ${MIN_PASSWORD}–${MAX_PASSWORD} characters`);
  }
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(pw, salt, 32, { N: SCRYPT_N });
  return `scrypt$${SCRYPT_N}$${salt.toString('hex')}$${hash.toString('hex')}`;
}

function verifyPassword(password, stored) {
  const pw = String(password || '');
  if (!pw || pw.length > MAX_PASSWORD) return false;
  const parts = String(stored || '').split('$');
  if (parts.length !== 4 || parts[0] !== 'scrypt') return false;
  const N = Number(parts[1]);
  if (!Number.isInteger(N) || N < 1024 || N > 1 << 20) return false;
  const salt = Buffer.from(parts[2], 'hex');
  const want = Buffer.from(parts[3], 'hex');
  if (!salt.length || want.length !== 32) return false;
  const got = crypto.scryptSync(pw, salt, 32, { N });
  return crypto.timingSafeEqual(got, want);
}

/** A readable one-off password for the owner to hand over: 4 groups of 4. */
function generatePassword() {
  const alphabet = 'abcdefghjkmnpqrstuvwxyz23456789';
  const bytes = crypto.randomBytes(16);
  let s = '';
  for (let i = 0; i < 16; i++) {
    s += alphabet[bytes[i] % alphabet.length];
    if (i % 4 === 3 && i < 15) s += '-';
  }
  return s;
}

/* ── Sessions ─────────────────────────────────────────────────────────────
   "<staff id>.<session version>.<expiry ms>.<hmac>". The version is the
   staff row's session_version; disabling a helper or resetting their password
   bumps it, which ends every session they have on their next request. */
const STAFF_SESSION_HOURS = 12;

function sign(payload, key) {
  return crypto.createHmac('sha256', key).update(String(payload)).digest('hex');
}

function makeSession(id, version, key, ttlMs = STAFF_SESSION_HOURS * 3600 * 1000, now = Date.now()) {
  if (!key) throw new Error('STAFF_SESSION_SECRET is required');
  const payload = `${Number(id)}.${Number(version)}.${now + ttlMs}`;
  return `${payload}.${sign(payload, key)}`;
}

/** → { id, version } for a valid unexpired session, else null. */
function readSession(value, key, now = Date.now()) {
  if (!key) return null;
  const s = String(value || '');
  if (s.length > 200) return null;
  const m = /^(\d{1,10})\.(\d{1,10})\.(\d{13})\.([0-9a-f]{64})$/.exec(s);
  if (!m) return null;
  const payload = `${m[1]}.${m[2]}.${m[3]}`;
  const want = Buffer.from(sign(payload, key), 'hex');
  const got = Buffer.from(m[4], 'hex');
  if (want.length !== got.length || !crypto.timingSafeEqual(want, got)) return null;
  if (Number(m[3]) < now) return null;
  return { id: Number(m[1]), version: Number(m[2]) };
}

/** Reads a permission form from /admin/staff into a stored permission set.
 *  Fields: perm_<key> = level, limit_<key> = number. */
function permsFromForm(body) {
  const b = body || {};
  const out = {};
  for (const [key, def] of Object.entries(PERMISSIONS)) {
    const level = String(b['perm_' + key] || 'off');
    const v = { level };
    if (def.limit) {
      const raw = String(b['limit_' + key] ?? '').trim();
      if (raw !== '') v[def.limit.key] = Number(raw);
    }
    out[key] = normalizePerm(key, v);
  }
  return out;
}

/** Which preset (if any) a permission set is exactly. */
function presetMatching(perms) {
  for (const name of Object.keys(PRESETS)) {
    const p = presetPerms(name);
    const same = Object.keys(PERMISSIONS).every((k) =>
      JSON.stringify(normalizePerm(k, perms && perms[k])) === JSON.stringify(p[k]));
    if (same) return name;
  }
  return null;
}

const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,190}\.[a-z]{2,}$/i;

module.exports = {
  LEVELS, PERMISSIONS, PRESETS, ROUTES, NEVER_STAFF, STAFF_SESSION_HOURS, MIN_PASSWORD, EMAIL_RE,
  routeKey, permForRoute, normalizePerm, presetPerms, effectivePerms, levelOf, mayUseRoute,
  quoteNeedsApproval, discountCodeCap, hashPassword, verifyPassword, generatePassword,
  makeSession, readSession, permsFromForm, presetMatching,
};
