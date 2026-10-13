'use strict';

/* The owner's answers to the "[owner to fill in: ...]" blanks in the role
   courses (owner, 2026-10-09: "enter them all as you suggested", with the ad
   budget and target lowered: "let's start slow"). courses/index.js writes
   each into its lesson and keeps the unanswered body in `was`, so the live
   Playbook copy is replaced only where June has not edited it herself. */

module.exports = {
  // Design (owner, 2026-10-13: approved as suggested; the shop does not pay for ChatGPT or Firefly)
  '[owner to fill in: the thread color chart we match to]':
    'the Madeira Polyneon 40 chart. Write the Madeira number for each color on the proof.',
  '[owner to fill in: minimum size and quantity for patches, vinyl and puff print]':
    'puff print 12 pieces, art at least 2in tall, lines at least 1/8in; vinyl 1 piece and up, lines at least 1/8in; patches 25 pieces, 2in to 4in.',
  '[owner to fill in: color limits for patches, vinyl and puff print]':
    'puff print 1 color; vinyl up to 3 colors, one layer each; patches up to 9 thread colors.',
  '[owner to fill in: which garments take patches, vinyl and puff print]':
    'puff print on cotton and cotton-blend tees, hoodies and caps; vinyl on cotton, poly and blends, never nylon or rain jackets; patches on hats, jackets, bags and heavier tops.',
  '[owner to fill in: the file type and settings we send to Signs365, and who uploads it]':
    'a PDF at full size, CMYK, 150 dpi, fonts outlined. You save it to the job; June uploads it to Signs365.',
  '[owner to fill in: the bleed Signs365 wants for each sign type]':
    'Bleed is 0.125in on yard signs and rigid signs, and 1in on banners (for the hems and grommets). If the Signs365 template asks for more, follow the template.',
  '[owner to fill in: which Adobe and Creative Fabrica accounts the designer uses, and where mockup templates and fonts are kept]':
    'the shop\'s Adobe Creative Cloud seat and Creative Fabrica subscription, set up for you by June. Mockup templates and fonts are in the shared June\'s Tees – Design folder in Google Drive.',
  '[owner to fill in: which AI tools and accounts the shop pays for, and which the designer may use]':
    'our site\'s AI designer and Vectorizer.ai. The shop does not pay for ChatGPT or Firefly. Nothing else without asking June.',
  '[owner to fill in: the Etsy shop, which downloads we sell, the file types and sizes each includes, and who publishes the listing]':
    'June\'s Etsy shop sells digital downloads: an SVG, a PNG at 300 dpi, and a 4000px JPG preview. You make the files and the listing images; June publishes the listing.',
  '[owner to fill in: how the designer signs in to COS Creator Studio]':
    'June invites your email to the June\'s Tees brand in COS Creator Studio. Sign in with your own account, never hers.',

  // Sales (owner, 2026-10-13: approved as suggested)
  '[standard turnaround, owner to fill in]':
    'about 10',
  '[owner to fill in: which password manager, and which tools sales uses]':
    'We use Bitwarden (free), with a shared June\'s Tees vault; June invites you. The tools you need are on the Resources page.',
  '[owner to fill in: minimum size and quantity, colour limits, which garments each one works on]':
    'puff print from 12 pieces, 1 color, art at least 2in tall, on cotton and cotton-blend tees, hoodies and caps; vinyl from 1 piece, up to 3 colors, on cotton, poly and blends but never nylon or rain jackets; patches from 25 pieces, 2in to 4in, up to 9 thread colors, on hats, jackets, bags and heavier tops',
  '[owner to fill in: new prospects per quiet hour, and first messages per day]':
    'Targets: 10 new prospects registered and 10 first messages sent a day.',
  '[owner to fill in: prospects registered per day, and first messages sent per day, for Lead Generation]':
    '10 prospects registered and 10 first messages sent a day.',
  '[owner to fill in: which customer types and which neighborhoods or suburbs to prospect first]':
    'schools, churches, family reunions and small businesses within 25 miles of the shop.',
  // Sales roles (owner, 2026-10-13: chose these from the suggestions)
  '[owner to fill in: which discounts or price matches a Closer may offer without asking, if any]':
    'up to 5% off on orders of 48 pieces or more, once June has given you discounts on Staff (your limit there is 5%). Anything else, every order under 48 pieces and every price match, goes to June first.',
  '[owner to fill in: Sales Closer targets for reply time, conversion and average order value]':
    'reply to every quote request within 1 business hour, 30% of the quotes you send become orders, and a $350 average order. My stats shows all three.',
  '[owner to fill in: Account Manager targets for reorders a month, repeat revenue and reviews]':
    '4 reorders a month, 25% of the shop\'s revenue from repeat customers, and 4 new reviews a month (every review answered within a day).',
  '[owner to fill in: the reorder timing for each customer type]':
    'schools and teams 6 weeks before each season; churches and nonprofits 3 weeks before each event, and once a year; businesses every 90 days; family reunions and events 10 months after their order, ready for next year.',
  '[owner to fill in: how a quote request passes to a Closer, and whether the sale stays credited to you]':
    'post the lead\'s link in # Sales and tag the Closer, with the five details already on the lead. The Closer builds and sends the quote. A lead you registered stays credited to you, whoever builds the quote; the Closer is paid their wage for closing it.',

  // Ads
  '[owner to fill in: the cost per quote request we aim for]':
    'under $15 to start.',
  '[owner to fill in: the monthly ad budget, and the most any day may spend]':
    /* Codex #230: Google may spend up to twice a daily budget, so a $3 daily
       budget allowed a $6 day. Half the cap keeps every day under it. */
    '$100 a month at most to start, and never more than $5 on any one day. Google may spend up to twice the daily budget on a busy day, so set it to $2.50 a day (about $76 a month): then no day can pass $5. June raises it only once the ads bring quote requests at our target',
  '[owner to fill in: how the ads person is given access to Google Ads and Meta, and at what access level]':
    'June invites your own Google account to Google Ads with Standard access, and gives you the Advertiser role in Meta Business Suite. Never a shared login.',
  '[owner to fill in: which conversions are set up in Google Ads and Meta today, and anything known to be broken]':
    'none confirmed yet. The quote form tells Google (generate_lead) and Meta (Lead) when a quote request is sent, but the Google Analytics tag ID was found to be wrong, and the Google Ads account is paused while Google verifies the business. Fixing and testing tracking is your first job, before any money is spent.',
  '[owner to fill in: the hours ads should run, when someone answers quote requests]':
    'Monday to Saturday, 7am to 9pm Chicago time.',
  '[owner to fill in: where the ads change notes are kept]':
    'a Google Doc in the shared June\'s Tees – Ads folder in Google Drive.',
  '[owner to fill in: how the ads person sees which quote requests came from ads and which became orders]':
    'every Monday, sales posts in # Everyone which of last week\'s quote requests came from ads and which have paid.',

  // Content
  '[owner to fill in: where June\'s footage goes (a shared Drive folder or another place), and how you are told new footage is there]':
    'June uploads footage to the shared June\'s Tees – Footage folder in Google Drive, one dated folder per shoot, and posts in the # Content channel when it is there.',
  '[owner to fill in: which editing and AI tools the shop pays for, and whose account you use]':
    'CapCut Pro, paid for by the shop on the shop\'s account; June sets up your sign-in. Descript may be added later for transcripts.',
  '[owner to fill in: our caption font and colors]':
    'Inter Bold, white text with a navy (#0B1F4B) outline, and our pink (#F0275A) for the one key word',
  '[owner to fill in: our TikTok, Instagram, YouTube and Facebook account names, and how the content person signs in to each]':
    'jtees228 on Facebook, Instagram, TikTok and YouTube. June adds you through Meta Business Suite and each app\'s team access, so you never need her password.',
  '[owner to fill in: whether videos are scheduled in COS Creator Studio or posted in each app]':
    'in COS Creator Studio, for every platform it can post to, so June approves every post on one calendar.',
  '[owner to fill in: how many shorts and how many longer videos a week]':
    '3 shorts a week, and 1 longer YouTube video a month',
  '[owner to fill in: where the Friday numbers are kept]':
    'a Google Sheet in the June\'s Tees – Footage folder.',

  // Bookkeeper
  '[owner to fill in: every account money comes into or goes out of: bank, cards, Stripe, PayPal, cash]':
    'the business bank account, Stripe, cash and checks, PayPal if still in use, and Clover (rarely used). June confirms the full list with you in your first week',
  '[owner to fill in: how the bookkeeper sees the Finances page figures and exports]':
    'June gives you read-only access. Finances is in your menu, and you can download the expense, payment and sales tax reports from it, but only June can change anything there.',
  '[owner to fill in: where receipts are kept]':
    'the Receipts folder inside the shared June\'s Tees – Books folder in Google Drive, one folder per month',
  '[owner to fill in: who files the ST-1 and pays it, and from which account]':
    'June files it on MyTax Illinois and pays from the business bank account. You have the month\'s figures ready for her by the 15th.',
  '[owner to fill in: which bookkeeping software we use, and how the bookkeeper signs in]':
    'books.jtees.net, the shop\'s own bookkeeping app; June sets up your sign-in.',

  // Developer
  '[owner to fill in: which Claude account and plan the developer uses for Claude Code, paid by the shop]':
    'Your own Claude Pro or Max subscription, in your name and paid for by the shop. Never June\'s login: her accounts run other work overnight.',
  '[owner to fill in: which other sites and apps the developer looks after, and where each lives]':
    'For now, jtees.net and the design studio at design.jtees.net. Other projects only when June asks.',
  '[owner to fill in: how the developer is given access to GitHub, Railway, Sentry and Stripe, and at what level]':
    'June adds you on GitHub with Write access to the junesteesnthings-backend and lumise-designer repositories, and approves every pull request before it is merged. The repository rules tell Claude Code to merge its own finished pull request; you do not: tell it to stop at an open pull request, and GitHub keeps main locked until June approves. To start, you work only with Stripe test keys and a local database: no Railway, live Stripe or Sentry access. When you need production logs or errors, ask June and she shares them.',
  '[owner to fill in: hours the developer should avoid deploying]':
    'Monday to Friday, 9am to 3pm Chicago time. Ship early in the morning or after 6pm, when you can watch for an hour',
  '[owner to fill in: how the developer reaches June in an outage]':
    'text June\'s cell, and call if she has not answered in 15 minutes. Anything not urgent goes in Direct with June.',
  '[owner to fill in: how the developer gets access to App Store Connect and the Apple developer account]':
    'June invites you to App Store Connect with the Developer role. She keeps the Account Holder and Admin roles.',
};
