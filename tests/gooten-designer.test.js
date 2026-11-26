'use strict';
const test = require('node:test');
const assert = require('node:assert');
const G = require('../tools/lib/gooten');
const GD = require('../tools/lib/gooten-designer');
const { dejson } = require('../tools/lib/db');

/* The live answer for Mug11oz-White-BlackAccent, 2026-11-26 (trimmed). */
const CDN = 'https://az412349.cdn.gooten.com/product-accentmugs/';
const MUG = { Options: [{ Name: 'Single', IsDefault: true, ImageUrl: CDN + 'Preview/Mug_black_PreviewImage.png', Spaces: [{
  Id: 'AADC6', Description: 'Default', FinalX1: 548, FinalY1: 102, FinalX2: 3086, FinalY2: 1047, Layers: [
    { Id: '0C6FD', Type: 'Design', X1: 0, Y1: 0, X2: 3660, Y2: 1200, ZIndex: 0, BackgroundImageUrl: CDN + 'Backgrounds/Accent-Mug_Background.png' },
    { Id: '6C9AC', Type: 'Image', IncludeInPrint: true, X1: 548, Y1: 102, X2: 3086, Y2: 1047, ZIndex: 1 },
    { Id: '6E61E', Type: 'Design', X1: 0, Y1: 0, X2: 3660, Y2: 1200, ZIndex: 2, OverlayImageUrl: CDN + 'Masks/Accent_Mugs-Mask.png' },
    { Id: 'BB771', Type: 'Design', X1: 0, Y1: 0, X2: 3660, Y2: 1200, ZIndex: 3, OverlayImageUrl: CDN + 'Overlays/New/Accent-Mugs_Overlay_Black.png' },
  ] }] }] };

test('sides: the blank under the art, colour overlays on, the mask left off, the print box', () => {
  const [s] = GD.sidesOf(G.templateOptions(MUG));
  assert.strictEqual(s.W, 3660); assert.strictEqual(s.H, 1200);
  assert.strictEqual(s.bg, CDN + 'Backgrounds/Accent-Mug_Background.png');
  assert.deepStrictEqual(s.overlays, [{ url: CDN + 'Overlays/New/Accent-Mugs_Overlay_Black.png', box: { x1: 0, y1: 0, x2: 3660, y2: 1200 } }]);
  const clip = JSON.parse(JSON.stringify(MUG)); clip.Options[0].Spaces[0].Layers[2].OverlayImageUrl = CDN + 'Overlays/Accent_Clip.png';
  assert.strictEqual(GD.sidesOf(G.templateOptions(clip))[0].overlays.length, 1, 'a clip mask is left off too');
  assert.deepStrictEqual(s.print, { x1: 548, y1: 102, x2: 3086, y2: 1047 });
  assert.deepStrictEqual(GD.sidesOf([]), []);
  const noPrint = JSON.parse(JSON.stringify(MUG)); noPrint.Options[0].Spaces[0].Layers[1].IncludeInPrint = false;
  assert.deepStrictEqual(GD.sidesOf(G.templateOptions(noPrint)), [], 'no print box: left out, never guessed');
});

test('stage: edit zone in display pixels from the centre', () => {
  const [s] = GD.sidesOf(G.templateOptions(MUG));
  const st = GD.stageOf(s, 'https://res.cloudinary.com/c/image/upload/x.png');
  const u = 3660 / GD.PRODUCT_WIDTH;
  assert.strictEqual(st.product_width, 500);
  assert.strictEqual(st.product_height, Math.round(1200 / u * 10) / 10);
  assert.strictEqual(st.edit_zone.width, Math.round(2538 / u * 10) / 10);
  assert.strictEqual(st.edit_zone.left, Math.round(((548 + 3086) / 2 - 1830) / u * 10) / 10);
  assert.strictEqual(st.edit_zone.top, Math.round(((102 + 1047) / 2 - 600) / u * 10) / 10);
  assert.strictEqual(st.source, 'uploads'); assert.strictEqual(st.image, 'https://res.cloudinary.com/c/image/upload/x.png');
});

