'use strict';

/* Whose sale is it: the shop's, or a salesperson's own?

   Owner, 2026-10-06: "I would like any traffic I bring to be considered mine.
   But if they bring in their own leads that is considered commission." And:
   "Make sure commission/non commission sales are labeled from the start."

   Every lead and every quote carries a label from the moment it is saved:

     shop     the shop's own traffic: the website, chat, ads, walk-ins, calls
              and messages to the shop, and anyone the shop already knows.
              A helper who closes one is paid their hourly wage, no commission.
     rep      a customer the helper found themselves, registered by them
              before the shop knew of them. Their commission % of the price,
              and the same on reorders for 12 months after their first sale
              to that customer.
     pending  the customer says a salesperson sent them, but no salesperson
              registered them first. Pays nothing until the owner decides.

   Decided by the server from records, never by a tick box a helper controls:
   a helper says "I found this customer", and the known-customer check below
   overrules them if the shop has seen the customer before. The owner can
   change any label, with a reason, until commission on it is paid.

   tests/sales-credit.test.js. */

const SALE_TYPES = {
  shop:    { label: 'Shop lead', tone: 'neutral' },
  rep:     { label: 'Rep lead', tone: 'green' },
  pending: { label: 'Rep claimed · needs OK', tone: 'amber' },
};

/* Commission follows a salesperson's customer for this long after their
   first sale to them (owner, 2026-10-06: 12 months). */
const REORDER_DAYS = 365;

/* A customer the shop has heard from this recently is the shop's, whoever
   "finds" them now. Quotes count at any age: a past buyer is always known. */
const KNOWN_LEAD_DAYS = 365;

/* "How did you hear about us?" on the website form. The answer is recorded
   for the owner's own marketing; only "a salesperson" can affect a label,
   and then only as `pending`. */
const HEARD_FROM = {
  google:   'Google search',
  google_ad: 'Google ad',
  social:   'Facebook, Instagram or TikTok',
  friend:   'A friend or family member',
  repeat:   "I've ordered before",
  saw_work: 'Saw your work or met you at an event',
  rep:      "A June's Tees salesperson",
  other:    'Somewhere else',
};

function heardFromIn(v) {
  const k = String(v || '').trim();
  return HEARD_FROM[k] ? k : null;
}

/** The salesperson a customer named, matched on first name among `reps`
 *  ([{ id, name }]). Exactly one match or nobody: a guess between two people
 *  with the same first name is the owner's to make. */
function matchRep(typed, reps) {
  const whole = String(typed || '').trim().toLowerCase().replace(/\s+/g, ' ');
  const want = whole.split(' ')[0];
  if (!want || want.length < 2) return null;
  const nameOf = (r) => String(r.name || '').trim().toLowerCase().replace(/\s+/g, ' ');
  // A full name typed out wins over first names that happen to match it.
  const exact = (reps || []).filter((r) => nameOf(r) === whole);
  const hits = exact.length ? exact : (reps || []).filter((r) => nameOf(r).split(' ')[0] === want);
  return hits.length === 1 ? hits[0].id : null;
}

/** Has the shop seen this customer? `seen` is what the database found:
 *  { quote: {code, created_at}|null, lead: {id, created_at}|null,
 *    studio: {ref, created}|null }. Returns the reason in the owner's words,
 *  or '' for a customer nobody knows. */
function knownReason(seen, fmt = (d) => new Date(d).toISOString().slice(0, 10)) {
  if (!seen) return '';
  if (seen.quote) return `Already a customer (quote ${seen.quote.code}, ${fmt(seen.quote.created_at)})`;
  if (seen.studio) return `Already ordered online (${fmt(seen.studio.created)})`;
  if (seen.lead) return `Already contacted the shop (${fmt(seen.lead.created_at)})`;
  return '';
}

/**
 * The label a new lead gets.
 *   by        'owner' | 'staff' | 'public' (the website, chat, a webhook)
 *   staffId   the helper adding it, when by === 'staff'
 *   foundIt   the helper says it is their own outreach
 *   known     knownReason() for the contact, '' if new
 *   heardRep  { id|null, typed } when a website customer names a salesperson
 */
function classifyLead({ by, staffId = null, foundIt = false, known = '', heardRep = null, profileOnly = false }) {
  if (by === 'public') {
    if (heardRep && (heardRep.id || heardRep.typed)) {
      return { sale_type: 'pending', rep_id: heardRep.id || null,
        reason: `The customer says a salesperson sent them${heardRep.typed ? ` ("${String(heardRep.typed).slice(0, 60)}")` : ''}` };
    }
    return { sale_type: 'shop', rep_id: null, reason: 'Came to the shop' };
  }
  if (by === 'staff' && foundIt) {
    if (known) return { sale_type: 'shop', rep_id: null, reason: known };
    /* Known only by a social profile: quotes and orders hold no profile, so
       the shop's customers cannot be checked. The owner confirms it. */
    if (profileOnly) return { sale_type: 'pending', rep_id: staffId, reason: 'Found by the salesperson, known only by a social profile; waiting for the owner to check the shop does not already know them' };
    return { sale_type: 'rep', rep_id: staffId, reason: 'Found by the salesperson and registered before anyone else' };
  }
  if (by === 'staff') return { sale_type: 'shop', rep_id: null, reason: 'Contacted the shop' };
  return { sale_type: 'shop', rep_id: null, reason: 'Added by the owner' };
}

