'use strict';

/* The owner's answers to the "[owner to fill in: ...]" blanks in the role
   courses (owner, 2026-10-09: "enter them all as you suggested", with the ad
   budget and target lowered: "let's start slow"). courses/index.js writes
   each into its lesson and keeps the unanswered body in `was`, so the live
   Playbook copy is replaced only where June has not edited it herself. */

module.exports = {
  // Ads
  '[owner to fill in: the cost per quote request we aim for]':
    'under $15 to start.',
  '[owner to fill in: the monthly ad budget, and the most any day may spend]':
    '$100 a month to start (about $3 a day), and never more than $5 on any one day. June raises it only once the ads bring quote requests at our target',
  '[owner to fill in: how the ads person is given access to Google Ads and Meta, and at what access level]':
    'June invites your own Google account to Google Ads with Standard access, and gives you the Advertiser role in Meta Business Suite. Never a shared login.',
  '[owner to fill in: which conversions are set up in Google Ads and Meta today, and anything known to be broken]':
    'none confirmed yet. The quote form tells Google (generate_lead) and Meta (Lead) when a quote request is sent, but the Google Analytics tag ID was found to be wrong, and the Google Ads account is paused while Google verifies the business. Fixing and testing tracking is your first job, before any money is spent.',
  '[owner to fill in: the hours ads should run, when someone answers quote requests]':
    'Monday to Saturday, 7am to 9pm Chicago time.',
  '[owner to fill in: where the ads change notes are kept]':
    'a Google Doc in the shared June\'s Tees – Ads folder in Google Drive.',
  '[owner to fill in: how the ads person sees which quote requests came from ads and which became orders]':
    'every Monday, sales posts in # Sales which of last week\'s quote requests came from ads and which have paid.',

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
    'June adds you on GitHub with Write access to the junesteesnthings-backend and lumise-designer repositories, and approves every pull request before it is merged. To start, you work only with Stripe test keys and a local database: no Railway, live Stripe or Sentry access. When you need production logs or errors, ask June and she shares them.',
  '[owner to fill in: hours the developer should avoid deploying]':
    'Monday to Friday, 9am to 3pm Chicago time. Ship early in the morning or after 6pm, when you can watch for an hour',
  '[owner to fill in: how the developer reaches June in an outage]':
    'text June\'s cell, and call if she has not answered in 15 minutes. Anything not urgent goes in Direct with June.',
  '[owner to fill in: how the developer gets access to App Store Connect and the Apple developer account]':
    'June invites you to App Store Connect with the Developer role. She keeps the Account Holder and Admin roles.',
};
