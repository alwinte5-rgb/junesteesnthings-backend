/* Long sleeves for the quote form, 2026-11-05 (owner: "there are not enough
 * long sleeve options in the quote form ... The only options are around $20.
 * We can add to the designer later but I need them in the quote form now").
 *
 * The everyday range, budget to premium, plus the 50/50 for uniforms
 * (Blends = worn on the job) and a performance poly. Rows are [style, TYPES
 * key, brand, name] as in ssa-add-products.js WANTED. Added with --staged:
 * quote form only until tools/publish-staged.js finds the designer canvas
 * ready. A style S&S cannot price is skipped by the tool, never guessed.
 */
module.exports = [
  ['5400',  'longslv', 'Gildan',         'Gildan 5400 Heavy Cotton Long Sleeve T-Shirt'],
  ['2400',  'longslv', 'Gildan',         'Gildan 2400 Ultra Cotton Long Sleeve T-Shirt'],
  ['8400',  'longslv', 'Gildan',         'Gildan 8400 DryBlend 50/50 Long Sleeve T-Shirt'],
  ['42400', 'longslv', 'Gildan',         'Gildan 42400 Performance Long Sleeve T-Shirt'],
  ['3501',  'longslv', 'BELLA + CANVAS', 'BELLA + CANVAS 3501 Unisex Jersey Long Sleeve Tee'],
  ['3601',  'longslv', 'Next Level',     'Next Level 3601 Unisex Cotton Long Sleeve T-Shirt'],
  ['5586',  'longslv', 'Hanes',          'Hanes 5586 Essential-T Long Sleeve T-Shirt'],
  ['29LSR', 'longslv', 'JERZEES',        'JERZEES 29LSR Dri-Power 50/50 Long Sleeve T-Shirt'],
  ['4104',  'longslv', 'Badger',         'Badger 4104 B-Core Long Sleeve Performance Tee'],
  ['5400B', 'kidslong', 'Gildan',         'Gildan 5400B Youth Heavy Cotton Long Sleeve T-Shirt'],
];
