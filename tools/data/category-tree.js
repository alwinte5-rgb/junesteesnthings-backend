/* The shop's category tree (owner, 2026-10-19: "the list needs to tighten and
 * then go deeper"; tree approved as proposed). Groups at the top, each
 * opening into specific garments (Women's added 2026-10-20); style details (garment-dyed, heavyweight,
 * women's fit ...) are filters on the list, not categories.
 *
 * `slug` is the key: existing categories keep theirs (and their ids, so old
 * links keep working) and are renamed or moved under a parent. `match(p)`
 * decides membership from { name, cls } where cls is lib/garments classify().
 * A product is filed under every leaf that matches AND that leaf's parent, so a
 * parent page lists all of its garments. A group with no leaves matches
 * directly. Signs are not filed here: their products are placed by hand.
 */
const YOUTH = /\b(youth|kids?|toddler|infant|baby|bodysuit|onesie)\b/i;
const BABY = /\b(toddler|infant|baby|bodysuit|onesie)\b/i;
/* Women's and ladies' cuts (owner, 2026-10-20: "create a womens category").
   Girls' sizes are Kids & Baby, not here. */
const WOMEN = /\b(women'?s?|ladies'?|womens)\b/i;
const womens = (p) => WOMEN.test(p.name) && !YOUTH.test(p.name) && !/\bgirls?'?\b/i.test(p.name);

module.exports = [
  { slug: 'custom-t-shirts', name: 'T-Shirts', order: 1, leaves: [
    { slug: 'custom-short-sleeve-tees', name: 'Short Sleeve', match: (p) => p.cls === 'tee' },
    { slug: 'custom-long-sleeve-tees', name: 'Long Sleeve', match: (p) => p.cls === 'longslv' },
    { slug: 'custom-tank-tops', name: 'Tanks & Muscle', match: (p) => p.cls === 'tank' },
    { slug: 'custom-oversized-tees', name: 'Oversized & Boxy', match: (p) => ['tee', 'longslv'].includes(p.cls) && /oversiz|boxy/i.test(p.name) },
    { slug: 'custom-cropped-tees', name: 'Cropped', match: (p) => ['tee', 'longslv', 'tank'].includes(p.cls) && /\bcrop/i.test(p.name) },
    { slug: 'custom-v-neck-tees', name: 'V-Neck', match: (p) => /v-?neck/i.test(p.name) && ['tee', 'longslv'].includes(p.cls) },
  ] },
  { slug: 'custom-hoodies-sweatshirts', name: 'Hoodies & Sweatshirts', order: 2, leaves: [
    { slug: 'custom-pullover-hoodies', name: 'Pullover Hoodies', match: (p) => p.cls === 'hoodie' && /hood/i.test(p.name) && !/zip/i.test(p.name) },
    { slug: 'custom-zip-hoodies', name: 'Zip Hoodies', match: (p) => p.cls === 'hoodie' && /zip/i.test(p.name) },
    { slug: 'custom-crewneck-sweatshirts', name: 'Crewnecks', match: (p) => p.cls === 'hoodie' && !/hood|zip/i.test(p.name) },
    { slug: 'custom-quarter-zips', name: 'Quarter-Zips', match: (p) => p.cls === 'qzip' },
  ] },
  { slug: 'custom-business-apparel', name: 'Polos & Workwear', order: 3, match: (p) => p.cls === 'apron', leaves: [
    { slug: 'custom-polos', name: 'Polos', match: (p) => p.cls === 'polo' },
    { slug: 'custom-button-ups', name: 'Button-Ups', match: (p) => p.cls === 'woven' },
    { slug: 'custom-jackets-vests', name: 'Jackets & Vests', match: (p) => p.cls === 'jacket' || p.cls === 'vest' },
  ] },
  { slug: 'custom-womens-apparel', name: "Women's", order: 4, leaves: [
    { slug: 'custom-womens-tees', name: 'T-Shirts', match: (p) => womens(p) && ['tee', 'longslv'].includes(p.cls) },
    { slug: 'custom-womens-tanks', name: 'Tanks', match: (p) => womens(p) && p.cls === 'tank' },
    { slug: 'custom-womens-hoodies', name: 'Hoodies & Sweatshirts', match: (p) => womens(p) && ['hoodie', 'qzip'].includes(p.cls) },
    { slug: 'custom-womens-polos', name: 'Polos & Button-Ups', match: (p) => womens(p) && ['polo', 'woven', 'jacket', 'vest'].includes(p.cls) },
  ] },
  { slug: 'custom-kids-youth-apparel', name: 'Kids & Baby', order: 5, leaves: [
    { slug: 'custom-youth-apparel', name: 'Youth', match: (p) => YOUTH.test(p.name) && !BABY.test(p.name) },
    { slug: 'custom-baby-onesies', name: 'Toddler & Baby', match: (p) => BABY.test(p.name) || p.cls === 'onesie' },
  ] },
  { slug: 'custom-hats-caps', name: 'Hats', order: 6, leaves: [
    { slug: 'custom-beanies', name: 'Beanies', match: (p) => p.cls === 'cap' && /beanie|knit/i.test(p.name) },
    { slug: 'custom-trucker-hats', name: 'Trucker', match: (p) => p.cls === 'cap' && /trucker|mesh/i.test(p.name) && !/beanie/i.test(p.name) },
    { slug: 'custom-dad-hats', name: 'Dad Hats', match: (p) => p.cls === 'cap' && /dad|unstructured|relaxed/i.test(p.name) && !/trucker|beanie/i.test(p.name) },
    { slug: 'custom-caps', name: 'Caps', match: (p) => p.cls === 'cap' && !/beanie|knit|trucker|mesh|dad|unstructured|relaxed/i.test(p.name) },
  ] },
  { slug: 'custom-tote-bags', name: 'Bags & Totes', order: 7, match: (p) => p.cls === 'bag' },
  /* Mugs and tumblers printed in house (owner, 2026-10-23). */
  { slug: 'custom-mugs-drinkware', name: 'Mugs & Drinkware', order: 8, match: (p) => /\b(mugs?|tumblers?)\b/i.test(p.name) },
  /* Signs keep their own categories, moved under one group; filed by hand. */
  { slug: 'custom-signs-displays', name: 'Signs & Displays', order: 9, manual: true,
    adopt: ['custom-banners', 'custom-yard-rigid-signs', 'custom-window-wall-floor-graphics', 'custom-vehicle-graphics-magnets', 'custom-photo-panels-canvas', 'custom-big-head-cutouts'] },
];
