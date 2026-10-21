'use strict';

/* The flat-priced services on the quote form (design fees, folding, the
 * garment sourcing fee), written into the catalogue by tools/add-services.js.
 * The printed-product pages (tools/occasion-pages.js) show the design fees
 * from this same list, so a page never quotes a fee the quote form does not
 * charge. Prices are the owner's (2026-10-14 to 2026-10-20). */

const SERVICES = [
  /* No minimum: the quote engine cannot enforce one on a flat price, and a
     minimum written only in the name is one nobody is held to. */
  { name: 'Trifold Brochure Folding (per brochure)', price: '0.10',
    description: 'Folding flat trifold brochures in house, per brochure. Not needed when ' +
      'the printer delivers them folded.' },
  { name: 'Brochure Design — Trifold, New', price: '350.00',
    description: 'A new trifold brochure designed from scratch, both sides.' },
  { name: 'Brochure Design — Revision', price: '150.00',
    description: 'Updating an existing brochure: new prices, wording and specials.' },
  { name: 'Business Card Design — New (front + back)', price: '95.00',
    description: 'A new two-sided business card design.' },
  { name: 'Business Card Design — Revision', price: '45.00',
    description: 'Updating an existing business card.' },
  { name: 'TV Screen Design — New (per screen)', price: '95.00',
    description: 'A new menu or promo design for one TV screen.' },
  { name: 'TV Screen Design — Revision (per screen)', price: '40.00',
    description: 'Updating an existing TV screen design, per screen.' },
  /* Design work for the SinaLite items (owner's prices, 2026-10-15; labels and stickers $25 flat, owner 2026-10-20). Mugs,
     tumblers, bottles, canvas and X-frames take the general design tiers on
     the quote form (tweak / setup / commission) instead of a service of
     their own. */
  { name: 'Calendar Design — New (13 pages)', price: '250.00',
    description: 'A new wall calendar laid out from your photos and dates: cover plus twelve months.' },
  { name: 'Calendar Design — Revision', price: '75.00',
    description: 'Updating an existing calendar: new year, dates, photos or wording.' },
  { name: 'Label or Sticker Design — New', price: '25.00', retired: true,
    description: 'A new product label or sticker design, set up for the cut shape.' },
  { name: 'Label or Sticker Design — Revision', price: '25.00', retired: true,
    description: 'Updating an existing label or sticker.' },
  { name: 'Pouch Design — New', price: '150.00',
    description: 'A new stand-up or lay-flat pouch design, front and back, laid out on the printer\'s template.' },
  { name: 'Pouch Design — Revision', price: '60.00',
    description: 'Updating an existing pouch design.' },
  { name: 'Table Cover Design — New', price: '95.00',
    description: 'A new table cover design laid out on the printer\'s full-cover template (top, front and ends).' },
  { name: 'Table Cover Design — Revision', price: '45.00',
    description: 'Updating an existing table cover design.' },
  /* Outsourced print, priced by the owner's rule (2026-10-14): supplier cost
     x2, plus shipping at cost + $25 rounded up to $5 (never marked up),
     divided by the run and rounded up to the cent. The price is only right
     for the run in the name, so the run is in the name.
     SinaLite 3,000 trifold: $274.17 x2 = $548.34 + ($106.62 + $25 -> $135)
     = $683.34 / 3,000 = $0.228 -> $0.23. */
  { name: 'Trifold Brochures 8.5x11, folded — 3,000 run (per brochure)', price: '0.23',
    description: '8.5 x 11 trifold brochures, 100lb gloss text, full color both sides, ' +
      'folded, shipping included. Printed by SinaLite. Price is for a 3,000 run only.' },
  /* Owner, 2026-10-20: customers took the garment research and spec sheets
     and bought elsewhere ("I've made at least 10 of these"). Paid up front
     (under $100, so the quote page asks for it in full) and taken off their
     order with the quote's discount fields if they order within 30 days. */
  { name: 'Garment Sourcing — options + spec sheet', price: '25.00',
    description: 'We research garments for your project: options that fit your budget, ' +
      'fabric and fit details, colors, size charts and supplier pricing, on a spec sheet ' +
      'with photos. The $25 comes off your order if you order with us within 30 days.' },
];

/* retired: off the quote form (owner, 2026-10-21: "you can remove the sticker
   design fee" — stickers are easy setup). The row stays, retagged
   supplier='service-retired', because saved quotes cite it by id; the
   catalogue feed publishes inactive rows only for 'service'. */

/** One service by its exact name, or an error naming it: a page that cites a
 *  fee that was renamed or removed must fail its build, not show $undefined. */
function service(name) {
  const s = SERVICES.find((x) => x.name === name);
  if (!s) throw new Error('no service named "' + name + '" in tools/lib/services.js');
  return s;
}

module.exports = { SERVICES, service };
