'use strict';

// Teaching copy shared by the overview, lesson pages and quote practice.
// No completion, pricing or permission decisions live here.
const START = `<div class="card" style="border-left:4px solid #1848B8"><h2>How to use your training</h2>
<p>Start with the first unfinished lesson in an open module. The course is a learning path; the time beside a lesson is an estimate, not a deadline.</p>
<ol><li><b>Learn:</b> open the lesson title, read every page using Next page, and try its Check yourself questions. These practice questions explain your answer and do not record a quiz score.</li>
<li><b>Practise:</b> use the example and practice task before the module quiz. Keep practice work in a draft or the designated practice form. Do not send it to a customer or publish it.</li>
<li><b>Finish the lesson:</b> on the last page, press I've finished this lesson. Passing a quiz does not mark unread lessons complete.</li>
<li><b>Take the quiz:</b> choose one answer for every question, then press Mark my answers. A pass is 80%, rounded up. If you miss the pass mark, read the named lesson, practise the part you missed, and try again.</li>
<li><b>Show your work:</b> a step marked Owner signs off needs June to review the work. A Do step updates from the work recorded in the dashboard. Reading alone does not complete these steps.</li></ol>
<p><b>If you get stuck:</b> send June the lesson or task link, what you tried, what appeared, and one specific question. Do not guess a price, promise, deadline or permission. Continue another open item while you wait. Tasks are assigned manually; an empty task list means ask what to work on next.</p></div>`;

