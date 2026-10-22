'use strict';

/* A steady flow of real work for every helper (owner, 2026-10-21: "My helpers
   need consistent work ... one long term task, a medium term task and a short
   term task for variety ... I don't want to just give busy work but effective
   work").

   Each helper holds at most ONE open task in each lane:

     short   done in a shift          (variety, quick wins)
     medium  two to five days         (builds something)
     long    two to six weeks         (moves the business)

   plus the "every day" routine (recurring templates) and whatever the owner or
   the shop adds by hand (no lane), which always come first. When a lane is
   empty the next task in that lane of their role's backlog is handed to them
   at once, so finishing one task is starting the next. The owner fills the
   backlogs once (the starter tasks below are a first set she edits), and is
   told when a lane is running low.

   Every task says which result it moves (sales, conversion, retention or
   capacity) so nothing in a backlog is busy work. Kept apart from the SQL so
   the rules can be tested. */

const LANES = {
  short:  { label: 'Now', hint: 'done in a shift' },
  medium: { label: 'This week', hint: 'two to five days' },
  long:   { label: 'Big project', hint: 'two to six weeks' },
};
const LANE_KEYS = Object.keys(LANES);
/* Recurring tasks sit outside the three lanes: the routine, every work day. */
const DAILY = 'daily';
const REPEATS = ['none', 'daily', 'weekly'];
const GOALS = {
  sales:      'More sales',
  conversion: 'More visitors become customers',
  retention:  'Customers come back',
  capacity:   'Saves June time',
};
/* A lane with fewer than this many tasks waiting is "running low". */
const LOW = 3;
const TITLE_MAX = 200;
const TEXT_MAX = 8000;

const one = (v, max) => String(v == null ? '' : v).replace(/[\r\n\t]+/g, ' ').replace(/\s{2,}/g, ' ').trim().slice(0, max);
const many = (v, max) => String(v == null ? '' : v).replace(/\r\n?/g, '\n').trim().slice(0, max);

/** A backlog task from the owner's form: { template } or { error }. `tracks`
 *  is the list of role keys a template may be for. */
function cleanTemplate(b, tracks) {
  const x = b || {};
  const track = String(x.track || '');
  if (!tracks.includes(track)) return { error: 'Pick who the task is for.' };
  const repeat = REPEATS.includes(String(x.repeat)) ? String(x.repeat) : 'none';
  const lane = repeat === 'none' ? String(x.lane || '') : DAILY;
  if (repeat === 'none' && !LANE_KEYS.includes(lane)) return { error: 'Pick a lane: Now, This week or Big project.' };
  const title = one(x.title, TITLE_MAX);
  if (title.length < 3) return { error: 'A task needs a title.' };
  const goal = Object.hasOwn(GOALS, String(x.goal || '')) ? String(x.goal) : null;
  if (!goal) return { error: 'Say what the task moves: sales, conversion, retention or June\'s time.' };
  const weekday = repeat === 'weekly' ? Number(x.weekday) : null;
  if (repeat === 'weekly' && !(Number.isInteger(weekday) && weekday >= 1 && weekday <= 7)) return { error: 'Pick the day a weekly task comes round.' };
  return { template: { track, lane, repeat, weekday, title, goal,
    description: many(x.description, TEXT_MAX) || null, how_to: many(x.how_to, TEXT_MAX) || null } };
}

/** The lanes a helper has room in: every lane with no open task in it. */
function lanesToFill(openLanes) {
  const busy = new Set((openLanes || []).map(String));
  return LANE_KEYS.filter((l) => !busy.has(l));
}

/** Does a recurring template make a task on this day? `weekday` is 1 (Mon) to
 *  7 (Sun) in the helper's own time zone; `workday` whether they work today
 *  (a shift on their schedule, or Monday to Friday when they have none). A
 *  weekly task comes on its day only if that is a work day. */
function recurringDue(t, weekday, workday) {
  if (!t || !workday) return false;
  if (t.repeat === 'daily') return true;
  if (t.repeat === 'weekly') return Number(t.weekday) === Number(weekday);
  return false;
}