test('pickSkus: one per size, white preferred, colour ignored, labels name only what differs', () => {
  const rows = [
    { sku: 'M11-Black', options: 'Size: 11 oz, Color: White With Black Accents, Decoration Technique: Dye Sublimation' },
    { sku: 'M11-White', options: 'Color: White, Size: 11 oz, Decoration Technique: Dye Sublimation' },
    { sku: 'M15-Black', options: 'Size: 15 oz, Color: Black' },
  ];
  const { total, picked } = GD.pickSkus(rows);
  assert.strictEqual(total, 2);
  assert.deepStrictEqual(picked.map((g) => [g.sku, g.label]), [['M11-White', '11 oz'], ['M15-Black', '15 oz']]);
  assert.deepStrictEqual(picked[0].skus, ['M11-White', 'M11-Black'], 'the other colour is the fallback');
  assert.strictEqual(GD.pickSkus(rows, 1).picked.length, 1);
  assert.deepStrictEqual(GD.pickSkus([{ sku: 'A', options: 'Color: Red' }]).picked.map((g) => g.label), ['Standard']);
});

test('product columns: one template = plain stages; several = a Template choice whose variations swap stages', () => {
  const st = (n) => ({ front: { label: 'F' + n } });
  const one = GD.productColumns({ name: 'Mugs', choices: [{ label: '11 oz', stages: st(1) }] });
  assert.strictEqual(one.name, 'Mugs (Gooten blank)');
  assert.deepStrictEqual(dejson(one.stages), st(1)); assert.deepStrictEqual(dejson(one.attributes), {}); assert.strictEqual(one.variations, '');
  const two = GD.productColumns({ name: 'Mugs', choices: [{ label: '11 oz', stages: st(1) }, { label: '15 oz', stages: st(2) }] });
  const a = dejson(two.attributes), v = dejson(two.variations);
  assert.deepStrictEqual(a.GTPL.values.options.map((o) => [o.value, o.title, o.default]), [['t1', '11 oz', true], ['t2', '15 oz', false]]);
  assert.deepStrictEqual(v.default, { GTPL: 't1' });
  assert.deepStrictEqual(v.variations['2'].conditions, { GTPL: 't2' });
  assert.deepStrictEqual(v.variations['2'].stages, st(2)); assert.strictEqual(v.variations['2'].cfgstages, true);
  assert.throws(() => GD.productColumns({ name: 'x', choices: [] }));
});

test('upsert SQL: by Gooten id, hidden, never another supplier, quoted', () => {
  const cols = GD.productColumns({ name: "Kid's Mug", choices: [{ label: 'x', stages: { front: {} } }] });
  const sql = GD.upsertSql(42, cols, { thumb: 'https://res.cloudinary.com/c/image/upload/t.png', description: "it's", author: 'a' });
  assert.match(sql, /UPDATE lumise_products SET [^;]* WHERE supplier='gooten' AND supplier_style_id=42;/);
  assert.match(sql, /NOT EXISTS \(SELECT 1 FROM \(SELECT id FROM lumise_products WHERE supplier='gooten' AND supplier_style_id=42\) AS t\);/);
  assert.match(sql, /990, 0, 'a', NOW\(\), NOW\(\), 'gooten', 42, 0/, 'active=0');
  assert.ok(sql.includes("Kid\\'s Mug (Gooten blank)") && sql.includes("it\\'s"));
  assert.throws(() => GD.upsertSql('1; DROP', cols, { thumb: '', description: '', author: '' }));
  const kept = GD.upsertSql(42, cols, { thumb: 't', description: 'd', author: 'a', keepName: true });
  assert.doesNotMatch(kept.split('\n').find((l) => l.startsWith('UPDATE')), /name=/, 'a catalog outage keeps the name');
  assert.strictEqual(Array.from(GD.productColumns({ name: 'x'.repeat(199) + '😀', choices: [{ label: 'x', stages: {} }] }).name).length, 200);
});

