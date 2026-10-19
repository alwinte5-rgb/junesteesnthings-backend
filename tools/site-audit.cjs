#!/usr/bin/env node
/*
 * What a customer actually sees, checked in a real browser (owner, 2026-10-19:
 * "the color swatches are on the product cards everywhere ... all of the
 * things we added needs to be checked properly").
 *
 *   node tools/site-audit.cjs [--json=<file>] [--products=12,13,...]
 *
 * Read-only. Headless Chrome with its own throwaway profile, on public pages:
 *   - every shop list category and kind: each card with 2+ colours shows a
 *     visible dot row (a row collapsed to 0px once hid every dot), the footer
 *     starts after the list (an uncleared footer once painted behind it), and
 *     the count matches the cards across the pages;
 *   - every live product page: a swatch row with one swatch per colour, and a
 *     click on a swatch with a photo changes the main photo;
 *   - jtees.net pages with product cards (a.pb-card): every card with 2+
 *     colours has dots, and pointing at a dot changes the card photo;
 *   - every Shop menu link answers 200.
 * The data-side checks are tools/catalog-inventory.js.
 */
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const argv = process.argv.slice(2);
const opt = (n) => (argv.find((a) => a.startsWith('--' + n + '=')) || '').split('=').slice(1).join('=');
const D = 'https://design.jtees.net/', W = 'https://www.jtees.net/';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function browser() {
  const prof = fs.mkdtempSync(path.join(os.tmpdir(), 'site-audit-'));
  const port = 9400 + Math.floor(Math.random() * 400);
  const proc = spawn(CHROME, ['--headless=new', '--disable-gpu', '--remote-debugging-port=' + port, '--user-data-dir=' + prof, '--window-size=1440,1800', 'about:blank'], { stdio: 'ignore' });
  let ws;
  for (let i = 0; i < 60 && !ws; i++) {
    try { const p = (await (await fetch('http://127.0.0.1:' + port + '/json')).json()).find((x) => x.type === 'page'); if (p) ws = new WebSocket(p.webSocketDebuggerUrl); } catch { /* starting */ }
    if (!ws) await sleep(250);
  }
  if (!ws) throw new Error('headless Chrome did not start');
  await new Promise((r) => ws.addEventListener('open', r));
  let id = 0; const pend = {};
  ws.addEventListener('message', (e) => { const m = JSON.parse(e.data); if (pend[m.id]) { pend[m.id](m); delete pend[m.id]; } });
  const call = (method, params = {}) => new Promise((r) => { const i = ++id; pend[i] = r; ws.send(JSON.stringify({ id: i, method, params })); });
  await call('Page.enable');
  return {
    async open(url) { await call('Page.navigate', { url }); await sleep(3500); },
    async eval(fn) { const r = await call('Runtime.evaluate', { expression: '(' + fn + ')()', returnByValue: true, awaitPromise: true }); return r.result && r.result.result ? r.result.result.value : { error: JSON.stringify(r.result || r.error).slice(0, 200) }; },
    /* Chrome may still be writing its profile as it exits: cleanup never
       costs the report (a 25-minute run lost its results to ENOTEMPTY). */
    async close() {
      try { ws.close(); } catch { /* gone */ }
      proc.kill(); await sleep(1500);
      try { fs.rmSync(prof, { recursive: true, force: true }); } catch { /* left for the OS to clear */ }
    },
  };
}

/* In-page checks, written as functions so they read like the page code. */
const LIST = () => {
  const cards = [...document.querySelectorAll('.lumise-list ul li')];
  const bad = [];
  for (const li of cards) {
    const n = li.querySelectorAll('.jt-dot').length, row = li.querySelector('.jt-dots');
    const name = (li.querySelector('h3') || {}).textContent || '?';
    if (n >= 2 && (!row || row.getBoundingClientRect().width < 20)) bad.push(name.trim().slice(0, 50) + ': dots not visible');
  }
  const f = document.querySelector('footer.jtf'), last = document.querySelector('.lumise_pagination') || document.querySelector('.lumise-list');
  const footerOk = !f || !last || f.getBoundingClientRect().top + 1 >= last.getBoundingClientRect().bottom;
  const count = parseInt(((document.querySelector('.jt-count') || {}).textContent || '0'), 10);
  const pages = [...document.querySelectorAll('.lumise_pagination a')].map((a) => (a.href.match(/tpage=(\d+)/) || [])[1]).filter(Boolean).map(Number);
  return { cards: cards.length, bad, footerOk, count, lastPage: pages.length ? Math.max(...pages) : 1, bg: getComputedStyle(document.body).backgroundColor };
};
const PRODUCT = () => new Promise((done) => {
  const sw = [...document.querySelectorAll('.jt-swatch')];
  const main = document.querySelector('.jt-prod img, .jt-prod-grid img');
  const withPhoto = sw.filter((b) => b.getAttribute('data-photo'));
  const r = { swatches: sw.length, withPhoto: withPhoto.length, swaps: null, hasMain: !!main, title: (document.querySelector('h1') || {}).textContent || '' };
  if (!withPhoto.length || !main) return done(r);
  const before = main.currentSrc || main.src;
  const pick = withPhoto.find((b) => b.getAttribute('data-photo') !== before) || withPhoto[0];
  pick.click();
  setTimeout(() => { r.swaps = (main.currentSrc || main.src) !== before || (main.src === pick.getAttribute('data-photo')); done(r); }, 400);
});
const PBCARDS = () => new Promise((done) => {
  const cards = [...document.querySelectorAll('a.pb-card')].filter((a) => !a.hidden);
  const out = { cards: cards.length, multi: 0, noDots: [], swap: null };
  let probe = null;
  for (const a of cards) {
    const dots = a.querySelectorAll('.pb-dot');
    const row = a.querySelector('.pb-dots');
    if (dots.length >= 2) { out.multi++; if (!row || row.getBoundingClientRect().width < 20) out.noDots.push(a.href.slice(-30)); if (!probe && a.querySelector('.pb-dot[data-photo]')) probe = a; }
  }
  if (!probe) return done(out);
  const img = probe.querySelector('.pb-im img'), before = img.src, d = probe.querySelector('.pb-dot[data-photo]');
  d.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
  setTimeout(() => { out.swap = img.src !== before; done(out); }, 300);
});

