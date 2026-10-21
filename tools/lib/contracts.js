/* Contract pricing — one customer's agreed prices, picked on the quote form.
 *
 * A contract is a signed price sheet for one reseller printing on garments
 * they send in. It replaces the price list for that customer's DTF lines only
 * while it is picked on the quote, and only for the emails it names, so it
 * cannot be used as a discount on anybody else's job (the save route checks).
 *
 * Ink Theory (owner, 2026-10-21): 60-day agreement, customer's own blanks,
 * DTF front and back, 24 pieces minimum per design. The price is per piece and
 * ALL-IN: the $1.50 own-blanks handling fee is inside it, not added on top.
 * Each month's step is set by the previous month's paid pieces — missing the
 * 200 a month steps the price up, never back to the price list (owner: "then he
 * would just get a new vendor").
 *
 *   prices[size] = [24-49 pieces, 50+ pieces]; a step adds to both.
 *   size 'oversized' when any print on the line is DTF Oversized, else
 *   'standard' (each print up to 12" x 12", chest logo included).
 *
 * Two printed places are in the price. A single print pays the contract price
 * for its size, except a chest logo alone, which pays its own lower list price
 * (owner, 2026-10-21). A third place (a sleeve) adds that print's own
 * additional-location price from the list, as the agreement says extras are
 * quoted with the order.
 *
 * To change prices or add a contract, edit this table: the form, the save
 * route and the customer's page all read it, and tests/contract-pricing.test.js
 * pins the Ink Theory figures to the signed sheet.
 */

const CONTRACTS = [
  {
    id: 'ink-theory',
    name: 'Ink Theory',
    emails: ['ethan.g@inktheoryofficial.com'],
    min_qty: 24,
    big_qty: 50,
    prices: { standard: [12, 11], oversized: [14, 13] },
    steps: [
      { add: 0, label: '200+ pieces last month' },
      { add: 2, label: '100-199 pieces last month (+$2)' },
      { add: 4, label: 'under 100 pieces last month (+$4)' },
    ],
  },
];

const KEY_RE = /^([a-z0-9-]{1,40}):(\d{1,2})$/;

/** The plain figures priceLine() reads for a picked "id:step", or null for
 *  anything that is not a real contract and step. Numbers only, so the same
 *  object can ride into the browser. */
function contractTerms(key) {
  const m = KEY_RE.exec(String(key || ''));
  if (!m) return null;
  const c = CONTRACTS.find((x) => x.id === m[1]);
  const step = c && c.steps[Number(m[2])];
  if (!step) return null;
  const add = (pair) => pair.map((p) => Math.round((p + step.add) * 100) / 100);
  return {
    key: c.id + ':' + Number(m[2]),
    name: c.name,
    min: c.min_qty,
    big: c.big_qty,
    standard: add(c.prices.standard),
    oversized: add(c.prices.oversized),
  };
}

/** May this customer's quote use the contract? Email match, case-insensitive. */
function contractAllowed(key, email) {
  const t = contractTerms(key);
  if (!t) return false;
  const c = CONTRACTS.find((x) => x.id === t.key.split(':')[0]);
  const e = String(email || '').trim().toLowerCase();
  return !!e && c.emails.some((x) => x.toLowerCase() === e);
}

/** Every pickable choice, for the form's dropdown. */
function contractChoices() {
  const out = [];
  for (const c of CONTRACTS) {
    c.steps.forEach((s, i) => out.push({
      key: c.id + ':' + i,
      label: c.name + ' contract — ' + s.label,
      emails: c.emails.map((x) => x.toLowerCase()),
      terms: contractTerms(c.id + ':' + i),
    }));
  }
  return out;
}

module.exports = { CONTRACTS, contractTerms, contractAllowed, contractChoices };