test('store: only Gooten hosts are fetched; overlays placed in their boxes; the write is read back', async () => {
  const calls = [];
  const cloudinary = { uploader: { upload: async (src, o) => { calls.push([src, o]); return { public_id: o.public_id, width: 2745, secure_url: `https://res.cloudinary.com/c/image/upload/v1/${o.public_id}.png` }; } } };
  const db = []; let rows = [];
  const mysql = async (url, sql, o) => { db.push(sql); if (/^SELECT author, COUNT/.test(sql)) return [{ author: 'a' }]; if (/^SELECT id, MD5/.test(sql)) return rows; return null; };
  const store = GD.designerStore({ cloudinary, mysql, url: 'mysql://x', cloudReady: true });
  assert.strictEqual(store.ready(), true);
  assert.strictEqual(GD.designerStore({ cloudinary, mysql, url: '', cloudReady: true }).ready(), false);
  const side = { W: 3660, H: 1200, bg: CDN + 'bg.png', overlays: [{ url: CDN + 'ov.png', box: { x1: 100, y1: 40, x2: 1930, y2: 640 } }] };
  const out = await store.picture('gooten-blanks/7-abc', side);
  assert.strictEqual(out, 'https://res.cloudinary.com/c/image/upload/c_limit,w_1600/v1/gooten-blanks/7-abc.png');
  /* 2745px file on a 3660 canvas: k = 0.75. */
  assert.deepStrictEqual(calls[2][1].transformation, [
    { overlay: 'gooten-blanks:7-abc-o1', width: 1373, height: 450, crop: 'scale' },
    { flags: 'layer_apply', gravity: 'north_west', x: 75, y: 30 }]);
  assert.ok(calls.every(([, o]) => o.overwrite === false));
  const side2 = (u) => ({ W: 10, H: 10, bg: u, overlays: [] });
  await assert.rejects(store.picture('gooten-blanks/7-x', side2('https://evil.example.com/a.png')), /Gooten host/);
  await assert.rejects(store.picture('gooten-blanks/7-x', side2('https://gooten.com.evil.net/a.png')), /Gooten host/);
  await assert.rejects(store.picture('gooten-blanks/7-x', { ...side, overlays: [{ url: 'https://evil.example.com/o.png', box: side.overlays[0].box }] }), /Gooten host/);
  await assert.rejects(store.picture('gooten-blanks/7-x', side2('https://anyone.azureedge.net/a.png')), /Gooten host/);
  const cols = GD.productColumns({ name: 'Mugs', choices: [{ label: 'x', stages: { front: {} } }] });
  const h = require('crypto').createHash('md5').update(cols.stages).digest('hex');
  await assert.rejects(store.save(7, cols, { thumb: 't', description: 'd' }), (e) => /could not be confirmed/.test(e.message) && e.maybeWritten === true);
  rows = [{ id: '501', h }, { id: '502', h }];
  await assert.rejects(store.save(7, cols, { thumb: 't', description: 'd' }), /more than one/);
  rows = [{ id: '501', h }];
  assert.strictEqual(await store.save(7, cols, { thumb: 't', description: 'd' }), 501);
  const w = db.find((x) => x.startsWith('START TRANSACTION;'));
  assert.ok(w === undefined, 'the lock comes first');
  const w2 = db.find((x) => x.startsWith("DO JSON_EXTRACT(IF(GET_LOCK('jt-gooten-blank-7', 20) = 1, '1', 'no lock'), '$');"));
  assert.ok(w2 && /START TRANSACTION;/.test(w2) && /COMMIT;\nDO RELEASE_LOCK\('jt-gooten-blank-7'\);$/.test(w2), 'one transaction under a named lock');
  assert.strictEqual(GD.designerStore({ cloudinary, mysql, url: 'mysql://x', cloudReady: true, client: false }).ready(), false, 'no mysql client: refused before uploads');
  /* This shop's products carry an EMPTY author (the designer's vendor id):
     that is a real value and must be accepted, NULL is read as '' too. */
  const authorSql = db.filter((x) => /^SELECT author, COUNT/.test(x));
  assert.ok(authorSql.length && !/author<>''/.test(authorSql[0]) && /author IS NOT NULL GROUP BY author ORDER BY n DESC/.test(authorSql[0]), 'the most common non-NULL author, empty allowed');
  const empty = GD.designerStore({ cloudinary, url: 'mysql://x', cloudReady: true,
    mysql: async (u, sql) => (/^SELECT author, COUNT/.test(sql) ? [{ author: '' }] : /^SELECT id, MD5/.test(sql) ? rows : null) });
  assert.strictEqual(await empty.save(7, cols, { thumb: 't', description: 'd' }), 501);
  const none = GD.designerStore({ cloudinary, url: 'mysql://x', cloudReady: true, mysql: async () => [] });
  await assert.rejects(none.save(7, cols, { thumb: 't', description: 'd' }), /author/);
});

test('masks are told by their own folder or file, and option values may hold commas', () => {
  assert.strictEqual(GD.isMask(CDN + 'Masks/Accent_Mugs-Mask.png'), true);
  assert.strictEqual(GD.isMask(CDN + 'Overlays/Accent_Clip.png'), true);
  assert.strictEqual(GD.isMask('https://az412349.cdn.gooten.com/product-facemasks/Overlays/Black.png'), false);
  assert.deepStrictEqual(GD.optionPairs('Color: Black, White, Size: 11 oz'), [['Color', 'Black, White'], ['Size', '11 oz']]);
});

