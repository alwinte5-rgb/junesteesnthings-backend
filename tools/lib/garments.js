/* What garment a product is, and which decorations that garment can take.
 *
 * The classifier was inlined in tools/canvas-audit.js, which meant every other
 * tool that needed to know "is this a cap?" either guessed or re-typed the list.
 * It lives here so the answer is the same everywhere.
 *
 * Decorations are named by ROLE, not by printing id. The ids in the designer's
 * `printings` table have been renumbered twice already and a hardcoded 8 that
 * silently becomes something else is a wrong price rather than an error, so the
 * caller resolves roles against the live table by title and fails loudly when
 * one is missing.
 */

/* The sizes a product is COSTED and STOCK-CHECKED on.
 *
 * Two tools kept their own copy and they drifted. ssa-add-products learned the
 * hard way that a cap is sized "Adjustable" and a tote "One Size", and that
 * without those a cap reads as having no cost at all and is skipped in silence.
 * ssa-sync never learned it: its copy stayed ['S','M','L','XL'], so every cap,
 * tote and youth garment reported NONE LOCAL — freight the shop cannot pass on
 * — while thousands of them sat in Lockport. That is a buying decision made on
 * a wrong number, from a list that was already correct one file away.
 *
 * Stock is judged on these only: a style with nothing but 4XL in Illinois is
 * not locally stocked for any order a customer will actually place. */
const CORE_SIZES = [
  'S', 'M', 'L', 'XL',
  /* One-size garments — caps, visors, totes, bags. */
  'OSFA', 'One Size', 'OS', 'ADJ', 'Adjustable', 'One Size Fits All', 'OSFM', 'ONE SIZE',
  /* Youth, toddler and infant never carry an adult S/M/L. */
  '2T', '3T', '4T', '5/6', 'XS', 'YXS', 'YS', 'YM', 'YL', '6M', '12M', '18M', '24M',
];

/* What the product NAME says the garment is, in the order the tests must run —
   the specific before the general, so "Youth Heavy Blend Hoodie" is a hoodie
   rather than a youth tee, and "Quarter-Zip Sweatshirt" is not a plain tee. */
const CLASSIFY = [
  /* Before 'woven': the RP144 is an "Annex Oxford Bib Apron", and "Oxford"
     made it a shirt — sold as one until the 2026-10-19 audit (#143). */
  ['apron',   /\bapron\b/i],
  ['cap',     /\b(cap|hat|beanie|visor|snapback|trucker)\b/i],
  ['bag',     /\b(tote|bag|backpack|duffel|sackpack|drawstring|pack)\b/i],
  ['vest',    /\bvest\b/i],
  ['jacket',  /\b(jacket|anorak|windbreak|soft ?shell|shell)\b/i],
  ['qzip',    /\b(quarter.?zip|1\/4.?zip|half.?zip)\b/i],
  ['hoodie',  /\b(hoodie|hooded|sweatshirt|crewneck|fleece|pullover)\b/i],
  ['polo',    /\bpolo\b/i],
  ['woven',   /\b(twill|oxford|broadcloth|flannel|button|dress shirt|work shirt|scrub|utility|shoreline)\b/i],
  ['onesie',  /\b(bodysuit|onesie|infant)\b/i],
  ['kids',    /\b(youth|toddler|baby)\b/i],
  /* A muscle tee has no sleeves: drawn and placed as a tank (owner, 2026-10-19:
     "tank is in designer as tshirt", #365). */
  ['tank',    /\b(tank|muscle)\b/i],
  ['longslv', /\blong.?sleeve\b/i],
  ['tee',     /\b(tee|t-shirt|shirt)\b/i],
];

/** Garment class from a product name, or 'unknown' when nothing matches. */
function classify(name) {
  return (CLASSIFY.find(([, re]) => re.test(String(name || ''))) || ['unknown'])[0];
}

/* A class is a FAMILY; inside it the cut can still be wrong.
 *
 * The designer has exactly one headwear image, so a cuffed beanie, a visor, a
 * bucket hat and a mesh-back trucker are every one of them drawn as a
 * structured six-panel cap. The catalogue photo is the real garment, so the
 * shop page looks right and only the design canvas lies — which is the half the
 * customer is looking at while they decide.
 *
 * classify() calls all of those 'cap' and is right to: they take the same print
 * area and the same decorations. This is the second question — does the
 * designer own a picture of THIS garment, or is it borrowing one? */
