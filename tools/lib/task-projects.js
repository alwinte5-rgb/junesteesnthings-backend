'use strict';
/* Projects (owner, 2026-10-22): a campaign or any big piece of work split into
 * steps of about two hours, worked through like a course. Each step is a
 * staff_tasks row (project_id, step_no, starts_on, due_on) carrying the usual
 * brief; a step opens only once the one before it is completed. The project
 * page draws the steps on a timeline, and every campaign carries the same
 * rules (RULES), so each season's work looks and reads the same.
 *
 * The marketing calendar makes one project per coming season for the
 * designer (seasonSteps), replacing the old single "Asset kit" task; Christmas
 * 2026 has its own hand-written steps (CHRISTMAS_2026). */

const fs = require('node:fs');
const path = require('node:path');
const { escHtml } = require('./html-escape');

const DAY = 86400000;
const STEP_MAX = 20;
const TITLE_MAX = 200;

/* The campaign rules, shown at the top of every campaign project and checked
   in each step's "Done when". The words rules are the shop rules every
   customer-facing piece already follows (feedback, 2026-10-16). */
const RULES = [
  { head: 'Products', items: [
    'Only products we sell on jtees.net. Check the shop or the season page first. No gift wrap, no holiday cards.',
    'Lead with what the season page pushes; everything else supports it.',
  ] },
  { head: 'Look', items: [
    "June's Tees pink script logo on every piece. Never stretched or recolored.",
    'Season colors sit on top of the brand: hot pink #E0107A on buttons and the order-by date, black #0D0D12 for dark backgrounds.',
    'One headline font pairing for the whole campaign, on every piece.',
    'A lifestyle photo (people wearing it) for the hero, ads and the first post of each week; a flat product mockup for product posts.',
    'Every printed design shown is one we can print (tees, long sleeves, sweatshirts, hoodies; never knit sweaters), with the customer\'s name, not ours.',
    'Words and the logo stay 100 px from every edge.',
    'Licensed stock or our own photos only. Customer names and faces only with their permission; otherwise crop or blur them.',
  ] },
  { head: 'Words', items: [
    'Turnaround is 7 to 14 business days. Never rush, fast, same-day or 24 hours.',
    'No free shipping, anywhere. Free pickup by appointment is fine.',
    'Visits by appointment only. We are in Lakeview, Chicago.',
    'Phone (773) 900-4592, Instagram @jtees228, website jtees.net only.',
    'Every last-call piece names the last day to order.',
  ] },
  { head: 'Hand-off', items: [
    'Name files <season>-<piece>-<size>, for example xmas26-hero-1920x1080.png.',
    'Attach each step\'s files to that step. June approves and posts; you never post to the shop\'s accounts.',
  ] },
];
const RULES_DONE = 'Checked against the campaign rules at the top of this page';

/* ── Dates (calendar dates as YYYY-MM-DD, worked in UTC) ─────────────────── */

const ymd = (t) => new Date(t).toISOString().slice(0, 10);
/* A real calendar date only: Date.parse rolls 2026-02-31 over to March,
   which Postgres refuses, so the day must come back as written. */
