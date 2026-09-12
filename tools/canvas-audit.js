#!/usr/bin/env node
/* Audit every active product's DESIGN CANVAS against the garment it actually is.
 *
 *   railway variables --service MySQL --json | node tools/canvas-audit.js
 *
 * WHY THIS EXISTS
 * ---------------
 * Adding products in bulk from a supplier feed gets the catalogue photo, the
 * sizes and the price right automatically — all of that comes from S&S. The one
 * thing it cannot get right is the base artwork the DESIGNER draws under a
 * customer's design, because that art lives in this repo and only exists for
 * the garment types somebody has drawn. A vest added from the feed inherits the
 * closest silhouette, so the shop page looks perfect and the editor puts the
 * logo on a sweatshirt.
 *
 * That failure is invisible from the catalogue, which is exactly why it needs a
 * check rather than an eye. Run it after any bulk product add.
 *
 * `stages` names the base artwork the designer draws under the customer's
 * design. It is not the catalogue photo — that comes from the supplier — so a
 * product can look perfectly right in the shop and still put the design on the
 * wrong silhouette the moment someone opens the editor.
 *
 * Read-only. Prints a verdict per product; writes nothing. */
const { CLASSIFY, standin } = require('./lib/garments');
const { mysql: rawMysql } = require('./lib/db');

/* This tool only ever reads rows. */
const mysql = (url, sql) => rawMysql(url, sql, { rows: true });

const dec = (b) => { try { return JSON.parse(decodeURIComponent(Buffer.from(b, 'base64').toString('utf8'))); }
  catch { return null; } };

/* Which garment a product is comes from tools/lib/garments.js — the same list
   the decoration tool classifies with, so a product cannot be a hoodie to one
   and a tee to the other. */

/* Which base-art files are ACCEPTABLE for each garment class. A tee drawn on
   the women's tee art is fine; a cap drawn on a tee is not. */
const OK_ART = {
  cap:     [/hat/],
  bag:     [/bag/],
  vest:    [/vest/],
  jacket:  [/jacket|windbreak/],
  qzip:    [/hoodie|sweatshirt|premium/],
  hoodie:  [/hoodie|sweatshirt/],
  polo:    [/polo/],
  woven:   [/premium|woven|twill|polo/],
  onesie:  [/onesie|kids_babies/],
  kids:    [/kids_babies|basic_tshirt|onesie/],
  tank:    [/tank/],
  longslv: [/long_sleeve/],
  tee:     [/basic_tshirt|women_tshirt|premium|v_neck/],
};

let buf = '';
process.stdin.on('data', (d) => (buf += d));
process.stdin.on('end', () => {
  const env = JSON.parse(buf);
  const url = env.MYSQL_PUBLIC_URL || env.MYSQL_URL;
  const rows = mysql(url,
    'SELECT id, name, stages, active FROM lumise_products WHERE active=1 ORDER BY id;');

  const bad = [], noArt = [], ok = [], borrowed = [];
  for (const p of rows) {
    const st = dec(p.stages);
    if (!st || !Object.keys(st).length) { noArt.push({ p, why: 'no stages at all' }); continue; }
    const art = Object.values(st).map((s) => String(s.url || '')).join(' ');
    if (!art.trim()) { noArt.push({ p, why: 'stages carry no artwork url' }); continue; }

    const cls = (CLASSIFY.find(([, re]) => re.test(p.name)) || ['unknown'])[0];
    if (cls === 'unknown') { noArt.push({ p, why: 'cannot tell what garment this is' }); continue; }

    const allowed = OK_ART[cls] || [];
    if (allowed.some((re) => re.test(art))) {
      /* The family is right. That is not the same as the garment being right:
         one hat.png stands in for every beanie, visor and trucker, and a vest
         is drawn with sleeves. Reported separately because it is not a
         configuration mistake to fix in SQL — it is artwork that does not
         exist yet. */
      const sub = standin(p.name);
      if (sub) borrowed.push({ p, cls, sub });
      else ok.push({ p, cls });
      continue;
    }
    bad.push({ p, cls, art: art.replace(/products\//g, '').replace(/\.png/g, '') });
  }

  console.log('CANVAS AUDIT — ' + rows.length + ' active products\n');
  console.log('  ' + ok.length + ' correct · ' + borrowed.length + ' stand-in art · ' +
    bad.length + ' mismatched · ' + noArt.length + ' unusable\n');

  if (bad.length) {
    console.log('MISMATCHED — the editor draws the wrong garment (' + bad.length + ')');
    console.log('  id   product                                        is a      drawn on');
    console.log('  ' + '-'.repeat(88));
    for (const b of bad.sort((x, y) => x.cls.localeCompare(y.cls))) {
      console.log('  ' + String(b.p.id).padStart(3) + '  ' + b.p.name.slice(0, 44).padEnd(46) +
        b.cls.padEnd(9) + b.art.slice(0, 40));
    }
    console.log();
  }
  if (borrowed.length) {
    console.log('STAND-IN ART — right print area, wrong garment shape (' + borrowed.length + ')');
    console.log('  The catalogue photo is the real product; only the design canvas is');
    console.log('  wrong, which is the half the customer designs against.\n');
    const by = {};
    for (const b of borrowed) (by[b.sub.as] = by[b.sub.as] || []).push(b);
    for (const k of Object.keys(by).sort()) {
      console.log('  ' + k + ' — drawn as ' + by[k][0].sub.looks + ' (' + by[k].length + ')');
      for (const b of by[k]) {
        console.log('      #' + String(b.p.id).padStart(3) + '  ' + b.p.name.slice(0, 58));
      }
    }
    console.log();
  }
  if (noArt.length) {
    console.log('UNUSABLE (' + noArt.length + ')');
    for (const n of noArt) console.log('  ' + String(n.p.id).padStart(3) + '  ' +
      n.p.name.slice(0, 44).padEnd(46) + n.why);
    console.log();
  }

  const ids = [...bad, ...noArt].map((x) => x.p.id);
  if (ids.length) {
    console.log('To deactivate these for manual review:');
    console.log('  UPDATE lumise_products SET active=0 WHERE id IN (' + ids.join(',') + ');');
  }
  require('fs').writeFileSync(process.argv[2] || 'canvas-bad.json',
    JSON.stringify({ ids, bad: bad.map((b) => ({ id: b.p.id, name: b.p.name, cls: b.cls, art: b.art })),
      noArt: noArt.map((n) => ({ id: n.p.id, name: n.p.name, why: n.why })) }, null, 2));
});