test('picture ids are stable per picture set and per product', () => {
  assert.strictEqual(GD.pictureId(7, 'a', ['b']), GD.pictureId(7, 'a', ['b']));
  assert.notStrictEqual(GD.pictureId(7, 'a', ['b']), GD.pictureId(7, 'a', []));
  assert.match(GD.pictureId(7, 'a', []), /^gooten-blanks\/7-[0-9a-f]{20}$/);
});

test('Add to designer route: reads the templates, copies pictures, writes, links the editor; refuses cleanly', async () => {
  const O = require('../tools/lib/gooten-orders');
  const routes = {};
  const app = { get: () => {}, post: (p, ...h) => { routes[p] = h[h.length - 1]; } };
  const fetcher = async (u) => {
    u = String(u);
    if (u.includes('catalog.json')) return { status: 200, ok: true, json: async () => ({ 'product-catalog': [{ name: 'Mugs', items: [{ type: 'product', product_id: 186, name: 'Accent Mugs' }] }] }) };
    if (u.includes('producttemplates')) return { status: 200, ok: true, json: async () => MUG };
    return { status: 200, ok: true, json: async () => ({ ProductVariants: [
      { Sku: 'Mug11oz-White-BlackAccent', Options: [{ Name: 'Size', Value: '11 oz' }, { Name: 'Color', Value: 'White With Black Accents' }] },
      { Sku: 'Mug15oz-White-BlackAccent', Options: [{ Name: 'Size', Value: '15 oz' }, { Name: 'Color', Value: 'White With Black Accents' }] }] }) };
  };
  const saved = [];
  let ready = true;
  const designer = { ready: () => ready, picture: async (id) => `https://res.cloudinary.com/c/image/upload/c_limit,w_1600/${id}.png`,
    save: async (pid, cols, meta) => { saved.push([pid, cols, meta]); return 777; } };
  O.registerGooten(app, { pool: {}, requireAdmin: () => {}, adminPage: (t, b) => b, pageHeader: () => '', esc: (s) => String(s), money: String,
    quoteCodeRe: /^[A-Z0-9]+$/, SHIP: {}, ART: {}, PHOTOS: {}, shop: {}, mayUse: () => true,
    env: { GOOTEN_RECIPE_ID: 'r', GOOTEN_PARTNER_BILLING_KEY: 'k' }, fetcher, designer });
  const run = async (body) => { const out = {}; const res = { status(c) { out.status = c; return res; }, send(b) { out.html = b; return res; } }; await routes['/admin/gooten/designer']({ body }, res); return out; };
  let r = await run({ product: '186' });
  assert.strictEqual(r.status, 200);
  assert.match(r.html, /editor\.php\?product_base=777/);
  assert.strictEqual(saved.length, 1); assert.strictEqual(saved[0][0], 186); assert.strictEqual(saved[0][1].name, 'Accent Mugs (Gooten blank)');
  assert.strictEqual(saved[0][2].keepName, false);
  assert.strictEqual(saved[0][1].variations, '', 'the same canvas twice is one choice');
  assert.match(r.html, /1 template/);
  const [sd] = GD.sidesOf(G.templateOptions(MUG));
  assert.strictEqual(dejson(saved[0][1].stages).front.image, `https://res.cloudinary.com/c/image/upload/c_limit,w_1600/${GD.pictureId(186, sd.bg, sd.overlays)}.png`);
  assert.strictEqual((await run({ product: 'x' })).status, 400);
  ready = false;
  r = await run({ product: '186' });
  assert.strictEqual(r.status, 503); assert.strictEqual(saved.length, 1, 'nothing written when the designer is unreachable');
  ready = true;
  designer.save = async () => { throw new Error('boom'); };
  r = await run({ product: '186' });
  assert.strictEqual(r.status, 500); assert.match(r.html, /not written/);
  designer.save = async () => { const e = new Error('boom'); e.maybeWritten = true; throw e; };
  r = await run({ product: '186' });
  assert.match(r.html, /may have been written/);
});

test('mysqlAsync: a refusal carries the MySQL error line (needs a local client; skipped without one)', { skip: !require('../tools/lib/db').MYSQL }, async () => {
  const db = require('../tools/lib/db');
  await assert.rejects(db.mysqlAsync('mysql://u:secret@127.0.0.1:1/x', 'SELECT 1;', { timeoutMs: 8000 }),
    (e) => /^mysql failed: exit \d+: ERROR \d+/.test(e.message) && !e.message.includes('secret'));
});