/** Whether a helper works on a day: a shift that day, or, with no shifts on
 *  their schedule at all, Monday to Friday. */
function isWorkday(weekday, shiftDays, hasShifts) {
  if (hasShifts) return (shiftDays || []).map(Number).includes(Number(weekday));
  return Number(weekday) >= 1 && Number(weekday) <= 5;
}

/** The lanes running low, for roles someone works in: [{ track, lane, n }].
 *  `waiting` maps "track:lane" to the tasks still waiting in that backlog. */
function lowLanes(waiting, tracks) {
  const out = [];
  for (const track of tracks) {
    for (const lane of LANE_KEYS) {
      const n = Number((waiting || {})[`${track}:${lane}`]) || 0;
      if (n < LOW) out.push({ track, lane, n });
    }
  }
  return out;
}

/** The ISO week a date falls in, "2026-W43": one low-backlog alert a week. */
function isoWeek(d) {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const y = t.getUTCFullYear();
  const wk = Math.ceil(((t - Date.UTC(y, 0, 1)) / 86400000 + 1) / 7);
  return `${y}-W${String(wk).padStart(2, '0')}`;
}

/* The first backlog for each role, from the owner's plan (2026-10-21). They
   are ordinary backlog rows once added: the owner edits, reorders or archives
   them on Tasks → Backlog. Nothing here promises a customer anything. */
const t = (lane, goal, title, description, how_to, extra) => ({ lane, goal, title, description, how_to, repeat: 'none', weekday: null, ...extra });
const daily = (goal, title, description, how_to) => ({ lane: DAILY, goal, title, description, how_to, repeat: 'daily', weekday: null });
const weekly = (weekday, goal, title, description, how_to) => ({ lane: DAILY, goal, title, description, how_to, repeat: 'weekly', weekday });