const PRACTICE = {
 team: 'Write a practice update: what you finished, the link, what is blocked, who you need, and your next step. Then draft a reply to a customer whose date you cannot confirm. Show June the drafts privately.',
 s1: 'Explain to June, in your own words, who orders from the shop. Role-play a customer asking for a discount and a guaranteed rush date. Say what you can answer and exactly what you must check.',
 s2: 'Open My Day, Leads, Quotes, Resources, Training and Team chat. Say what you would use each for. On Resources, find the tool instructions without opening a shared login you do not need.',
 s3: 'Compare a full-color photo order, a large run of one-color tees and an embroidered polo. For each, explain the likely method, the missing information and what must be confirmed before quoting.',
 s4: 'Use a fictional inquiry: “I need shirts for our event.” Draft one reply asking for the item, quantity and sizes, artwork and print locations, needed-by date, and pickup or shipping. Show the draft to June before any real reply.',
 s5: 'Complete the Maple Street Bakery practice lesson. Use the numbered quote-form sections, check every print location and size count, then save only as a draft. Give June its link and the calculated total.',
 s6: 'Read How to enter an exam quote on the exam page. Open one scenario using Build this quote, enter it in the practice form, then press Check my quote. Read each result before starting the next scenario.',
 s7: 'Choose a fictional team shirt order. Draft one useful optional add-on, explain its benefit, and show how you would offer it once without changing an accepted order.',
 s8: 'Research one real organization from public business information. Check it is not already a lead. Draft why it may need our products and a personal opening message; let June review before contact.',
 s9: 'Review an assigned past order without editing it. Draft a reorder message that checks the new quantity, sizes and deadline instead of assuming last year’s details still apply.',
 s10: 'Role-play an accepted quote with no payment yet. Find the payment status, explain the next step and identify when proof approval is required. Do not record money or start production as a practice action.',
 lg1: 'Explain the difference between a researched prospect, a reply and a qualified quote request. Draft a short daily report showing each separately.',
 lg2: 'Choose one customer type and a coming occasion. Explain the likely product, the reason to contact them now, and which public evidence supports that reason.',
 lg3: 'Research one prospect in each source the lesson teaches. Check for duplicates and record the source and a specific reason for fit. Do not contact them until reviewed.',
 lg4: 'Find the public business contact who handles an organization’s orders. Draft a polite question for when the decision-maker is unknown.',
 lg5: 'Pick one template and rewrite it around a real business detail. Read it aloud, remove claims you cannot prove, and show June the draft.',
 lg6: 'Create a practice follow-up plan for one reply, one no-reply and one stop request. Explain what you would log and when contact ends.',
 lg7: 'Draft a handoff with the lead link, customer request, quantity and sizes, artwork and locations, date, fulfillment, and unanswered questions. Identify the next owner.',
 lg8: 'Use sample counts to explain where prospects drop out: no replies, incomplete quote details or no paid orders. Recommend one change to try next week.',
 cl1: 'Walk June through what you own from a new inquiry to payment, and which decisions need her. Use one fictional order so each handoff is concrete.',
 cl2: 'Draft replies to an email inquiry and a missed call. Include a specific next step and explain where you record the contact.',
 cl3: 'Role-play a customer with a budget but no garment selected. Ask clarifying questions before recommending a product or quoting.',
 cl4: 'Build one practice quote, compare every detail with the request, and explain each charge using the form. Save only as a draft.',
 cl5: 'Practise an upsell aloud, then practise accepting “no.” Show the optional item separately from what the customer already requested.',
 cl6: 'Role-play “too expensive,” “I need it tomorrow” and an unhappy customer. Draft a reply to each and identify when June takes over.',
 cl7: 'Review a fictional accepted order with an unpaid deposit or missing proof approval. Explain what is still needed before production; do not alter payment records.',
 cl8: 'Review an assigned pipeline and identify the next action and date for each open item. Explain which ones need June rather than another customer reminder.',
 am1: 'Explain which assigned accounts you manage and the next action on one of them. Do not claim ownership of an unassigned customer.',
 am2: 'Draft a reorder calendar for a school, a team and a business. Base each contact date on a known event or past order; mark unknown dates to confirm.',
 am3: 'Read one assigned customer’s history without changing it. Summarize their last order, useful preferences and what must be checked for a new order.',
 am4: 'Draft a reorder message and a draft quote. Recheck product, artwork, quantities, sizes, deadline and current price rather than sending last year’s quote.',
 am5: 'Prepare a short account plan with upcoming events, decision-maker, next contact date and one useful product suggestion.',
 am6: 'Draft replies to a positive and a negative review without posting. Explain why rewards, fabricated reviews and customer details do not belong in a reply.',
 am7: 'Pick an upgrade that fits a past order. Draft one optional suggestion and explain why it benefits this customer.',
 am8: 'Draft a friendly check-in for a quiet customer and a weekly report. Explain when to close the follow-up instead of repeatedly contacting them.',
 d2: 'Use an assigned design brief or a fictional order. Identify the print method, final dimensions, locations, missing artwork and deadline. Draft a handoff identifying the files you will deliver.',
 d3: 'Prepare one practice screen-print file and one DTF file from sample artwork. Inspect transparency, size and edges at final print size. Explain the differences before exporting.',
 d4: 'Make a sample sign layout at its actual output size. Mark the cut area, safe area and required bleed from the approved supplier specification; ask June if a specification is missing.',
 d5: 'Clean a copy of sample artwork, keeping the original. Compare before and after at print size and export the format required for its method.',
 d6: 'Use approved AI tools on non-customer sample artwork. Inspect lettering, anatomy, transparency and resolution; explain every manual correction needed before printing.',
 d7: 'Prepare a practice proof with product color, print locations, dimensions and revision label. Upload only to an assigned practice or owner-approved job; draft the approval request without sending it.',
 d8: 'Prepare one sample web image with a readable filename, suitable dimensions and accurate alt text. Open the export to check appearance before proposing publication.',
 d9: 'Draft one product post using approved artwork. Prepare the image, caption, call to action and proposed Chicago posting time in COS. Request review; verify a live URL only after approved publication.',
 c2: 'Choose one shop product. Write a two-second opening, one customer benefit and a call to action for a short video. Explain what the viewer should do next.',
 c3: 'Write a shoot brief listing the product, shots, framing and files needed. Ask for footage in one batch and identify where originals and finished files belong.',
 c4: 'Edit a copy of sample footage into a short vertical video. Check the opening, pacing, captions, audio and export by watching the entire file.',
 c5: 'Inspect a sample clip for identifiable people, customer artwork and music. List the permission or license needed and what you would replace if it is missing.',
 c6: 'Prepare variants of one approved concept for two platforms. Check format, caption and music rights separately. Keep both in drafts until approved.',
 c7: 'Draft replies to a compliment, a price question and a complaint. Show how the inquiry reaches Sales and how the complaint reaches June.',
 c8: 'Use sample post results to compare reach, inquiries and orders separately. Draft a Friday report with one learning and one next experiment.',
 a2: 'Read an ad account without changing it. List the objective, conversion, budget and landing page. Draft your proposed first-week checks for June.',
 a3: 'Trace a customer journey from ad to quote request. Explain what should count once, how to verify the event, and how you would report a suspected tracking failure.',
 a4: 'Draft one search ad and keyword group for a specific service. Check every claim against the website and propose a matching landing page. Do not launch or spend during practice.',
 a5: 'Review a sample search-term report. Explain which terms fit, which should be excluded, and what evidence supports each proposed change. Submit the recommendation before changing the account.',
 a6: 'Draft a retargeting audience and creative concept using approved shop photos. State the objective and proposed budget for June’s review; do not publish.',
 a7: 'Prepare one seasonal campaign brief with product, audience, dates, landing page, assets and proposed budget. Identify which inputs June must supply.',
 a8: 'Draft a weekly report separating spend, quote requests and paid orders. Explain an attribution gap rather than presenting unverified orders as ad results.',
 b2: 'Trace a fictional sale from gross payment through tax, fees and payout. Explain why a bank deposit is not automatically the same number as sales.',
 b3: 'Prepare one sample expense with date, amount, category, receipt and job link where relevant. Show June the proposed entry rather than changing live books.',
 b4: 'Use sample transactions to distinguish a refund, a dispute and a payout delay. Explain what evidence you would gather and which action stays June’s.',
 b5: 'Use a fictional taxable sale and a certificate example. Explain the tax and the evidence needed for exemption; never waive tax or file a return during practice.',
 b6: 'Reconcile a sample statement to a sample ledger. Identify the exact unmatched transaction and explain it instead of entering an adjustment to force a zero.',
 b7: 'Draft a monthly summary with sales, fees, costs, tax and unresolved differences. Give June the source references and a specific question for each unresolved item.',
 v2: 'Trace one change from repository through checks and deployment to the live page. Draft the change, verification and rollback plan; practice in an isolated checkout.',
 v3: 'Role-play a customer-facing failure. Draft the first status update, evidence to collect, containment choice and follow-up check. Do not use live customer data as a fixture.',
 v4: 'Review sample code for authentication, authorization, validation and secret handling. Explain the failure cases you would test without changing live access.',
 v5: 'Trace a sample payment, refund and duplicate webhook. Explain how the ledger stays correct and what would block a release. Use test data only.',
 v6: 'Write or describe a regression test for one sample bug. Explain what would have failed before the fix and why a passing build alone is insufficient.',
 v7: 'Draft a release checklist or incident-prevention proposal with evidence and a plain-language update to June. Do not publish an app or deploy as a training exercise.',
 w2: 'Use June’s demo account with one sample business. Add its brand details and a shop-owned photo, generate and edit a caption, and explain a suitable plan. Keep everything in drafts. Demonstrate the same workflow to June before prospecting.',
 w3: 'Research five good-fit prospects in one agreed audience. Record one real detail, source, likely problem and next step for each. Ask June to review the first five before you scale outreach.',
 w4: 'Write three personalized first-message drafts and one follow-up. Read them aloud. Keep a single clear question and show June before sending.',
 w5: 'Role-play a single-business prospect first. Ask about their current posting process, show one relevant workflow, then agree one next step. June joins the first live demos; agency features come after you can do this reliably.',
 w6: 'Role-play “I can use ChatGPT,” “I have no time” and “Can I try it free?” Explain the approved free plan, avoid promises of results, and hand unapproved discounts or unavailable features to June.',
 w7: 'Rehearse setup with one sample business, one usable draft and a clear next step. For a real paid signup, verify the plan, any approved offer and amount before the customer pays. The customer enters their own credentials and card.',
 w8: 'Prepare a sample report with prospects, replies, demos, signups, first useful content, repeat use and paid customers. Calculate commission from actual cleared payments and explain a cancellation or refund.',
};

