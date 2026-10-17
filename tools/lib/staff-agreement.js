'use strict';
/* The staff confidentiality and ownership agreement every helper signs before
 * the workspace opens for them (owner, 2026-10-16: "before I give my
 * employees access to my passwords and artwork ... some sort of agreement
 * that they belong to the company and myself"). Pure: the routes store the
 * signature and gate the pages.
 *
 * VERSION names the wording. Changing any word here means a new VERSION, and
 * then every helper signs again on their next visit: a signature only ever
 * covers the text it was given (textHash is stored with it). */
const crypto = require('crypto');
const { escHtml: esc } = require('./html-escape');

const VERSION = '2026-10-16';
const COMPANY = "June's Tees and Things LLC";

/* Each section: a title and blocks. A block is { p, lead? } (a paragraph,
   `lead` set in bold before it), { ul: [...] } or { ol: [...] }. */
const SECTIONS = [
  { title: '1. Parties and purpose', blocks: [
    { p: `This Agreement is between ${COMPANY}, doing business as June's Tees (the "Company"), its owner (the "Owner"), and the Staff Member who signs below (the "Staff Member").` },
    { p: 'The Staff Member is an independent contractor working remotely from the Philippines. They are being given access to Company passwords, accounts, artwork, customer information and other business materials so they can do their work.' },
    { p: 'The Staff Member must sign this Agreement before receiving any of that access.' },
  ] },
  { title: '2. Everything made for the Company belongs to the Company', blocks: [
    { p: 'All work the Staff Member creates for the Company, or using Company time, tools, accounts or materials, belongs to the Company and the Owner. This includes:' },
    { ul: [
      'artwork, designs, logos, mockups, clipart and edited images',
      'product photos, videos and social media posts',
      'written text: product descriptions, emails, ads, scripts and templates',
      'customer lists, spreadsheets, price lists and order records',
      'ideas, improvements and processes developed for the Company',
    ] },
    { p: 'The Staff Member hereby assigns to the Company all rights, title and interest in this work, including copyright and all economic rights, worldwide and forever, with no further payment beyond their agreed pay. This is the written stipulation referred to in Section 178.4 of the Philippine Intellectual Property Code (Republic Act No. 8293), so copyright passes to the Company and does not stay with the Staff Member. Under US law, the work is also a "work made for hire" to the extent the law allows.' },
    { p: 'To the extent the law allows, the Staff Member waives their moral rights in the work under Sections 193 and 195 of Republic Act No. 8293. This includes the right to be named as its creator and the right to object to changes. The Company may edit, adapt, combine or publish the work without naming the Staff Member.' },
    { p: "The Staff Member will not claim ownership of, sell, license or reuse any of this work, during or after their time with the Company, without the Owner's written permission. The Staff Member will sign any further papers reasonably needed to confirm the Company's ownership." },
    { lead: 'Portfolio use.', p: 'The Staff Member may show designs they personally created for the Company in their own portfolio, during and after their work with the Company, as long as they:' },
    { ul: [
      "say the work was made for June's Tees and do not claim to own it",
      'show only work the Company has already released to its customer or the public',
      'remove any customer names, contact details, prices or order information',
      'do not offer the work for sale, license or reuse',
      'take it down if the Owner or the customer asks',
    ] },
    { p: 'Artwork, designs and files the Company or its customers provide remain the property of the Company or that customer. The Staff Member gains no rights in them.' },
    { lead: 'Logos and trademarks of others.', p: 'Many files the Staff Member handles contain logos, brand names, artwork or photos owned by customers or other businesses, such as a school, team, company or event logo. These belong to their owners, not to the Staff Member. The Staff Member will:' },
    { ul: [
      'use them only for the specific Company order or job they were provided for',
      "never reuse, share, sell or post them anywhere else, including social media or other clients' work, except portfolio use under Section 2",
      'never add a third-party logo or brand to a design unless the customer supplied it or the Owner approved it',
      'treat every customer-supplied file as Confidential Information under Section 4',
    ] },
  ] },
  { title: '3. Passwords and accounts', blocks: [
    { p: 'Every login, password, account and device the Company provides belongs to the Company. That includes email, the website and admin pages, design tools, social media, supplier and shipping accounts, payment systems and shared drives. The Staff Member is only borrowing access to do their work.' },
    { p: 'The Staff Member agrees to:' },
    { ol: [
      'Keep every password private. Never share it with anyone, including family, friends or other workers, unless the Owner says so in writing.',
      'Use Company accounts only for Company work.',
      "Not change any password, recovery email, phone number or two-factor setting without the Owner's permission.",
      "Not create new accounts in the Company's name, or link Company accounts to personal accounts, without permission.",
      'Not save Company passwords in personal browsers, apps or notes on shared or personal devices, except a password manager the Owner approves.',
      'Tell the Owner within 24 hours if they think a password was seen, lost or misused, or if a device with Company access is lost or stolen.',
    ] },
    { p: 'The Owner may change passwords, remove access or review account activity at any time, with or without notice.' },
  ] },
  { title: '4. Confidential information', blocks: [
    { p: '"Confidential Information" means any sensitive or non-public material or information about the Company, the Owner, its staff, customers, suppliers or partners, in any form: digital files, documents, photos, screenshots, messages, emails, conversations or anything the Staff Member sees or hears while working. When in doubt, the Staff Member must treat it as confidential and ask the Owner. Examples include, but are not limited to:' },
    { ul: [
      'customer names, contact details, orders, addresses and payment details',
      'prices, costs, margins, quotes and financial records',
      'suppliers, vendors and the terms the Company gets from them',
      'artwork, designs and files not yet released, and customer-supplied art',
      'business plans, marketing plans, training materials and internal processes',
      'passwords, account details, security codes and system access',
      'personal information about the Owner, staff or customers',
      'any other material marked confidential, or that a reasonable person would understand to be sensitive',
    ] },
    { p: "The Staff Member will keep Confidential Information secret, use it only to do their Company work, and not copy, download, forward, screenshot or share it outside Company systems unless the work requires it. These duties continue after the Staff Member's work with the Company ends, for as long as the information stays non-public." },
    { p: "The Staff Member will handle all personal information of customers, staff and the Owner in line with the Philippine Data Privacy Act of 2012 (Republic Act No. 10173), US privacy law and the Company's instructions. They will keep it secure and never sell or misuse it. They will report any loss or leak of it to the Owner within 24 hours." },
    { p: 'This does not cover information that is already public through no fault of the Staff Member, or that the law requires them to disclose. Nothing here stops the Staff Member from reporting a possible legal violation to a government agency.' },
  ] },
  { title: '5. No personal use of Company art, customers or accounts', blocks: [
    { p: 'During and after their work with the Company, the Staff Member will not:' },
    { ul: [
      'use Company artwork, designs, templates or files for themselves or anyone else',
      "use the Company's customer list or Confidential Information to sell to, or take work from, the Company's customers",
      'post Company work or customer work online as their own (portfolio use under Section 2 is allowed)',
      'use Company accounts, tools or subscriptions for personal projects or other clients',
    ] },
    { p: 'The Staff Member may keep doing other work that does not use Company property or Confidential Information.' },
  ] },
  { title: '6. When the work ends', blocks: [
    { p: "When the Staff Member's work with the Company ends for any reason, or whenever the Owner asks, the Staff Member will within 2 days:" },
    { ol: [
      'Return all Company devices, files, documents and materials.',
      'Delete every copy of Company files, artwork and Confidential Information from personal devices, email, cloud storage and messaging apps.',
      'Log out of all Company accounts and hand over any login the Staff Member created or used for Company work.',
      'Confirm in writing (an email or message to the Owner is enough) that steps 1 to 3 are done.',
    ] },
    { p: 'Sections 2, 4 and 5 continue to apply after the work ends.' },
  ] },
  { title: '7. Breaking this Agreement and general terms', blocks: [
    { lead: 'Breach.', p: 'Breaking this Agreement may lead to immediate removal of access and end of work. Because misuse of Company property or Confidential Information can cause harm that money alone cannot fix, the Company may ask a court to stop it (an injunction), in addition to seeking damages and any other remedy the law allows.' },
    { lead: 'Independent contractor.', p: 'The Staff Member is an independent contractor, not an employee of the Company. This Agreement does not set pay, hours or length of work. Those terms are agreed separately, for example through OnlineJobs.ph or a written work arrangement.' },
    { lead: 'Governing law.', p: 'This Agreement is governed by the laws of the State of Illinois, USA, wherever the Staff Member is located. The Company may enforce it in the courts of that state or in the courts of the Philippines, where the Staff Member lives.' },
    { lead: 'If one part is invalid.', p: 'If any part of this Agreement cannot be enforced, the rest still applies, and that part will be enforced as far as the law allows.' },
    { lead: 'Whole agreement.', p: 'This is the full agreement on these topics. Any change must be in writing and signed by the Owner. Electronic signatures count as originals, including under the Philippine Electronic Commerce Act (Republic Act No. 8792). Typing their full name and pressing Sign is the Staff Member\'s electronic signature.' },
  ] },
];

