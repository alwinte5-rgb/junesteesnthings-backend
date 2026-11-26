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
  assert.deepStrictEqual(s.overlays, [CDN + 'Overlays/New/Accent-Mugs_Overlay_Black.png']);
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
});

test('store: only Gooten hosts are fetched; overlays flattened on upload; the write is read back', async () => {
  const calls = [];
  const cloudinary = { uploader: { upload: async (src, o) => { calls.push([src, o]); return { public_id: o.public_id, secure_url: `https://res.cloudinary.com/c/image/upload/v1/${o.public_id}.png` }; } } };
  const db = []; let row = null;
  const mysql = (url, sql, o) => { db.push(sql); if (/^SELECT author/.test(sql)) return [{ author: 'a' }]; if (/^SELECT id, name/.test(sql)) return row ? [row] : []; return null; };
  const store = GD.designerStore({ cloudinary, mysql, url: 'mysql://x', cloudReady: true });
  assert.strictEqual(store.ready(), true);
  assert.strictEqual(GD.designerStore({ cloudinary, mysql, url: '', cloudReady: true }).ready(), false);
  const out = await store.picture('gooten-blanks/7-abc', CDN + 'bg.png', [CDN + 'ov.png']);
  assert.strictEqual(out, 'https://res.cloudinary.com/c/image/upload/c_limit,w_1600/v1/gooten-blanks/7-abc.png');
  assert.deepStrictEqual(calls[1][1].transformation, [{ overlay: 'gooten-blanks:7-abc-o1' }, { flags: 'layer_apply' }]);
  assert.strictEqual(calls[1][1].overwrite, false);
  await assert.rejects(store.picture('gooten-blanks/7-x', 'https://evil.example.com/a.png', []), /Gooten host/);
  await assert.rejects(store.picture('gooten-blanks/7-x', 'https://gooten.com.evil.net/a.png', []), /Gooten host/);
  await assert.rejects(store.picture('gooten-blanks/7-x', 'https://anyone.azureedge.net/a.png', []), /Gooten host/);
  const cols = GD.productColumns({ name: 'Mugs', choices: [{ label: 'x', stages: { front: {} } }] });
  assert.throws(() => store.save(7, cols, { thumb: 't', description: 'd' }), /could not be confirmed/);
  row = { id: '501', name: cols.name };
  assert.strictEqual(store.save(7, cols, { thumb: 't', description: 'd' }), 501);
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
    return { status: 200, ok: true, json: async () => ({ ProductVariants: [{ Sku: 'Mug11oz-White-BlackAccent', Options: [{ Name: 'Size', Value: '11 oz' }, { Name: 'Color', Value: 'White With Black Accents' }] }] }) };
  };
  const saved = [];
  let ready = true;
  const designer = { ready: () => ready, picture: async (id) => `https://res.cloudinary.com/c/image/upload/c_limit,w_1600/${id}.png`,
    save: (pid, cols) => { saved.push([pid, cols]); return 777; } };
  O.registerGooten(app, { pool: {}, requireAdmin: () => {}, adminPage: (t, b) => b, pageHeader: () => '', esc: (s) => String(s), money: String,
    quoteCodeRe: /^[A-Z0-9]+$/, SHIP: {}, ART: {}, PHOTOS: {}, shop: {}, mayUse: () => true,
    env: { GOOTEN_RECIPE_ID: 'r', GOOTEN_PARTNER_BILLING_KEY: 'k' }, fetcher, designer });
  const run = async (body) => { const out = {}; const res = { status(c) { out.status = c; return res; }, send(b) { out.html = b; return res; } }; await routes['/admin/gooten/designer']({ body }, res); return out; };
  let r = await run({ product: '186' });
  assert.strictEqual(r.status, 200);
  assert.match(r.html, /editor\.php\?product_base=777/);
  assert.strictEqual(saved.length, 1); assert.strictEqual(saved[0][0], 186); assert.strictEqual(saved[0][1].name, 'Accent Mugs (Gooten blank)');
  assert.strictEqual(dejson(saved[0][1].stages).front.image, `https://res.cloudinary.com/c/image/upload/c_limit,w_1600/${GD.pictureId(186, CDN + 'Backgrounds/Accent-Mug_Background.png', [CDN + 'Overlays/New/Accent-Mugs_Overlay_Black.png'])}.png`);
  assert.strictEqual((await run({ product: 'x' })).status, 400);
  ready = false;
  r = await run({ product: '186' });
  assert.strictEqual(r.status, 503); assert.strictEqual(saved.length, 1, 'nothing written when the designer is unreachable');
  ready = true;
  designer.save = () => { throw new Error('boom'); };
  r = await run({ product: '186' });
  assert.strictEqual(r.status, 502); assert.match(r.html, /not written/);
});
