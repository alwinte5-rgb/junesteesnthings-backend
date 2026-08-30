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

/* What the product NAME says the garment is, in the order the tests must run —
   the specific before the general, so "Youth Heavy Blend Hoodie" is a hoodie
   rather than a youth tee, and "Quarter-Zip Sweatshirt" is not a plain tee. */
const CLASSIFY = [
  ['cap',     /\b(cap|hat|beanie|visor|snapback|trucker)\b/i],
  ['bag',     /\b(tote|bag|backpack|duffel|sackpack|drawstring|pack)\b/i],
  ['vest',    /\bvest\b/i],
  ['jacket',  /\b(jacket|anorak|windbreak|soft ?shell|shell)\b/i],
  ['qzip',    /\b(quarter.?zip|1\/4.?zip|half.?zip)\b/i],
  ['hoodie',  /\b(hoodie|hooded|sweatshirt|crewneck|fleece|pullover)\b/i],
  ['polo',    /\bpolo\b/i],
  ['woven',   /\b(twill|oxford|broadcloth|flannel|button|dress shirt|work shirt|scrub|utility)\b/i],
  ['onesie',  /\b(bodysuit|onesie|infant)\b/i],
  ['kids',    /\b(youth|toddler|baby)\b/i],
  ['tank',    /\btank\b/i],
  ['longslv', /\blong.?sleeve\b/i],
  ['tee',     /\b(tee|t-shirt|shirt)\b/i],
];

/** Garment class from a product name, or 'unknown' when nothing matches. */
function classify(name) {
  return (CLASSIFY.find(([, re]) => re.test(String(name || ''))) || ['unknown'])[0];
}

/* Decoration roles. One per thing the shop actually sells; the titles are the
   designer's own, matched case-insensitively and on a prefix so a later edit to
   the stitch band in a title does not orphan the role. */
const ROLES = {
  dtf:                 { title: 'Printing',                              exact: true },
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
const DECORATIONS = {
  tee:     ['dtf', 'screen', ...EMB_FULL],
  longslv: ['dtf', 'screen', ...EMB_FULL],
  tank:    ['dtf', 'screen', ...EMB_FULL],
  hoodie:  ['dtf', 'screen', ...EMB_FULL],
  qzip:    ['dtf', 'screen', ...EMB_FULL],
  bag:     ['dtf', 'screen', ...EMB_PANEL],
  woven:   ['dtf', ...EMB_FULL],
  polo:    ['dtf', ...EMB_FULL],
  vest:    [...EMB_FULL],
  jacket:  ['dtf', ...EMB_FULL],
  cap:     [...EMB_FRONT_ONLY],
  kids:    ['dtf', 'screen'],
  onesie:  ['dtf', 'screen'],
};

module.exports = { CLASSIFY, classify, ROLES, DECORATIONS, EMB_FULL, EMB_FRONT_ONLY, EMB_PANEL };