const SUBTYPE = [
  ['beanie',     /\b(beanie|knit cap|cuffed|skully)\b/i],
  ['visor',      /\bvisor\b/i],
  ['bucket',     /\b(bucket|booney)\b/i],
  ['trucker',    /\b(trucker|mesh)\b/i],
  /* Before 'structured', so "Unstructured Five-Panel" is read as the soft cap
     it is rather than matching the word inside its own negation. */
  ['dad-hat',    /\b(dad hat|unstructured)\b/i],
  ['cap-structured', /\bstructured\b/i],
  ['duffel',     /\bduffel\b/i],
  ['drawstring', /\b(drawstring|sackpack|cinch|sport ?pack)\b/i],
  ['backpack',   /\b(backpack|rucksack)\b/i],
  ['sling',      /\b(sling|pouch|fanny)\b/i],
];

/** The narrower cut, or null when the class is as specific as it gets. */
function subtype(name) {
  const hit = SUBTYPE.find(([, re]) => re.test(String(name || '')));
  return hit ? hit[0] : null;
}

/* What a garment is drawn on when the designer has no art of its own, and what
 * that stand-in actually looks like. Keyed by subtype first, then class.
 *
 * Empty out an entry as soon as real art lands in core/raws/products — the
 * audit reads this to decide what to report, so a stale entry here is the
 * difference between "we know" and "we forgot". */
const STANDIN = {
  /* hat.png is an UNSTRUCTURED, curved-bill dad hat. That makes the dad hats
     correct and everything else in headwear a borrower — the opposite of what
     this table said when it was written from the product names alone. Checked
     against the file, not guessed. */
  beanie:            'a curved-bill dad hat — not a knit beanie at all',
  visor:             'a full-crown dad hat, where this has no crown',
  bucket:            'a curved-bill dad hat, not an all-round brim',
  trucker:           'a solid-back dad hat, with no mesh panels',
  'cap-structured':  'an unstructured dad hat, soft crown and curved bill',
  duffel:            'a flat tote',
  drawstring:        'a flat tote',
  backpack:          'a flat tote',
  sling:             'a flat tote',
  vest:              'a sweatshirt, sleeves and all',
  jacket:            'a sweatshirt',
  qzip:              'a plain sweatshirt, with no placket or zip',
  /* premium_front.png is a WOMEN'S CREW-NECK TEE, so every button-down, work
     shirt and scrub top is drawn as one. */
  woven:             "a women's crew-neck tee — no collar, placket or buttons",
};

/** What this product is really drawn as, or null when the art is its own. */
function standin(name) {
  const st = subtype(name);
  if (st && STANDIN[st]) return { as: st, looks: STANDIN[st] };
  const cls = classify(name);
  if (STANDIN[cls]) return { as: cls, looks: STANDIN[cls] };
  return null;
}

/* Decoration roles. One per thing the shop actually sells; the titles are the
   designer's own, matched case-insensitively and on a prefix so a later edit to
   the stitch band in a title does not orphan the role. */
const ROLES = {
  /* "DTF Printing", not "Printing". tools/rename-dtf-method.js retitled method
     #1 on the grounds that only ids are keyed off, not titles — but THIS map is
     keyed off the title, and an exact match on the old name stopped resolving
     the moment that ran. Nothing failed loudly: decorations-2026.js refuses to
     run at all when a role is unresolved, so the catalogue sweep simply stopped
     being runnable, and every product added afterwards kept the stale hardcoded
     decoration ids it was created with. If this method is ever retitled again,
     change it here in the same commit. */
  dtf:                 { title: 'DTF Printing',                          exact: true },
  /* Created by tools/add-dtf-oversized.js (2026-10-17). OPTIONAL: until that
     tool has run there is no such method, and nothing else should stop for it. */
  'dtf:oversized':     { title: 'DTF Printing — Oversized (up to 252 sq in)', exact: true },
  screen:              { title: 'Screen Printing',                       exact: true },
  'emb:name-chest':    { title: 'Embroidery — Name/Text (chest)',        exact: true },
  'emb:name-upperback':{ title: 'Embroidery — Name/Text (upper back)',   exact: true },
  'emb:small':         { title: 'Embroidery — Small Logo' },
  'emb:medium':        { title: 'Embroidery — Medium Logo' },
  'emb:large':         { title: 'Embroidery — Large Logo' },
  'emb:xl':            { title: 'Embroidery — Extra Large Logo' },
  'emb:fullback':      { title: 'Embroidery — Full Back' },
};

/* Embroidery placements by what the garment physically has.
   FULL is every placement; a cap has no back panel to hoop and a tote has no
   upper back, so offering those there is offering something the shop refuses. */
const EMB_FULL = ['emb:name-chest', 'emb:small', 'emb:medium', 'emb:large',
  'emb:xl', 'emb:fullback', 'emb:name-upperback'];
const EMB_FRONT_ONLY = ['emb:name-chest', 'emb:small', 'emb:medium'];
const EMB_PANEL = ['emb:name-chest', 'emb:small', 'emb:medium', 'emb:large', 'emb:xl'];

