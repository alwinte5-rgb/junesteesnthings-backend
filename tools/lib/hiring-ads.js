'use strict';

/* The applicant test for the part-time ads specialist, in the same shape as
   the sales one in hiring.js (see ROLES there). Everything else is shared by
   every role.

   What the job is: running the shop's paid ads on Google (Search first) and
   Meta (Facebook and Instagram) on a small budget, aimed at quote requests and
   orders from Chicago-area schools, teams, churches and businesses, and online
   orders from the design studio. Tracking real results (quote requests,
   purchases, profit) matters more than clicks. */

const MINUTES = 30;

const INTRO = `This test takes about ${MINUTES} minutes. It is the same kind of work you would do for us every week:
judging what to change in an ad account, planning campaigns on a small budget, reading the numbers,
and explaining them to a busy owner. You do not need access to an ad account: everything is written.
Please do not use ChatGPT or other AI tools to write your answers: we want to see how you think.`;

const PARTS = {
  choice: { label: 'Part 1: Ads judgment', note: '8 questions, about 6 minutes. Pick what you would really do.' },
  craft: { label: 'Part 2: Running the ads', note: 'About 18 minutes. Be specific: campaigns, keywords, budgets, numbers.' },
  initiative: { label: 'Part 3: Initiative', note: 'About 4 minutes. There is no single right answer; we want to see how you think.' },
  bonus: { label: 'Part 4: Bonus', note: 'Optional, about 3 minutes. This can change the direction of your interview.' },
};

const WEIGHTS = { choice: 25, craft: 50, initiative: 25 };

const MULTIPLE_CHOICE = [
  { id: 'tracking', q: 'You are about to launch our first Google Ads campaign. What must be working before you spend money?',
    choices: ['A nice logo in the ads', 'Conversion tracking: a quote request and an online purchase each recorded as a conversion, tested once',
      'A high daily budget so Google learns faster', 'Nothing: launch and see'],
    answer: 1, why: 'Without conversion tracking you cannot tell which ads bring orders, and Google cannot optimise. Test it before the first dollar.' },
  { id: 'negatives', q: 'The search terms report shows clicks from "free t-shirt design template", "t-shirt printing jobs" and "how to screen print at home". What do you do?',
    choices: ['Nothing: clicks are good', 'Raise the budget', 'Add them as negative keywords, and check the match types that let them in',
      'Pause the whole campaign'],
    answer: 2, why: 'People looking for free templates, jobs or DIY will not order. Negative keywords stop paying for them.' },
  { id: 'budget', q: 'We have $20 a day. What is the best use of it?',
    choices: ['Ten campaigns at $2 a day each', 'One or two campaigns on the searches most likely to order (for example "custom team shirts chicago"), and add more only once they work',
      'All of it on brand awareness video', 'Spend it all on the first day of the month'],
    answer: 1, why: 'A small budget spread thin learns nothing. Concentrate on high-intent searches until they pay back.' },
  { id: 'location', q: 'Most of our customers are in the Chicago area. How do you set the location targeting?',
    choices: ['All of the USA', 'Chicago and the nearby suburbs, for people IN or regularly in those places (not people merely "interested in" Chicago)',
      'Worldwide', 'Only our street'],
    answer: 1, why: 'The default "presence or interest" setting shows ads to people far away who only read about Chicago. Presence matches where customers are.' },
  { id: 'learning', q: 'A new Meta campaign has run for 2 days and the cost per result looks high. What do you do?',
    choices: ['Change the audience, budget and creative every day until it improves', 'Turn it off',
      'Check nothing is broken (tracking, link, audience), then let it finish the learning phase before judging; change one thing at a time',
      'Double the budget'],
    answer: 2, why: 'Daily edits restart learning and make results worse. Check for real problems, then give it enough data before judging.' },
  { id: 'claims', q: 'Someone suggests the ad headline "Cheapest Custom Shirts in Chicago, Free Shipping". We are not the cheapest and shipping is not free. What do you do?',
    choices: ['Use it: everyone exaggerates', 'Use it but add small print',
      'Write only claims we can back up (fast turnaround, no-minimum DTF, local pickup, real reviews), and check with the owner',
      'Remove all text from the ad'],
    answer: 2, why: 'False claims break ad policies, can get the account suspended, and annoy the customers who click. True specifics win anyway.' },
  { id: 'profit', q: 'A campaign spent $300 and brought 2 orders worth $400 each. Our profit on an order is about 40%. Is it working?',
    choices: ['Yes: $800 in sales from $300', 'No: it lost money',
      'Roughly break-even: about $320 profit for $300 of ads. Worth improving (better targeting, landing page, repeat customers) before scaling up',
      'Cannot tell without the click-through rate'],
    answer: 2, why: 'Sales are not profit. $800 at 40% is about $320, so the ads only just paid for themselves. Judge ads on profit, and remember reorders.' },
  { id: 'landing', q: 'An ad for "custom team jerseys" sends people to our homepage. What is the better landing page?',
    choices: ['The homepage is fine', 'Our About page',
      'The page that matches the ad: team uniforms, with the quote form easy to find', 'Our Facebook page'],
    answer: 2, why: 'People leave when the page does not match what they clicked. The closest matching page with a clear next step converts best.' },
];