const STARTERS = {
  design: [
    t('long', 'sales', 'Premade design library: sports teams',
      'Twelve ready-to-edit team designs (youth leagues, school teams, adult rec teams) a customer can pick in the designer, with space for the team name, numbers and year. Seasonal asset kits (Christmas, Valentine\'s and so on) come to you by themselves from the marketing calendar.',
      '1. Look at the last team orders for ideas.\n2. Make 12 designs.\n3. Send them for June to approve before anything is published.'),
    t('long', 'conversion', 'Premade design library: family reunions',
      'Twelve ready-to-edit reunion designs a customer can pick in the designer, so they start from something good instead of a blank shirt.',
      '1. Look at the last reunion orders for ideas.\n2. Make 12 designs with space for the family name and year.\n3. Send them for June to approve before anything is published.'),
    t('medium', 'conversion', 'Fill the short holiday galleries',
      'Some holiday pages have too few pictures (big heads, glassware, weddings, Christmas). Add mockups so each one has at least 6.',
      '1. Check each holiday page on jtees.net.\n2. Make mockups for the shortest ones first.\n3. Attach them here; June or the developer puts them on the page.'),
    t('medium', 'conversion', 'Mockups for products with no good photo',
      'Some products on the shop show a plain supplier photo. Make a clean mockup with a sample design for 10 of them.',
      '1. Browse the shop and list 10 products whose photo is plain or missing.\n2. Make a mockup for each.\n3. Attach them with the product names.'),
    t('medium', 'retention', 'New photos for the event emails',
      'The planned event emails (birthdays, reunions, game days) need our own pictures instead of the placeholders. Make one picture per email.',
      '1. Ask June for the list of events.\n2. Make one picture each, 1200 x 600.\n3. Attach them here.'),
    t('medium', 'conversion', 'One blog post, ready to publish',
      'Write and lay out one blog post a customer would search for, for example "How to order shirts for a family reunion".',
      '1. Draft it with 3 or 4 pictures.\n2. Put the draft and pictures in the blog folder.\n3. June publishes it.'),
    t('short', 'capacity', 'Turn a past customer artwork into a reusable template',
      'Pick a recent order whose artwork could work for other customers (a team, a church, a business) and make a clean template of it with the names removed.', null),
    t('short', 'sales', 'Three social posts from real orders',
      'Make 3 posts showing finished orders (no customer names or faces without permission).', null),
    t('short', 'conversion', 'Five product photos, one look',
      'Make 5 product photos on the shop match each other: same background, same crop, same light.', null),
    t('short', 'capacity', 'Clean up the clipart folder',
      'Find duplicates and broken files in the clipart folder and list them, so the designer stays fast.', null),
  ],
  sales: [
    daily('sales', 'Daily leads: find 10, contact 5',
      'Find 10 new possible customers (schools, teams, churches, reunions, local businesses) and register each one on Leads with where you found them. Send a personal first message to the 5 best.',
      '1. Leads → Find leads with AI for a starting list, or search yourself; Add the good ones (or Leads → I found this customer, with the link where you found them).\n2. Write each first message from the lead\'s page so it is logged.\n3. A lead counts once it has been contacted.'),
    daily('sales', 'Follow up every quote with no answer for 3 days',
      'Open each quote that was sent more than 3 days ago with no reply and follow up personally, once.',
      '1. Open the quotes sent more than 3 days ago that have no reply.\n2. Use "Ask Claude how to reply" for a draft, then make it your own.\n3. Log what you sent.'),
    daily('capacity', 'End-of-shift summary',
      'Before you clock out: what you finished, what you started, and anything June needs to decide.',
      'Write it in Team chat, # Sales, in 5 lines or fewer.'),
    weekly(5, 'retention', 'Ask two happy customers for a Google review',
      'Pick two customers whose order was delivered this week with no complaints and ask them, personally, for a review.', null),
    t('long', 'sales', 'School and booster club pipeline',
      'Build a list of 50 local schools and booster clubs, contact all of them over the next weeks, follow up, and get quotes out. Report the tally each Friday: contacted, replied, quoted, won.',
      '1. Start with the closest 15.\n2. Register each on Leads.\n3. Two follow-ups at most, a week apart.'),
    t('medium', 'sales', 'Christmas gifts: 30 local businesses',
      'Find 30 local businesses that buy staff or client gifts and offer printed shirts, hoodies or glassware for Christmas.',
      '1. Register each on Leads.\n2. First message from the lead\'s page.\n3. Ask June before offering any discount beyond your allowance.'),
    t('medium', 'retention', 'Reorder push: customers from a year ago',
      'Contact customers whose last order was 10 to 12 months ago and offer a reorder. Email or call only; text only people who signed up for texts.', null),
    t('medium', 'retention', 'Business Partners: follow up the invites',
      'Follow up the businesses invited to the Business Partners program who have not joined yet, once, personally.', null),
    t('short', 'conversion', 'Tidy five stale leads',
      'Pick 5 leads with no next step and either follow up or close them with the honest outcome.', null),
    t('short', 'sales', 'Find one new niche to try',
      'Find one kind of customer we have never sold to (for example dance studios or food trucks), list 10 of them, and write two lines on why they would buy.', null),
  ],
  software: [
    daily('sales', 'Daily prospects: research 5, contact 3',
      'Research 5 agencies or teams that post for several brands and send a personal first message to the 3 best.',
      'Log each one and each message so it counts.'),
    daily('capacity', 'End-of-shift summary',
      'Before you clock out: who you contacted, who replied, demos booked, anything June needs to decide.', null),
    t('long', 'sales', 'Agency pipeline: 40 researched prospects',
      'Build and work a list of 40 agencies that fit COS Creator Studio\'s Agency plan. Report the tally each Friday: contacted, replied, demo, trial, won.', null),
    t('medium', 'sales', 'Book three demos',
      'Turn replies into three booked 15-minute demos this week.', null),
    t('short', 'retention', 'Check every free trial',
      'Message each trial user who has not set up their brands yet, with one helpful tip.', null),
  ],
};

module.exports = {
  LANES, LANE_KEYS, DAILY, REPEATS, GOALS, LOW, TITLE_MAX, TEXT_MAX, STARTERS,
  cleanTemplate, lanesToFill, recurringDue, isWorkday, lowLanes, isoWeek,
};