async function main() {
  const b = await browser();
  const report = { list: [], products: [], jtees: [], menu: [] };
  try {
    /* Shop list: every category and kind the dropdown offers, every page. */
    await b.open(D + 'products.php');
    const cats = await b.eval(() => [...document.querySelectorAll('select[name="category_id"] option')].map((o) => o.value).filter(Boolean));
    for (const c of ['', ...cats]) {
      await b.open(D + 'products.php' + (c ? '?category_id=' + c : ''));
      const first = await b.eval(LIST);
      if (first.error) { report.list.push({ category: c || 'all', error: first.error, bad: [] }); process.stdout.write('x'); continue; }
      let cards = first.cards; const bad = [...(first.bad || [])];
      for (let pg = 2; pg <= (first.lastPage || 1); pg++) {
        await b.open(D + 'products.php?' + (c ? 'category_id=' + c + '&' : '') + 'tpage=' + pg);
        const r = await b.eval(LIST);
        if (r.error) { bad.push('page ' + pg + ' did not load: ' + r.error); continue; }
        cards += r.cards; bad.push(...(r.bad || []));
      }
      report.list.push({ category: c || 'all', count: first.count, cards, countOk: !first.count || first.count === cards, footerOk: first.footerOk, bg: first.bg, bad });
      process.stdout.write('.');
    }
    /* Every live product page. */
    /* The shop feed lists every live product; color_count is its true colour count (the dot list stops at 8). */
    const colours = {};
    for (const p of (await (await fetch(W + 'api/shop-feed', { headers: { Accept: 'application/json' } })).json()).products || []) {
      const id = Number((String(p.link || '').match(/product_id=(\d+)/) || [])[1]);
      if (id) colours[id] = Number(p.color_count) || (p.colors || []).length;
    }
    const ids = opt('products') ? opt('products').split(',').map(Number) : Object.keys(colours).map(Number);
    for (const id of ids) {
      await b.open(D + 'product.php?product_id=' + id);
      const r = await b.eval(PRODUCT);
      report.products.push({ id, colours: colours[id], ...r });
      process.stdout.write(',');
    }
    /* jtees.net pages with product cards. */
    const sm = await (await fetch(W + 'sitemap.xml')).text();
    const pages = [W, ...[...sm.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]).filter((u) => u.startsWith(W) && !/\/blog\//.test(u))];
    for (const u of [...new Set(pages)]) {
      await b.open(u);
      const r = await b.eval(PBCARDS);
      if (r && r.cards) report.jtees.push({ url: u, ...r });
      process.stdout.write(':');
    }
    /* Shop menu links. */
    const nav = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'public', 'assets', 'data', 'site-nav.json'), 'utf8'));
    const shop = (nav.menu.find((m) => m.label === 'Shop') || { items: [] }).items;
    const walk = (items) => items.flatMap((it) => [it, ...walk(it.items || [])]);
    for (const it of walk(shop)) {
      const href = it.href.startsWith('/') ? W.replace(/\/$/, '') + it.href : it.href;
      let status = 0; try { status = (await fetch(href, { redirect: 'follow' })).status; } catch { status = -1; }
      report.menu.push({ label: it.label, href, status });
    }
  } finally { await b.close(); }

  const flags = [
    ...report.list.flatMap((l) => [...l.bad.map((x) => 'list ' + l.category + ': ' + x), ...(l.countOk ? [] : ['list ' + l.category + ': says ' + l.count + ', shows ' + l.cards]), ...(l.footerOk ? [] : ['list ' + l.category + ': footer overlaps the list'])]),
    ...report.list.filter((l) => l.error).map((l) => 'list ' + l.category + ': page did not load (' + l.error + ')'),
    ...report.products.flatMap((p) => p.error ? ['product #' + p.id + ': page did not load (' + p.error + ')'] : [
      ...(p.hasMain ? [] : ['product #' + p.id + ': no main photo']),
      /* One swatch per colour; a one-colour product shows no row. */
      ...(p.colours >= 2 && p.swatches !== p.colours ? ['product #' + p.id + ': ' + p.swatches + ' swatches for ' + p.colours + ' colours'] : []),
      ...(p.swaps === false ? ['product #' + p.id + ': swatch click does not change the photo'] : []),
    ]),
    ...report.jtees.flatMap((j) => [...j.noDots.map((x) => 'jtees.net ' + j.url + ': no dots on ' + x), ...(j.swap === false ? ['jtees.net ' + j.url + ': pointing at a dot does not change the photo'] : [])]),
    ...report.menu.filter((m) => m.status !== 200).map((m) => 'menu ' + m.label + ' → ' + m.status),
  ];
  report.flags = flags;
  console.log('\n\nSITE AUDIT — ' + report.list.length + ' shop lists · ' + report.products.length + ' product pages · ' + report.jtees.length + ' jtees.net pages with cards · ' + report.menu.length + ' menu links');
  console.log(flags.length ? flags.map((f) => '  ✗ ' + f).join('\n') : '  ✓ nothing flagged');
  if (opt('json')) fs.writeFileSync(opt('json'), JSON.stringify(report, null, 1));
}

main().catch((e) => { console.error(e.message); process.exit(1); });