/* Which decorations each garment class can take.
 *
 * These are the same choices tools/ssa-add-products.js already encodes in its
 * TYPES map — polos and premium wovens print DTF and embroider but are not
 * screened, caps embroider only, kids and infant bodysuits print but are not
 * embroidered — with the seven per-colour screen-print rows replaced by the one
 * `color`-type method and the single embroidery row expanded to the placements
 * the garment actually has.
 *
 * Screen printing is absent from polos, vests and jackets on purpose: a screen
 * needs a flat panel and a platen, and a placket, zip or quilted shell has
 * neither. An infant bodysuit is not hooped — the garment is smaller than the
 * hoop and the stitching sits against a baby's skin.
 */
/* 'dtf:oversized' (a print up to 252 sq in, a 12" x 18" full back) only on
   adult garments with a back that size: not bags, kids' sizes or caps. */
const DECORATIONS = {
  tee:     ['dtf', 'dtf:oversized', 'screen', ...EMB_FULL],
  longslv: ['dtf', 'dtf:oversized', 'screen', ...EMB_FULL],
  tank:    ['dtf', 'dtf:oversized', 'screen', ...EMB_FULL],
  hoodie:  ['dtf', 'dtf:oversized', 'screen', ...EMB_FULL],
  qzip:    ['dtf', 'dtf:oversized', 'screen', ...EMB_FULL],
  bag:     ['dtf', 'screen', ...EMB_PANEL],
  /* Owner, 2026-10-20: DTF and screen printing on every garment but the
     sublimation blanks ("Screen printing should be available across all
     products as well with the minimums in place" — the 50-piece minimum lives
     on the method, tools/screenprint-minimum.js). */
  woven:   ['dtf', 'dtf:oversized', 'screen', ...EMB_FULL],
  polo:    ['dtf', 'dtf:oversized', 'screen', ...EMB_FULL],
  vest:    ['dtf', 'screen', ...EMB_FULL],
  jacket:  ['dtf', 'dtf:oversized', 'screen', ...EMB_FULL],
  cap:     ['dtf', 'screen', ...EMB_FRONT_ONLY],
  /* Decorated as the shirt it was filed as; the class only stops it being
     sold as a shirt. */
  apron:   ['dtf', 'dtf:oversized', 'screen', ...EMB_FULL],
  kids:    ['dtf', 'screen'],
  onesie:  ['dtf', 'screen'],
};

/** Resolve every role above to a live printing id.
 *
 * Lived in tools/decorations-2026.js, which meant the sweep that FIXES a
 * product's decorations and the tool that CREATES one did not share a
 * definition: ssa-add-products.js carried hardcoded ids instead, they were the
 * pre-renumbering ones, and 32 live products were added with retired methods
 * before anyone noticed. Both callers resolve through this now, so a role that
 * stops matching breaks them together and loudly rather than one silently.
 *
 * `methods` is [{ id, title, ... }] straight from lumise_printings. Returns the
 * resolved ids and the roles that matched nothing — the caller decides whether
 * a given absence is fatal.
 */
function resolveRoles(methods) {
  const ids = {}, missing = [];
  for (const [role, spec] of Object.entries(ROLES)) {
    const want = spec.title.toLowerCase();
    const hit = (methods || []).find((m) => {
      const t = String(m.title || '').toLowerCase();
      return spec.exact ? t === want : t.startsWith(want);
    });
    if (hit) ids[role] = Number(hit.id); else missing.push(role);
  }
  return { ids, missing };
}

/* Roles whose method may not exist yet. A caller drops them when missing
   rather than refusing to run. */
const OPTIONAL_ROLES = ['dtf:oversized'];

/* A youth hoodie is a 'hoodie' (the class is about the cut), but its back is
   nowhere near 12" x 18", so it never gets the oversized print. */
const KIDS_SIZE_RE = /\b(youth|toddler|infant|baby|kids?)\b/i;

/** The decoration roles one product can take — DECORATIONS for its class, less
 *  the oversized print on kids' sizes. Every tool that sets a product's
 *  decorations reads this, so they cannot disagree. Null when unclassified. */
function decorationsFor(name) {
  const roles = DECORATIONS[classify(name)];
  if (!roles) return null;
  return KIDS_SIZE_RE.test(String(name || '')) ? roles.filter((r) => r !== 'dtf:oversized') : roles;
}

module.exports = { CORE_SIZES, CLASSIFY, classify, SUBTYPE, subtype, STANDIN, standin, ROLES, DECORATIONS, OPTIONAL_ROLES, decorationsFor, EMB_FULL, EMB_FRONT_ONLY, EMB_PANEL, resolveRoles };