const WRITTEN = [
  { id: 'plan', part: 'craft', minutes: 7, label: 'Plan our first month',
    prompt: 'We have $600 a month for ads. The goal is more quote requests from Chicago-area schools, sports teams, churches and businesses, plus online orders from our design studio. Our Google Ads account is new. Describe the campaigns you would set up (platform, keywords or audiences, locations, schedule, budget split), the tracking you need first, and what you would do in the first 30 days.',
    rubric: 'Tracking first (quote request and purchase as conversions, tested; GA4 linked); starts focused: Google Search on high-intent keywords (custom shirts/team uniforms/screen printing + Chicago, phrase and exact match), a sensible negative list, Chicago-area presence targeting, a schedule that fits when people search, most of the budget on Search; maybe a small Meta retargeting or local-awareness test with real job photos; matching landing pages; a weekly routine (search terms, negatives, bids, pausing losers) and judging on cost per quote request and orders, not clicks; realistic about $600 (about $20 a day). Spreading thin across many campaigns or vague "run ads on all platforms" scores 2 or lower.',
    model: "Week 0, tracking: quote-form submissions and design-studio purchases as Google Ads conversions (and GA4 key events), each tested with a real submission before launch.\n\nCampaigns, about $20 a day:\n1. Google Search, about $15/day: \"Team & school shirts\" and \"Business shirts & embroidery\" ad groups. Keywords in phrase and exact match, like \"custom team shirts chicago\", \"screen printing chicago\", \"embroidered polos for business\". Negatives from day one: free, template, jobs, DIY, how to, wholesale blanks. Locations: Chicago and the near suburbs, presence only. Ads run Mon-Sat 7am-9pm.\n2. Meta, about $5/day: retargeting people who visited the quote page or the design studio in the last 30 days, using real job photos and reviews.\n\nLanding pages: team ads go to the team uniforms page, business ads to the business/embroidery page, each with the quote form one tap away.\n\nFirst 30 days: check search terms twice a week and add negatives; pause keywords that spend $40 with no quote request; move budget to what brings quotes. Report weekly on spend, quote requests, cost per quote request and orders.",
  },
  { id: 'audit', part: 'craft', minutes: 5, label: 'Fix this campaign',
    prompt: 'Last month our "Custom shirts" campaign spent $450: 3,000 clicks, a 9% click-through rate, and only 2 quote requests. Its top search terms were "free shirt design", "shirt printing near me", "how to screen print at home", "custom hoodies chicago" and "t shirt printing machine". Location: "United States". What is wrong, and exactly what would you change?',
    rubric: 'Spots that a high CTR with almost no quote requests means the wrong people are clicking; names the bad terms (free, DIY, machine buyers) and adds negatives; tightens match types; changes location to the Chicago area (presence); keeps and builds on the good terms ("shirt printing near me", "custom hoodies chicago") with their own ad groups and matching landing pages; checks conversion tracking actually records quote requests; checks the landing page; sets a target cost per quote request and a review date. Only "raise the budget" or "change the ad text" scores 1-2.',
    model: "The clicks are cheap and plentiful but the wrong people: 3,000 clicks for 2 quote requests, so about $225 per lead.\n1. Negatives: free, how to, at home, machine, equipment, DIY, jobs, template.\n2. Location: United States means people in other states click. Change it to Chicago and the nearby suburbs, presence only.\n3. Keep the good searches: \"shirt printing near me\" and \"custom hoodies chicago\" get their own ad groups in phrase/exact match, with ads and landing pages that match (hoodies to the hoodies page).\n4. Check tracking: submit a test quote and confirm it shows as a conversion. 2 may be undercounting.\n5. Landing page: make sure the quote form is one tap away on a phone.\nTarget: under $40 per quote request. Review in 2 weeks and move budget to what hits it.",
  },
  { id: 'report', part: 'craft', minutes: 3, label: 'Tell the owner',
    prompt: 'This week: $140 spent, 9 quote requests, 3 orders worth $1,250 in total, and one keyword spent $35 with nothing to show for it. Write the weekly update to the owner (busy, not an ads expert) exactly as you would send it.',
    rubric: 'Short and plain: spend, results and what they cost (about $15.50 per quote request), orders and their value, an honest read on profit, what they changed (the wasted keyword paused or fixed) and what they will do next week, and any decision the owner needs to make. No jargon dumps.',
    model: "Hi June, this week's ads:\n- Spent $140, got 9 quote requests (about $15.50 each) and 3 orders worth $1,250.\n- At our usual margin that's roughly $500 profit for $140 of ads, so it's paying for itself.\n- \"Custom apparel\" spent $35 with nothing, mostly people looking for wholesale blanks. I paused it and added those searches as negatives.\nNext week: move that $35 to \"team shirts chicago\", our best keyword. Nothing needed from you.",
  },
  { id: 'portfolio', part: 'craft', minutes: 3, label: 'Your results',
    prompt: 'Tell us about one ad account you managed: the business, the platform, the monthly budget, the goal, what you changed, and the results in numbers (cost per lead or sale, return on ad spend). Links or screenshots are welcome.',
    rubric: 'A real account with a budget, a clear goal, specific changes they made and measured results (cost per lead or acquisition, ROAS, conversions), ideally a small or local business. Only "I ran Facebook ads for clients" with no numbers scores 1-2.',
    model: "A local landscaping company, Google Search, $900 a month, goal: quote requests. I rebuilt the account from broad match into tight phrase/exact ad groups by service, added 120 negatives in the first month, set up call and form tracking, and moved targeting to presence only. Cost per quote request fell from $68 to $24 in three months, and quote requests went from 13 to 37 a month. [screenshot]",
  },
  { id: 'quiet', part: 'initiative', minutes: 4, label: 'Quiet time',
    prompt: 'The ads are running fine and nothing is assigned. You have 3 hours this week. Tell us exactly what you would do with them, and why.',
    rubric: 'Self-starter: names concrete, useful ads work without being told, for example the search terms and negatives, testing a new ad or headline, improving a landing page with the owner, building a retargeting audience, preparing seasonal campaigns ahead (back to school, sports seasons, holidays, graduation), checking tracking still works, competitor research, a short report; prioritised by money. "I would wait" scores low.',
    model: "1. 45 min: search terms and placements for every campaign; add negatives and pause anything spending without results.\n2. 45 min: write two new headline tests for the best ad group, using real reviews.\n3. 45 min: build next month's seasonal campaign ahead of time (back-to-school spirit wear in July, football in August), paused, ready to switch on.\n4. 30 min: submit a test quote to confirm tracking still works, and check the landing pages on a phone.\n5. 15 min: send June a short note with what I changed and what's coming.",
  },
  { id: 'bonus', part: 'bonus', minutes: 3, optional: true, label: 'Bonus: a skill we did not ask about',
    prompt: 'Is there a skill we did not ask about that could help us grow? For example Google Analytics 4 and tag manager, landing page building, ad creative and video, email marketing, SEO, or using AI tools for ads. Tell us what you have done with it and one result you are proud of.',
    rubric: 'Score 0 if left blank. Rewards a real, evidenced skill useful to a small business running ads (GA4 and GTM, landing pages, ad creative, email, SEO, AI used carefully) with a concrete result. Vague claims with no example score 1-2.',
    model: "I set up GA4 and Google Tag Manager for three small shops, including form and purchase tracking that matched the real orders. For one, fixing double-counted purchases showed that Meta ads were losing money, and moving that budget to Search doubled their monthly profit from ads.",
  },
];

