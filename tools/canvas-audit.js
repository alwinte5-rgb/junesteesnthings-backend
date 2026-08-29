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
const { spawnSync } = require('child_process');
const MYSQL = '/usr/local/opt/mysql-client/bin/mysql';

function mysql(url, sql) {
  const u = new URL(url);
  const r = spawnSync(MYSQL, ['-B', '-h', u.hostname, '-P', u.port || '3306',
    '-u', decodeURIComponent(u.username), '--protocol=TCP',
    '--default-character-set=utf8mb4', '-e', sql, u.pathname.replace(/^\//, '') || 'railway'], {
    env: Object.assign({}, process.env, { MYSQL_PWD: decodeURIComponent(u.password) }),
    encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'],
  });
  if (r.status !== 0) throw new Error('mysql exited ' + r.status);
  const lines = r.stdout.trim().split('\n');
  if (lines.length < 2) return [];
  const head = lines[0].split('\t');
  return lines.slice(1).map((l) => Object.fromEntries(l.split('\t').map((v, i) => [head[i], v])));
}

const dec = (b) => { try { return JSON.parse(decodeURIComponent(Buffer.from(b, 'base64').toString('utf8'))); }
  catch { return null; } };

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

  const bad = [], noArt = [], ok = [];
  for (const p of rows) {
    const st = dec(p.stages);
    if (!st || !Object.keys(st).length) { noArt.push({ p, why: 'no stages at all' }); continue; }
    const art = Object.values(st).map((s) => String(s.url || '')).join(' ');
    if (!art.trim()) { noArt.push({ p, why: 'stages carry no artwork url' }); continue; }

    const cls = (CLASSIFY.find(([, re]) => re.test(p.name)) || ['unknown'])[0];
    if (cls === 'unknown') { noArt.push({ p, why: 'cannot tell what garment this is' }); continue; }

    const allowed = OK_ART[cls] || [];
    if (allowed.some((re) => re.test(art))) { ok.push({ p, cls }); continue; }
    bad.push({ p, cls, art: art.replace(/products\//g, '').replace(/\.png/g, '') });
  }

  console.log('CANVAS AUDIT — ' + rows.length + ' active products\n');
  console.log('  ' + ok.length + ' correct · ' + bad.length + ' mismatched · ' + noArt.length + ' unusable\n');

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