/** sha256 of the wording, stored with each signature as proof of what was signed. */
const TEXT_HASH = crypto.createHash('sha256').update(VERSION + '\n' + JSON.stringify(SECTIONS)).digest('hex');

function blockHtml(b) {
  if (b.ul) return `<ul>${b.ul.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>`;
  if (b.ol) return `<ol>${b.ol.map((t) => `<li>${esc(t)}</li>`).join('')}</ol>`;
  return `<p>${b.lead ? `<b>${esc(b.lead)}</b> ` : ''}${esc(b.p)}</p>`;
}

/** The agreement's wording as HTML, every section in order. */
function agreementHtml() {
  return `<div class="agreement">${SECTIONS.map((s) => `<h3>${esc(s.title)}</h3>${s.blocks.map(blockHtml).join('')}`).join('')}</div>`;
}

const clip = (v, n) => String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, n + 1);

/**
 * Reads the signing form. A full name is two or more words with letters in
 * them; the place is where they work from. Every problem is listed at once.
 * @returns {{signature: {name: string, location: string}|null, problems: string[]}}
 */
function signatureFromForm(b = {}) {
  const problems = [];
  const name = clip(b.signed_name, 100);
  const location = clip(b.location, 100);
  if (name.length > 100) problems.push('Your name must be 100 characters or fewer.');
  else if (name.split(' ').filter((w) => /\p{L}/u.test(w)).length < 2) problems.push('Type your full legal name: first and last name.');
  if (location.length > 100) problems.push('The city and province must be 100 characters or fewer.');
  else if (location.length < 2 || !/\p{L}/u.test(location)) problems.push('Type the city and province you work from.');
  if (String(b.agree || '') !== '1') problems.push('Tick the box to say you have read and agree to the agreement.');
  return { signature: problems.length ? null : { name, location }, problems };
}

module.exports = { VERSION, COMPANY, SECTIONS, TEXT_HASH, agreementHtml, signatureFromForm };