const INTERVIEW_GUIDE = [
  { section: 'Warm-up (3 min)', questions: [
    { q: 'Tell me about the ad account you are proudest of. What changed the results?',
      listen: 'Real numbers (cost per lead or sale, ROAS) and a specific decision that moved them.' },
    { q: 'Why part-time ads for one small business?',
      listen: 'Interest in one account over time. Watch for so many clients they cannot check ours weekly.' }] },
  { section: 'Their work, on screen (8 min)', questions: [
    { q: 'Share your screen and show me an account you run (or screenshots): the campaigns, the search terms report and the conversions.',
      listen: 'Organised campaigns, negatives in use, conversions that are real actions, not page views.' },
    { q: 'What was your worst campaign, and what did you learn?',
      listen: 'An honest failure and a concrete lesson.' }] },
  { section: 'Live task (7 min)', questions: [
    { q: 'I will share a search terms list. In 5 minutes, mark the negatives and the keywords worth their own ad group, and say why.',
      listen: 'Fast, sensible calls about intent; spots DIY, jobs and free searches; finds the high-intent local ones.' }] },
  { section: 'Our account (6 min)', questions: [
    { q: 'With $600 a month, what would you do in week one?',
      listen: 'Tracking first, then focused Search on high-intent local terms, then a weekly routine.' },
    { q: 'How do you decide an ad is working?',
      listen: 'Cost per quote request and orders, and profit, not clicks or impressions.' }] },
  { section: 'Practical check (3 min)', questions: [
    { q: 'Show me your internet speed test and confirm the weekly hours we posted. Any conflicts?',
      listen: 'At least 25 Mbps down and a clear answer on the weekly check-in times.' }] },
  { section: 'Their questions (3 min)', questions: [
    { q: 'What would you like to know about us?',
      listen: 'Questions about margins, customers and seasons show they think about profit.' }] },
];

module.exports = {
  key: 'ads',
  label: 'Ads specialist (part-time)',
  job: 'a part-time remote ads specialist who runs Google Ads and Meta (Facebook and Instagram) ads on a small budget, aimed at quote requests and orders',
  reward: 'Reward specialists who set up tracking first, focus a small budget on high-intent searches, cut waste with negatives and tight targeting, judge ads on profit rather than clicks, write only honest claims, and explain results plainly.',
  minutes: MINUTES,
  intro: INTRO, parts: PARTS, weights: WEIGHTS, choice: MULTIPLE_CHOICE, written: WRITTEN, guide: INTERVIEW_GUIDE,
};