const parse = (s) => {
  const v = String(s || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
  const t = Date.parse(`${v}T00:00:00Z`);
  return Number.isNaN(t) || new Date(t).toISOString().slice(0, 10) !== v ? null : t;
};
/** The date as YYYY-MM-DD when it is a real one, else null. */
const validDate = (s) => (parse(String(s || '').trim()) == null ? null : String(s).trim());
const isWeekend = (t) => [0, 6].includes(new Date(t).getUTCDay());

/** The first Monday-to-Friday day on or after `iso`. */
function workdayOnOrAfter(iso) {
  let t = parse(iso);
  if (t == null) return null;
  while (isWeekend(t)) t += DAY;
  return ymd(t);
}

/** `n` work days after `iso` (Monday to Friday; 0 = the day itself, moved
 *  off a weekend). */
function addWorkDays(iso, n) {
  let t = parse(workdayOnOrAfter(iso));
  if (t == null) return null;
  for (let i = 0; i < n; i++) {
    t += DAY;
    while (isWeekend(t)) t += DAY;
  }
  return ymd(t);
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const short = (iso) => { const t = new Date(parse(iso)); return `${MONTHS[t.getUTCMonth()]} ${t.getUTCDate()}`; };
const withDay = (iso) => { const t = new Date(parse(iso)); return `${WEEKDAYS[t.getUTCDay()]} ${MONTHS[t.getUTCMonth()]} ${t.getUTCDate()}`; };

/* ── The steps ────────────────────────────────────────────────────────────── */

const step = (offset, title, description, how_to, brief) => ({ offset, title, description, how_to, brief });
const res = (label, url) => ({ label, url });
const R = {
  calendar: res('Back office → Marketing calendar', '/admin/marketing-calendar'),
  photos: res("June's Tees Website Photos (Google Drive)", 'https://drive.google.com/drive/folders/1mgbTpvBKWPGftga3R5R-VF5hUJ2vNSvz'),
  cos: res('COS Creator Studio (social posts)', 'https://coscreatorstudio.com'),
  shop: res('The shop on jtees.net', 'https://www.jtees.net/'),
};
const xmasPage = res('Christmas page on jtees.net', 'https://www.jtees.net/occasions/christmas-shirts-chicago.html');

/* Christmas 2026, from the campaign guide written with the owner on
   2026-10-22 ("Print the Magic of Christmas"). Offsets are work days from the
   first step. */
const CHRISTMAS_2026 = {
  key: 'christmas-2026',
  title: 'Christmas 2026: Print the Magic of Christmas',
  summary: 'Everything we need to sell Christmas 2026: matching family shirts first, then photo gifts and party shirts. The campaign launches Sunday, Nov 1 and the last day to order is Tuesday, Nov 24 (closed Nov 25 to 27 for Thanksgiving).',
  first: '2026-10-23',
  key_date: '2026-11-24',
  key_label: 'Last day to order',
  /* The campaign guide written with the owner (also the Word copy she shares). */
  guide: fs.readFileSync(path.join(__dirname, 'guides', 'christmas-2026.md'), 'utf8'),
  steps: [
    step(0, 'Fix the "Christmas at June\'s Tees" logo',
      'Turn your logo into two designs: our seasonal badge, and the fill-in family design we sell.',
      '1. Keep "Christmas at June\'s Tees" as our badge (stickers, packaging, the corner of posts).\n2. Make the fill-in version: "Christmas at the ______\'s" with the year. This is a shirt design customers buy.\n3. Add hot pink #E0107A to the ribbon or the hat trim, so it reads as ours.\n4. Move the Santa hat so the apostrophe in "June\'s" shows.\n5. Fill the gift box with solid color and thicken its lines.\n6. Make a dark-shirt version of each, with a white or cream outline around the red letters.\n7. Export each as SVG or PDF (vector) and a 3000 x 3000 PNG.',
      {
        why: 'No family wants to wear our name, but "Christmas at the Johnsons" is exactly what they order. The badge keeps our name on everything we post; the fill-in design is the product.',
        gives: ['Her yes on the two versions before you go on', 'The logo files in this project\'s Files'],
        done: ['Badge and fill-in versions, each in a light and a dark-shirt version (4 designs)', 'Each as SVG or PDF plus a 3000 x 3000 PNG', 'Apostrophe visible, pink accent added, gift box solid', RULES_DONE],
        proof: 'The 4 designs, attached as vector and PNG.',
        proof_required: true,
        example: 'Fill-in version: "Christmas at the" in gold script, "Johnsons" in the red script with the hat on the last letter, "2026" under it, pink ribbon on the gift box.',
        time: 'About 2 hours',
        resources: [xmasPage],
      }),
    step(1, 'Rebuild the hero image',
      'The campaign hero, 1920 x 1080, with our logo, the headline and a family wearing shirts we can really print.',
      '1. Pick a licensed stock photo of a family or group (or one of ours, with permission).\n2. Put the fill-in design on sweatshirts, long sleeves or tees, never on knit sweaters, with a made-up family name.\n3. Pose or crop so every print can be read; none hidden behind a child or an arm.\n4. Headline "PRINT THE MAGIC" (heavy sans) over "of Christmas" (script), logo top center.\n5. Sub-line: "Matching family shirts, photo gifts and holiday party gear. Made in Lakeview, Chicago."\n6. A hot pink button: "Order by Nov 24".\n7. Keep words and logo 100 px from every edge.',
      {
        why: 'The hero is the first thing people see on the site, the ads and the email. It has to show exactly what they can order.',
        gives: ['Her yes on the hero before you build anything else from it'],
        done: ['One 1920 x 1080 hero with logo, headline, sub-line and button', 'Every printed design visible and printable', 'The photo license or permission note attached', RULES_DONE],
        proof: 'The hero PNG and the photo license.',
        proof_required: true,
        example: 'Four people on a couch by the tree in cream and red crewneck sweatshirts, each reading "Christmas at the Johnsons 2026", headline above, pink "Order by Nov 24" button bottom right.',
        time: 'About 2 hours',
        resources: [xmasPage],
      }),
    step(2, 'Three family shirt designs',
      'Three Christmas family designs customers can pick from in the online designer, each with space for their family name and the year.',
      '1. "Christmas at the ______\'s 2026", from your logo.\n2. A family-name design with each person\'s role (Mom, Dad, Lil Elf...).\n3. A classic red-and-green "[Family name] Christmas 2026" for families who want something simple.\n4. Keep the name and year as separate text pieces so customers can change them.\n5. 1 or 2 ink colors each; check each on a white, a red and a green shirt.',
      {
        why: 'Families who start from a design they like order the same day. A blank shirt makes them think about it, and most never come back.',
        gives: ['Her yes on the three before they go in the designer'],
        done: ['3 designs, each with editable name and year', 'Each checked on a white, a red and a green shirt', 'SVG plus 300 dpi PNG for each', RULES_DONE],
        proof: 'The 3 designs as SVG and PNG.',
        proof_required: true,
        example: 'Role design: big "The Johnsons" across the chest, then a line per shirt: "Head Elf", "Cookie Boss", "Lil Elf".',
        time: 'About 2 hours',
        resources: [xmasPage],
      }),
    step(2, 'Seven flat product mockups',
      'One clean product picture for each thing we push this Christmas, 1080 x 1350.',
      '1. Family shirt set: adult, kid, toddler and onesie side by side.\n2. Photo pillow: a family photo with names and the year, front on (one of our best Christmas sellers).\n3. Office holiday party tee.\n4. Photo socks with a family photo.\n5. Personalized Santa sack with a child\'s name.\n6. Custom glassware: a set of 2 glasses with names.\n7. A holiday saying tee ("I\'m So Good Santa Came Twice").\nPlain background, the print easy to read, logo small in a corner.',
      {
        why: 'The lifestyle photo stops people scrolling; the flat mockup shows them exactly what they get. The posts and the website grid use these.',
        gives: ['The real-order photos in this project\'s Files, as the standard to match'],
        done: ['7 mockups, 1080 x 1350, one per product above', 'Only products we sell', RULES_DONE],
        proof: 'The 7 mockups.',
        proof_required: true,
        example: 'Santa sack flat on a cream background, "Maya" in red script, a little snow, logo bottom left.',
        time: 'About 2 hours',
        resources: [xmasPage, R.shop],
      }),
    step(3, 'Website banner, email header and ad images',
      'The hero cut for the website, the Christmas email and the Facebook and Instagram ads.',
      '1. Website banner: 1920 x 800 desktop and a 1080 x 1080 phone crop.\n2. Email header: 1200 x 600.\n3. Ad images: 1080 x 1080 and 1080 x 1920, with the headline and "Order by Nov 24".\n4. Check each on a phone screen: can you read every word?',
      {
        why: 'The same picture everywhere makes the campaign recognisable; each place crops differently, so each needs its own file.',
        gives: ['Nothing'],
        done: ['Banner (2 sizes), email header and 2 ad images', 'Readable on a phone', RULES_DONE],
        proof: 'The 5 files.',
        proof_required: true,
        example: 'Phone crop: the family centered, headline above, the button under them.',
        time: 'About 2 hours',
        resources: [xmasPage],
      }),
    step(4, 'Nine feed posts',
      'Nine 1080 x 1350 posts with captions for Nov 1 to 16: three a week, one lifestyle and two product posts each week.',
      '1. Week 1 to 3: start each week with a lifestyle post, then two product posts from your mockups.\n2. Caption: what it is, one detail, "Start your design at jtees.net", and 3 to 5 local hashtags.\n3. One trust line in some of them: "Every order gets a proof first." or "No minimum with DTF."\n4. Save them as drafts in COS Creator Studio.',
      {
        why: 'Three posts a week through November keeps Christmas orders coming before the Nov 24 deadline.',
        gives: ['Your COS Creator Studio login'],
        done: ['9 posts with captions, saved as drafts', 'One lifestyle and two product posts each week', RULES_DONE],
        proof: 'The 9 pictures and a screenshot of the drafts.',
        proof_required: true,
        example: '"One family. One photo. Matching shirts. Your names, your year, printed in our Lakeview shop. Start your design at jtees.net #chicagosmallbusiness #familychristmas"',
        time: 'About 2 hours',
        resources: [R.cos],
      }),
    step(5, 'Stories and last-call graphics',
      'Six 1080 x 1920 stories, including a countdown to Nov 24, and the last-call post.',
      '1. Countdown stories: "7 days left", "3 days left", "Last day: today".\n2. Three stories of finished orders (no names or faces without permission).\n3. Last-call post, 1080 x 1350 and 1080 x 1920: "Last day to order for Christmas: Tuesday, Nov 24. We\'re closed Nov 25 to 27 for Thanksgiving."\n4. Leave room at the top and bottom of stories for the app\'s buttons.',
      {
        why: 'Most Christmas orders come in the last week. The countdown is what turns "I\'ll do it later" into an order.',
        gives: ['Nothing'],
        done: ['6 stories and 2 last-call files', 'Nov 24 on every countdown and last-call piece', RULES_DONE],
        proof: 'The 8 files.',
        proof_required: true,
        example: 'Story: "3 DAYS LEFT to order for Christmas", a finished family set in the middle, "Order by Tue Nov 24" and a pink jtees.net sticker.',
        time: 'About 2 hours',
        resources: [R.cos],
      }),
  ],
};

/* The hand-written projects that stand in for a season's generic steps. */
const SEASON_PRESETS = { 'christmas:2026': CHRISTMAS_2026 };

/** The steps for a season of the marketing calendar `e` (datesFor's shape:
 *  id, name, year, page, push, orderBy, ...), seven steps of about two hours. */
function seasonSteps(e, { longDate }) {
  const page = e.page ? res(`${e.name} page on jtees.net`, /^https:/.test(e.page) ? e.page : `https://www.jtees.net${e.page}`) : null;
  const pages = page ? [page] : [];
  const orderBy = longDate(e.orderBy);
  const where = e.page ? `the ${e.name} page` : `the posts (there is no ${e.name} page yet)`;
  const two = (why, done, proof, example, resources) => ({ why, gives: ['Her yes before you go on to the next step'], done: [...done, RULES_DONE], proof, proof_required: true, example, time: 'About 2 hours', resources });
  return [
    step(0, `Plan the ${e.name} campaign`,
      `Pick the headline, the look and the products for ${e.name} ${e.year}. What we push this season: ${e.push}.`,
      `1. Read the campaign rules at the top of this page${e.page ? ` and open ${where}` : ''}.\n2. Write one headline and two supporting lines.\n3. Choose the colors and the headline font pairing.\n4. List the products to show, from what we push; only products we sell.\n5. Make one rough sketch of the hero.\n6. Attach the plan and the sketch, and wait for June's yes.`,
      two(`Everything else in this project is built from this plan. A yes now saves redoing nine pieces later.`,
        ['Headline and two supporting lines', 'Colors, fonts and product list', 'A rough sketch of the hero'],
        'The plan (a page or a picture) and the sketch.', `"${e.name}: made by you, printed by us" with a sketch of a group in matching shirts.`, [...pages, R.calendar])),
    step(1, 'The hero image',
      `The campaign hero, 1920 x 1080: our logo, the headline and people wearing what we sell for ${e.name}.`,
      '1. A licensed stock photo or one of ours (with permission).\n2. Put a design we can print on the garments, with a made-up name, not ours.\n3. Every print readable; logo top center; a hot pink button with the last day to order.\n4. Words and logo 100 px from every edge.',
      two('The hero is the first thing people see on the site, the ads and the email.', ['One 1920 x 1080 hero', 'The photo license or permission note attached'],
        'The hero and the photo license.', 'A group in matching printed tees, the headline above, a pink "Order by" button.', pages)),
    step(2, 'Three customer designs',
      `Three ${e.name} designs customers can pick in the online designer, each with space for their own name or year.`,
      '1. Keep names and years as separate text pieces.\n2. 1 or 2 ink colors each.\n3. Check each on a white, a black and a colored shirt.',
      two('Customers who start from a design they like order the same day.', ['3 designs with editable text', 'SVG plus 300 dpi PNG for each'],
        'The 3 designs as SVG and PNG.', 'A team-name design with the year under it.', pages)),
    step(3, 'Flat product mockups',
      `One clean product picture for each thing we push for ${e.name} (${e.push}), 1080 x 1350, at least four.`,
      '1. Plain background, the print easy to read.\n2. Logo small in a corner.\n3. Only products we sell.',
      two('The posts and the website grid are built from these.', ['At least 4 mockups, one per product we push'],
        'The mockups.', 'A tee flat on a plain background with the design centered.', [...pages, R.shop])),
    step(4, 'Website banner, email header and ad images',
      'The hero cut for the website, the email and the ads.',
      '1. Website banner: 1920 x 800 and a 1080 x 1080 phone crop.\n2. Email header: 1200 x 600.\n3. Ad images: 1080 x 1080 and 1080 x 1920.\n4. Check each on a phone screen.',
      two('Each place crops differently, so each needs its own file.', ['Banner (2 sizes), email header and 2 ad images'],
        'The 5 files.', 'The hero recropped square for phones, headline above the people.', pages)),
    step(5, 'Six feed posts',
      `Six 1080 x 1350 posts with captions, from now to ${orderBy}.`,
      '1. Mix lifestyle and product posts.\n2. Caption: what it is, one detail, "Start your design at jtees.net", 3 to 5 local hashtags.\n3. Save them as drafts in COS Creator Studio.',
      two('Two or three posts a week keeps orders coming before the deadline.', ['6 posts with captions, saved as drafts'],
        'The pictures and a screenshot of the drafts.', '"Matching shirts for the whole crew, printed in Lakeview. Start your design at jtees.net"', [R.cos])),
    step(6, 'Stories and last-call graphics',
      `Four 1080 x 1920 stories with a countdown, and the last-call post for ${orderBy}.`,
      '1. Countdown stories: "7 days left", "3 days left", "Last day: today".\n2. One story of a finished order (no names or faces without permission).\n3. Last-call post, 1080 x 1350 and 1080 x 1920, naming the last day to order.',
      two('Most orders come in the last week; the countdown turns "later" into an order.', ['4 stories and 2 last-call files', `${orderBy} on every countdown and last-call piece`],
        'The 6 files.', `"3 DAYS LEFT to order for ${e.name}" with a finished order in the middle.`, [R.cos])),
  ];
}

/** Dated steps: the first step on `firstIso` (moved off a weekend), each
 *  later one its offset in work days after it; each step starts and is due
 *  the same day (about two hours of work). */
function dateSteps(steps, firstIso) {
  return steps.map((s, i) => {
    const day = addWorkDays(firstIso, Number.isInteger(s.offset) ? s.offset : Number.isInteger(s.day) ? s.day : i);
    return { title: s.title, description: s.description, how_to: s.how_to, brief: s.brief, step_no: i + 1, starts_on: day, due_on: day };
  });
}

/** The project the calendar makes for a season, or null for a season whose
 *  last order day has passed. `now` decides the first step's day: the preset's
 *  own first day, or the next work day when that has gone by. */
function seasonProject(e, { now = new Date(), today: todayIso, longDate }) {
  /* `today` is the shop's own date (Chicago); UTC runs a day ahead every evening. */
  const today = validDate(todayIso) || ymd(now);
  if (ymd(e.orderBy) < today) return null;
  const preset = SEASON_PRESETS[`${e.id}:${e.year}`];
  const next = addWorkDays(today, 1);
  if (preset) {
    const first = preset.first > next ? preset.first : next;
    return { title: preset.title, summary: preset.summary, guide: preset.guide || null, key_date: preset.key_date, key_label: preset.key_label,
      auto_ref: `mcal:${e.id}:${e.year}`, steps: dateSteps(preset.steps, first) };
  }
  return {
    title: `${e.name} ${e.year} campaign`,
    summary: `Everything we need to sell ${e.name} ${e.year}. What we push: ${e.push}. The last day to order is ${longDate(e.orderBy)}.`,
    key_date: ymd(e.orderBy), key_label: 'Last day to order', auto_ref: `mcal:${e.id}:${e.year}`,
    steps: dateSteps(seasonSteps(e, { longDate }), next),
  };
}

/* ── Where each step stands ───────────────────────────────────────────────── */

/** Each step with its state: done, current (the first not completed),
 *  locked (after the current one, not started). A step that was started
 *  out of order stays open. */
function stepStates(steps) {
  const sorted = [...steps].sort((a, b) => (a.step_no || 0) - (b.step_no || 0) || a.id - b.id);
  let current = null;
  return sorted.map((s) => {
    if (s.done_at) return { ...s, state: 'done' };
    if (current == null) { current = s.id; return { ...s, state: 'current' }; }
    return { ...s, state: s.started_at ? 'current' : 'locked' };
  });
}

/** May this step be started now? Only the first step not yet completed. */
function canStart(steps, taskId) {
  const st = stepStates(steps).find((s) => s.id === taskId);
  return !!st && st.state === 'current';
}

/* ── The owner's edits ────────────────────────────────────────────────────── */

/** A step edit from the project page: title and dates, checked. Returns
 *  { ok, step } or { ok: false, error }. */
function shapeStepEdit(body = {}) {
  const title = String(body.title == null ? '' : body.title).replace(/\s+/g, ' ').trim().slice(0, TITLE_MAX);
  const starts = String(body.starts_on || '').trim();
  const due = String(body.due_on || '').trim();
  if (!title) return { ok: false, error: 'Give the step a title.' };
  if (parse(starts) == null || parse(due) == null) return { ok: false, error: 'Pick a start and a due date.' };
  if (due < starts) return { ok: false, error: 'The due date is before the start date.' };
  return { ok: true, step: { title, starts_on: starts, due_on: due } };
}

/* ── The guide ────────────────────────────────────────────────────────────── */

const GUIDE_MAX = 20000;

/** A project's guide (plain markdown) as HTML: ## and ### headings, - and 1.
 *  lists, - [ ] checklists, | tables |, **bold** and https links. Everything
 *  is escaped first; only these marks become tags, so nothing typed or
 *  written by the planner can add markup of its own. */
function guideHtml(md) {
  const text = String(md || '').replace(/\r\n?/g, '\n').slice(0, GUIDE_MAX);
  if (!text.trim()) return '';
  const inline = (raw) => escHtml(raw)
    .replace(/\*\*([^*]{1,300})\*\*/g, '<b>$1</b>')
    .replace(/\[([^\]]{1,200})\]\((https:\/\/[^\s()"'<>]{1,500})\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
  /* Line by line, so a heading, a lead-in line, a list and a table may sit
     together without blank lines between them (the planner does not always
     leave them). Consecutive lines of one kind form one block. */
  const kindOf = (l) => {
    const t = l.trim();
    if (!t) return 'blank';
    if (/^#{1,4}\s+\S/.test(t)) return 'h';
    if (/^\|.*\|$/.test(t)) return 'table';
    if (/^- \[[ xX]\] /.test(t)) return 'check';
    if (/^[-*] /.test(t)) return 'ul';
    if (/^\d+\. /.test(t)) return 'ol';
    return 'p';
  };
  const cells = (l) => l.trim().slice(1, -1).split('|').map((c) => c.trim());
  /* A separator row is cells of three or more dashes (colons allowed); a data
     row of single dashes or blanks is kept. */
  const isSep = (l) => cells(l).every((c) => /^:?-{3,}:?$/.test(c));
  const out = [];
  const lines = text.split('\n');
  for (let i = 0; i < lines.length;) {
    const kind = kindOf(lines[i]);
    if (kind === 'blank') { i += 1; continue; }
    if (kind === 'h') {
      const [, hashes, body] = /^(#{1,4})\s+(.+)$/.exec(lines[i].trim());
      const n = hashes.length <= 2 ? 3 : 4;
      out.push(`<h${n} class="gd-h">${inline(body)}</h${n}>`);
      i += 1;
      continue;
    }
    const group = [];
    while (i < lines.length && kindOf(lines[i]) === kind) { group.push(lines[i].trim()); i += 1; }
    if (kind === 'table') {
      const rows = group.filter((l) => !isSep(l)).map(cells);
      if (!rows.length) continue;
      const [head, ...body] = rows;
      out.push(`<div class="gd-table"><table><thead><tr>${head.map((c) => `<th>${inline(c)}</th>`).join('')}</tr></thead><tbody>${
        body.map((r) => `<tr>${r.map((c) => `<td>${inline(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`);
    } else if (kind === 'check') {
      out.push(`<ul class="gd-check">${group.map((l) => `<li>${/^- \[[xX]\]/.test(l) ? '☑' : '☐'} ${inline(l.replace(/^- \[[ xX]\] /, ''))}</li>`).join('')}</ul>`);
    } else if (kind === 'ul') {
      out.push(`<ul>${group.map((l) => `<li>${inline(l.replace(/^[-*] /, ''))}</li>`).join('')}</ul>`);
    } else if (kind === 'ol') {
      out.push(`<ol>${group.map((l) => `<li>${inline(l.replace(/^\d+\. /, ''))}</li>`).join('')}</ol>`);
    } else {
      out.push(`<p>${group.map(inline).join('<br>')}</p>`);
    }
  }
  return out.join('');
}

/* ── The timeline ─────────────────────────────────────────────────────────── */

/** The project's steps on a time line, as an SVG string: a bar per step from
 *  its start to its due day, done green, the current one pink, overdue red,
 *  the rest grey; today as a dashed line and the key date as a diamond. Every
 *  word is escaped. `compact` draws a short one for My Day (no step names). */
function timelineSvg(project, steps, { today, compact = false } = {}) {
  const rows = stepStates(steps).filter((s) => parse(ymdOf(s.starts_on)) != null && parse(ymdOf(s.due_on)) != null);
  if (!rows.length) return '';
  const key = parse(ymdOf(project.key_date));
  const t0 = Math.min(...rows.map((s) => parse(ymdOf(s.starts_on))));
  const lastDue = Math.max(...rows.map((s) => parse(ymdOf(s.due_on))));
  /* The key date joins the axis only when it is close; a deadline weeks away
     would squeeze the steps into a corner, so it is named at the edge. */
  const keyOnAxis = key != null && key <= lastDue + 10 * DAY;
  const t1 = Math.max(lastDue + DAY, keyOnAxis ? key + DAY : 0);
  const W = 760, left = compact ? 24 : 280, right = W - (compact ? 24 : 80);
  const rowH = compact ? 14 : 30, head = compact ? 28 : 40;
  const H = head + rows.length * rowH + (compact ? 24 : 34);
  const X = (t) => left + (t - t0) / (t1 - t0) * (right - left);
  const tToday = parse(today);
  const span = (t1 - t0) / DAY;
  const step = span > 70 ? 14 : span > 21 ? 7 : span > 8 ? 2 : 1;
  const ticks = [];
  for (let t = t0; t <= t1 - DAY; t += step * DAY) ticks.push(t);
  const color = (s) => {
    if (s.state === 'done') return '#16a34a';
    if (s.state !== 'locked' && ymdOf(s.due_on) < today) return '#dc2626';
    return s.state === 'current' ? '#E0107A' : '#94a3b8';
  };
  const out = [`<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${escHtml(`Timeline: ${project.title}`)}" style="width:100%;height:auto;display:block" font-family="inherit">`];
  for (const t of ticks) {
    out.push(`<line x1="${X(t).toFixed(1)}" x2="${X(t).toFixed(1)}" y1="${head - 8}" y2="${H - 18}" stroke="#eef1f8"/>`);
    out.push(`<text x="${X(t).toFixed(1)}" y="${head - 14}" text-anchor="middle" font-size="${compact ? 10 : 11}" fill="#64748b">${escHtml(short(ymd(t)))}</text>`);
  }
  rows.forEach((s, i) => {
    const y = head + i * rowH + rowH / 2;
    const a = X(parse(ymdOf(s.starts_on))), b = X(parse(ymdOf(s.due_on)) + DAY);
    const c = color(s);
    if (!compact) {
      const label = `${s.step_no || i + 1}. ${s.title}`;
      out.push(`<text x="24" y="${y + 4}" font-size="12.5" fill="${s.state === 'locked' ? '#64748b' : '#0D0D12'}"${s.state === 'current' ? ' font-weight="700"' : ''}>${escHtml(label.length > 38 ? `${label.slice(0, 37)}…` : label)}</text>`);
    }
    out.push(`<a href="#step-${Number(s.id)}"><rect x="${a.toFixed(1)}" y="${y - (compact ? 4 : 7)}" width="${Math.max(6, b - a).toFixed(1)}" height="${compact ? 8 : 14}" rx="${compact ? 4 : 7}" fill="${c}" fill-opacity="${s.state === 'locked' ? 0.35 : 0.85}"><title>${escHtml(`${s.title}: ${withDay(ymdOf(s.due_on))}`)}</title></rect></a>`);
    if (!compact) out.push(`<text x="${(b + 8).toFixed(1)}" y="${y + 4}" font-size="11" fill="#64748b">${escHtml(s.state === 'done' ? 'done' : withDay(ymdOf(s.due_on)))}</text>`);
  });
  if (tToday != null && tToday >= t0 && tToday <= t1) {
    out.push(`<line x1="${X(tToday).toFixed(1)}" x2="${X(tToday).toFixed(1)}" y1="${head - 8}" y2="${H - 18}" stroke="#0E78B8" stroke-width="1.5" stroke-dasharray="4 3"/>`);
    out.push(`<text x="${X(tToday).toFixed(1)}" y="${H - 6}" text-anchor="middle" font-size="11" font-weight="700" fill="#0E78B8">Today</text>`);
  }
  if (key != null) {
    const words = escHtml(`${project.key_label || 'Key date'}: ${withDay(ymdOf(project.key_date))}`);
    const ky = H - 22;
    if (keyOnAxis) {
      const kx = X(key + DAY / 2);
      out.push(`<path d="M${kx.toFixed(1)} ${ky - 7}l7 7l-7 7l-7 -7z" fill="#E0107A"/>`);
      out.push(`<text x="${(kx - 10).toFixed(1)}" y="${ky + 4}" text-anchor="end" font-size="11" font-weight="700" fill="#E0107A">${words}</text>`);
    } else {
      out.push(`<text x="${W - 24}" y="${ky + 4}" text-anchor="end" font-size="11" font-weight="700" fill="#E0107A">${words} →</text>`);
    }
  }
  out.push('</svg>');
  return out.join('');
}

/** A DATE column as YYYY-MM-DD, whether pg gave a string or a Date. */
function ymdOf(v) {
  if (v == null || v === '') return '';
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? '' : ymd(v);
  return String(v).slice(0, 10);
}

module.exports = {
  RULES, RULES_DONE, CHRISTMAS_2026, SEASON_PRESETS, STEP_MAX, TITLE_MAX, GUIDE_MAX, guideHtml,
  addWorkDays, workdayOnOrAfter, validDate, seasonSteps, seasonProject, dateSteps, stepStates, canStart, shapeStepEdit, timelineSvg, ymdOf, withDay,
};
