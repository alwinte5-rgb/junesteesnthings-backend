'use strict';

/* Every training path (track) in one place. A track is a job on the team:
   its training course, its chat channel and Resources audience, the
   permission preset a new hire starts on, and the job title in their welcome
   email all come from here. Adding a job means one entry here, a course in
   courses/index.js (TRACK_COURSES) and, for a hiring role, the posting.

   label   the name on the Staff and Training pages
   short   the name of its chat channel audience and Resources audience
   role    the job title in the welcome email when the owner leaves it blank
   preset  the permission preset a new hire on this track starts on
   note    what the course covers, shown on the paths page */

const TRACKS = {
  sales: { label: 'Sales', short: 'Sales', role: 'Sales & Customer Service Assistant', preset: 'training',
    note: 'Leads, quotes, follow-ups and finding new customers.' },
  design: { label: 'Design', short: 'Design', role: 'Graphic Designer', preset: 'design',
    note: 'Print-ready artwork, signs, proofs, AI and its cleanup, site and blog images, and social graphics.' },
  content: { label: 'Content (video)', short: 'Content', role: 'Content Editor', preset: 'team',
    note: 'Shot lists, editing shorts and longer videos, music and permission rules, posting, comments and the Friday numbers.' },
  ads: { label: 'Ads', short: 'Ads', role: 'Ads Specialist', preset: 'team',
    note: 'Conversion tracking, Google Search, negatives and the $40 rule, Meta retargeting, seasonal campaigns and the weekly report.' },
  bookkeeper: { label: 'Bookkeeper', short: 'Bookkeeper', role: 'Bookkeeper', preset: 'books',
    note: 'Sales and fees, expenses and receipts, job costs, refunds and disputes, Illinois sales tax, the month-end close and the summary for June.' },
  developer: { label: 'Developer', short: 'Developer', role: 'Developer', preset: 'team',
    note: 'The stack, shipping through pull requests, outages and roll-backs, secrets and safe code, payment code, tests and Claude Code, apps.' },
  software: { label: 'Software sales', short: 'Software sales', role: 'Software Sales Agent', preset: 'team',
    note: 'Our apps and their top plans, finding agencies, first messages and follow-ups, discovery and the demo, objections and approved offers, trials and setup, pay and the weekly report.' },
};

const pick = (field) => Object.fromEntries(Object.entries(TRACKS).map(([k, t]) => [k, t[field]]));

/* Channel and Resources audiences: everyone, or one track. */
const AUDIENCES = { all: 'Everyone', ...pick('short') };

module.exports = { TRACKS, AUDIENCES, ROLE_FOR_TRACK: pick('role'), PRESET_FOR_TRACK: pick('preset') };