function moduleCopy(key) { return String(key).endsWith(':assessment') ? 'Review the lessons for this duty, explain your practice work to June, then take its assessment quiz. This assessment does not change your permissions or commission terms.' : PRACTICE[String(key).split(':').pop()] || ''; }
function moduleHtml(step, esc) {
 const practice = moduleCopy(step.module);
 return `${step.moduleGoal ? `<p style="margin:10px 0"><b>What you will learn:</b> ${esc(step.moduleGoal)}</p>` : ''}${practice ? `<details style="margin:10px 0"><summary><b>Practice before the quiz</b></summary><p>${esc(practice)}</p><p><b>Ready when:</b> you can explain your choices and show the draft, file or notes. This practice does not automatically tick a lesson, pass a quiz or replace June’s sign-off. Ask for help on anything you cannot complete.</p></details>` : ''}`;
}
const EXAM = `<div class="card" style="border-left:4px solid #1848B8"><h2>How to enter an exam quote</h2>
<p>This is a form exercise, not a place to type a written answer or calculate a price by hand. Start with the Building quotes lessons if you have not used the form.</p>
<ol><li>Read one customer request. Press <b>Build this quote</b> (the owner sees <b>Try it yourself</b>). The new page must say <b>Quote exam</b> and <b>Check my quote</b>. If it says Finish or Save as draft, return to this exam and open the scenario from here.</li>
<li>Leave name, email and phone empty. In Item 1, enter a short description, then use <b>1 What are we making</b>: select a category to narrow the Product list, then choose the requested garment. For a cutout choose its exact size and pack or singles option. A pack is counted in packs, not individual heads.</li>
<li>In <b>2 Printing</b>, tick each requested location. Choose its decoration separately. Front and back on the same garment stay on one item; do not double the garment quantity. For Screen Printing, enter the design’s ink-color count for each location. For an all-in cutout, do not add garment printing.</li>
<li>In <b>3 Quantity &amp; price</b>, enter the number of garments (or packs). Leave <b>Each $ / Priced from the list</b>, Run, Optional, discounts and contract pricing unchanged unless the request specifically calls for them.</li>
<li>Open <b>Details, photos &amp; sizes</b>. Enter the garment color if given and the number of each size. The size counts must add up to the garment quantity. Choose the product first so its sizes appear. Sizes not supplied in a scenario should not be invented.</li>
<li>Copy the date shown in the exam banner into <b>Needed by</b>. Check warnings and the calculated rush. A calculated rush is a charge, not a promise that June can meet the date.</li>
<li>Scroll to the bottom and press <b>Check my quote</b>. It records your exam result, not a customer quote. Read every off result, use <b>Build it again</b>, and re-enter the scenario. The current form does not retain your previous entries on retry.</li></ol>
<p><b>Success:</b> the result says Right and each check matches. You need 10 of the 12 scenarios right. Repeating a scenario does not create a customer order, send a message or earn commission.</p>
<details><summary><b>Worked example: three hoodies</b></summary><p>In the first scenario choose Hoodies &amp; Sweatshirts, then Gildan 18500 Unisex Heavy Blend Hoodie. Set Qty to 3. Tick Front and Back and choose DTF for each; use a full-front option for the large front design and a chest-logo option for the small back design. Under Details, photos &amp; sizes, enter Black, M = 2 and L = 1; other sizes remain empty. Enter the date from the banner, leave the calculated price alone and press Check my quote.</p><p>The three garments are one item with two print locations. Choosing DTF only on Front leaves the back print unpriced. Entering 3 in each size would describe six hoodies.</p></details></div>`;
module.exports = { START, EXAM, PRACTICE, moduleCopy, moduleHtml };
