/* The rule that a quantity tier table cannot express: a minimum order quantity.
 *
 * Both pricing engines (core/assets/js/app.js and core/cart.php) walk a method's
 * quantity bands expecting the price to fall, and CLAMP a quantity below the
 * first band up into it. So the cheapest row silently becomes the price for any
 * quantity under it. That is not a bug in the walk — bands are ceilings and the
 * walk is correct — it is that a minimum is simply not expressible there.
 *
 * The engines each implement the rule in their own language because one runs in
 * a browser and one in PHP. This module is the single place it is SPECIFIED and
 * tested, so the two implementations have something to agree with rather than
 * only with each other.
 */

/** Which band ceiling a quantity actually prices at — clamp included. */
function bandFor(bands, qty) {
  const sorted = [...bands].map(Number).sort((a, b) => a - b);
  let index = -1;
  for (let i = 0; i < sorted.length; i++) if (sorted[i] < qty) index = i;
  /* index+1 is the clamp: with qty below every ceiling, index stays -1 and this
     lands on the FIRST band — the cheapest row, for the smallest order. */
  return sorted[index + 1] !== undefined ? sorted[index + 1] : sorted[index];
}

/** A method's declared minimum, or 0. Read from its own `calculate` blob. */
function minQty(method) {
  const c = method && method.calculate;
  return c && c.min_qty ? parseInt(c.min_qty, 10) : 0;
}

/**
 * The method an order of `qty` should actually be priced with.
 *
 * `methods` is the product's OWN allowed list, in its own order, so a garment
 * that cannot take DTF still lands on something it allows rather than on a
 * hardcoded id. Returns the original when it qualifies, the first qualifying
 * alternative when it does not, and null when the product allows nothing at
 * this quantity — which the caller must treat as "do not sell below cost",
 * never as "free decoration".
 */
function effectiveMethod(methods, chosenId, qty) {
  const chosen = methods.find((m) => String(m.id) === String(chosenId));
  if (!chosen) return null;

  const min = minQty(chosen);
  if (!min || qty >= min) return chosen;

  return methods.find((m) =>
    String(m.id) !== String(chosen.id) && (minQty(m) === 0 || qty >= minQty(m))) || null;
}

/**
 * A minimum ABOVE the first band ceiling would leave quantities between the two
 * still clamping — a fix that reads as applied and is not. Guard before writing.
 */
function minimumIsExpressible(bands, min) {
  const first = [...bands].map(Number).sort((a, b) => a - b)[0];
  return !Number.isFinite(first) || min <= first;
}

module.exports = { bandFor, minQty, effectiveMethod, minimumIsExpressible };