/**
 * The label a new quote gets, and who it is credited to.
 *   reorder   { rep_id, code, at } — this customer's first rep sale, if any
 *   lead      { sale_type, rep_id } — the lead it answers, if any
 *   builder   the staff id who built it, null for the owner
 *   now       for the 12-month window
 * Order matters: a reorder inside the window stays the salesperson's even
 * when the customer came back through the website.
 */
function classifyQuote({ reorder = null, lead = null, builder = null, now = Date.now() }) {
  if (reorder && reorder.rep_id && now - new Date(reorder.at).getTime() <= REORDER_DAYS * 86400000) {
    return { sale_type: 'rep', credited_to: reorder.rep_id,
      reason: `Reorder from their customer (first sale ${reorder.code})` };
  }
  if (lead && lead.sale_type === 'rep' && lead.rep_id) {
    return { sale_type: 'rep', credited_to: lead.rep_id, reason: 'Their own lead' };
  }
  if (lead && lead.sale_type === 'pending') {
    return { sale_type: 'pending', credited_to: lead.rep_id || builder,
      reason: 'The customer named a salesperson; waiting for the owner' };
  }
  return { sale_type: 'shop', credited_to: builder, reason: lead ? 'From a shop lead' : 'Shop customer' };
}

/** The commission rate for a sale: their rate on their own leads, nothing on
 *  the shop's (owner, 2026-10-06: "Commission is only available on profit and
 *  regular wage if no commission sale" — a shop lead is covered by the hourly
 *  wage), nothing while the owner has not decided. */
function rateFor(saleType, { commission_pct = 0 } = {}) {
  if (saleType === 'rep') return Number(commission_pct) || 0;
  return 0;
}

function saleTypeIn(v) {
  return SALE_TYPES[v] ? v : null;
}

/* A found lead may be known only by a social profile (2026-10-13: most
   outreach starts in a DM, with no email or phone yet). Only these hosts are
   accepted, and a profile is compared by host and path, so the same person
   pasted as m.facebook.com/x/ or https://www.facebook.com/x?ref=1 is one
   profile. A bare @handle is turned into a link on the platform picked. */
const PROFILE_HOSTS = ['facebook.com', 'instagram.com', 'tiktok.com', 'x.com', 'twitter.com', 'linkedin.com', 'youtube.com', 'threads.net', 'nextdoor.com'];
const HANDLE_URLS = { Instagram: 'https://www.instagram.com/', TikTok: 'https://www.tiktok.com/@', Facebook: 'https://www.facebook.com/' };

/** A profile link (https on an allowed host) or @handle as a clean URL, or null. */
function profileUrlIn(raw, platform = '') {
  const v = String(raw || '').trim().slice(0, 300);
  const handle = /^@([A-Za-z0-9._]{1,60})$/.exec(v);
  if (handle) return Object.prototype.hasOwnProperty.call(HANDLE_URLS, platform) ? HANDLE_URLS[platform] + handle[1] : null;
  return profileKey(v) ? v : null;
}

/* The path segments that are a person or a business, per host. Anything
   else (a post, reel, group, event, share or watch link) is not a profile:
   two people found through one post must not look like the same person. */
const NOT_A_PROFILE = new Set(['p', 'reel', 'reels', 'tv', 'stories', 'explore', 'groups', 'events', 'share', 'watch',
  'photo', 'photos', 'posts', 'video', 'videos', 'hashtag', 'search', 'login', 'marketplace', 'permalink.php', 'story.php',
  'status', 'i', 'intent', 'home', 'feed', 'jobs', 'shorts', 'results', 'playlist', 'tag', 'discover', 'music', 'pages']);

/** host/handle of an allowed profile link, lower case, for matching; '' if not one. */
function profileKey(url) {
  let u;
  try { u = new URL(String(url || '')); } catch { return ''; }
  if (u.protocol !== 'https:' || u.username || u.password || u.port) return '';
  const host = u.hostname.toLowerCase().replace(/^(www|m|mobile|web)\./, '');
  if (!PROFILE_HOSTS.includes(host)) return '';
  let segs;
  try { segs = decodeURIComponent(u.pathname).toLowerCase().split('/').filter(Boolean); } catch { return ''; }
  if (!segs.length) return '';
  /* profile.php?id= is the one place Facebook keeps who it is in the query. */
  if (host === 'facebook.com' && segs[0] === 'profile.php') {
    const id = u.searchParams.get('id') || '';
    return /^\d+$/.test(id) ? `facebook.com/id:${id}` : '';
  }
  /* LinkedIn and YouTube name a person under a prefix: /in/jane, /company/x, /c/x, /channel/x. */
  if ((host === 'linkedin.com' && ['in', 'company'].includes(segs[0])) || (host === 'youtube.com' && ['c', 'channel', 'user'].includes(segs[0]))) {
    return segs[1] && /^[a-z0-9._-]{1,100}$/.test(segs[1]) ? `${host}/${segs[0]}/${segs[1]}` : '';
  }
  const handle = segs[0].replace(/^@/, '');
  if (NOT_A_PROFILE.has(segs[0]) || !/^[a-z0-9._-]{1,100}$/.test(handle)) return '';
  return `${host}/${handle}`;
}

module.exports = {
  SALE_TYPES, REORDER_DAYS, KNOWN_LEAD_DAYS, HEARD_FROM, PROFILE_HOSTS,
  heardFromIn, matchRep, knownReason, classifyLead, classifyQuote, rateFor, saleTypeIn, profileUrlIn, profileKey,
};
