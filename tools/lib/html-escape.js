'use strict';
/* One HTML escaper for text and attribute values: & < > " '. New code
 * requires this rather than writing its own (several older modules still
 * carry partial copies that skip quotes; leave those until they are touched). */
const escHtml = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
  .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

module.exports = { escHtml };
