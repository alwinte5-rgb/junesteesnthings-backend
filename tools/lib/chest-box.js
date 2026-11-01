/* Does the online designer draw the Left chest box on this product's Front?
 *
 * The twin of the designer's lumise.cart.printing.front_chest_ok (app.js) and
 * jt_front_chest_ok (core/cart.php), Phase 2b, lumise-designer #197: the
 * product has a `left_chest` side that uses the front's photo, both sides have
 * a complete box, and it is not a zip or placket garment (`right_chest`).
 *
 * Owner, 2026-10-31: every product that shows the box gets the chest-logo
 * price, youth and toddler items included, so a small chest logo is never
 * charged as a full front. add-dtf-chest-logo.js links by this as well as by
 * the adult-garment role.
 */
const { dejson } = require('./db');

/** The `stages` column, base64(urlencode(json)) or plain JSON, unwrapped from
 *  the {stages: {...}, colors} form some rows carry. */
function sidesOf(raw) {
  if (raw && typeof raw === 'object') return unwrap(raw);
  const s = String(raw == null ? '' : raw);
  if (!s) return null;
  let o = dejson(s.replace(/\\/g, ''));
  if (!o || typeof o !== 'object') { try { o = JSON.parse(s); } catch { o = null; } }
  return o && typeof o === 'object' ? unwrap(o) : null;
}
const unwrap = (o) => (o.stages && typeof o.stages === 'object' && o.stages.front ? o.stages : o);

/** jt-side-photo.php jt_side_photo_base: the photo's file name, no folder, no query. */
const photo = (o) => String((o && (o.image || o.url)) || '').split('?')[0].split('/').pop();

const complete = (z) => !!z && ['width', 'height', 'left', 'top']
  .every((k) => z[k] !== '' && z[k] !== null && z[k] !== undefined && Number.isFinite(Number(z[k])));

function showsChestBox(stagesRaw) {
  const st = sidesOf(stagesRaw);
  const f = st && st.front, l = st && st.left_chest;
  if (!f || !l || st.right_chest !== undefined) return false;
  if (!complete(f.edit_zone) || !complete(l.edit_zone)) return false;
  if (!(Number(f.edit_zone.width) > 0) || !(Number(l.edit_zone.width) > 0) || !(Number(l.edit_zone.height) > 0)) return false;
  const fp = photo(f);
  return fp !== '' && fp === photo(l);
}

module.exports = { showsChestBox, sidesOf };
