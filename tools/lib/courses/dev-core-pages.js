'use strict';

/* The Developer course lessons as pages, the same way design-core-pages.js
   does the Design course: `from` is the bold heading a page starts at, and
   every page ends with a couple of questions about what it just said
   (multiple choice, answered on the page, never marked). */

const q = (text, choices, answer, why) => ({ q: text, choices, answer, why });

module.exports = {
  'v2-stack': [
    { from: null, checks: [
      q('The backend is…', ['One Node.js and Express app', 'A WordPress site', 'Many microservices'], 0, 'One app does most of it.'),
      q('Shared rules live in…', ['tools/lib, with tests in tests/', 'public/', 'The database'], 0, 'Each with its tests.'),
    ] },
    { from: 'Its database', checks: [
      q('A schema change must be…', ['Safe to run on every start', 'Run once by hand'], 0, 'It runs at every boot.'),
      q('Who else receives Stripe\'s events?', ['The design studio', 'Nobody'], 0, 'Both services.'),
    ] },
    { from: 'Around them', checks: [
      q('Where are environment variables kept?', ['Railway', 'GitHub'], 0, 'Railway hosts both services.'),
      q('Where do you find a page\'s code?', ['Search server.js for its route', 'In Stripe'], 0, 'For example app.get(\'/admin/design\'.'),
    ] },
  ],
  'v2-ship': [
    { from: null, checks: [
      q('A branch is named for…', ['What it does', 'Your name', 'The date only'], 0, 'fix-refund-email, add-banner-sizes.'),
      q('Which check runs on every pull request?', ['radar-gate', 'None'], 0, 'Read its comment if it fails.'),
    ] },
    { from: 'Watching a deploy', checks: [
      q('A healthy deploy\'s logs show…', ['The database ready and the server listening, no errors', 'Nothing'], 0, 'Read the start of the logs.'),
      q('After deploying a page change you…', ['Open it on your phone', 'Assume it works'], 0, 'Try the thing you fixed.'),
    ] },
    { from: 'When not to deploy', checks: [
      q('Deploy just before you stop for the day?', ['No: deploy when you can watch for an hour', 'Yes'], 0, 'Watch every deploy.'),
      q('Before starting a task you check…', ['Nobody has an open pull request for it', 'Nothing'], 0, 'Two people, one repo.'),
    ] },
  ],
  'v3-incident': [
    { from: null, checks: [
      q('Your first message in an outage includes…', ['When you will update next', 'The fix'], 0, 'Then keep that time.'),
      q('Reproducing means…', ['Trying it yourself with console and network open', 'Asking a customer to try again'], 0, 'Write down the exact error.'),
    ] },
    { from: 'Read the logs', checks: [
      q('Sentry shows…', ['New errors with the line they came from', 'Ad spend'], 0, 'Errors.'),
      q('An expired Stripe key looks like…', ['Broken code', 'A slow page'], 0, 'Check the other side too.'),
    ] },
    { from: 'Roll back first', checks: [
      q('Fixing forward on live under pressure tends to…', ['Turn one outage into two', 'Help'], 0, 'Roll back first.'),
      q('Updates to June say…', ['What you know, what you did, what is next', 'Stack traces'], 0, 'No jargon.'),
    ] },
  ],
  'v3-after': [
    { from: null, checks: [
      q('Who contacts affected customers?', ['June', 'Your code, automatically'], 0, 'You give her the list.'),
      q('A payment taken but not marked paid leads to…', ['Chasing a customer who already paid', 'Nothing'], 0, 'Find every such order.'),
    ] },
    { from: 'The test that would have caught it', checks: [
      q('Ask why until…', ['The answer is something you can change', 'You are tired'], 0, 'Fix the cause.'),
      q('Without a regression test, the bug…', ['Can quietly return', 'Is gone forever'], 0, 'Every fix gets one.'),
    ] },
    { from: 'The summary for June', checks: [
      q('The summary is sent…', ['The same day', 'Next month'], 0, 'Short and plain.'),
      q('It ends with…', ['Anything she needs to do or decide', 'A joke'], 0, 'Clear asks.'),
    ] },
  ],
  'v4-secrets': [
    { from: null, checks: [
      q('May a secret appear in a screenshot?', ['No', 'Yes'], 0, 'Never in code, chat, email, screenshots or prompts.'),
      q('Keys shared by both services are rotated…', ['Together', 'One at a time weeks apart'], 0, 'Change both together.'),
    ] },
    { from: 'Live data', checks: [
      q('A correction to money is…', ['A new row', 'An edit'], 0, 'Money is a ledger.'),
      q('Before a data-rewriting change ships you…', ['Take a backup and know how to undo it', 'Hope'], 0, 'Backups first.'),
    ] },
    { from: 'Customer data', checks: [
      q('Test emails use…', ['example.com', 'Real customers'], 0, 'Made-up customers.'),
      q('Designers see customer addresses?', ['No, keep it that way', 'Yes'], 0, 'Only what the job needs.'),
    ] },
  ],
  'v4-abuse': [
    { from: null, checks: [
      q('$1 in a query means…', ['A value passed separately', 'One dollar'], 0, 'Parameterised.'),
      q('Typed text going into HTML is…', ['Escaped', 'Inserted as-is'], 0, 'escEmail.'),
    ] },
    { from: 'Who can see what', checks: [
      q('A customer\'s order link uses…', ['A long random token', 'A counting number'], 0, 'So nobody can guess another.'),
      q('A total sent from a form is…', ['Recomputed on the server', 'Trusted'], 0, 'Never trust the browser.'),
    ] },
    { from: 'What comes in from outside', checks: [
      q('Body and upload sizes are…', ['Limited', 'Unlimited'], 0, 'Size and length limits everywhere.'),
      q('A customer sees a database error?', ['Never: a plain message', 'Yes, the full stack'], 0, 'Details go to logs and Sentry.'),
    ] },
  ],
  'v5-payments': [
    { from: null, checks: [
      q('Where are the money rules written?', ['The repository\'s AGENTS.md', 'Nowhere'], 0, 'Read them before touching money code.'),
      q('The price shown and charged come from…', ['The same code', 'Two places'], 0, 'Two places will one day disagree.'),
    ] },
    { from: 'Webhooks, not the browser', checks: [
      q('The return page and the webhook call…', ['The same function', 'Different functions'], 0, 'So they cannot disagree.'),
      q('The new-order alert is sent when…', ['Payment is confirmed', 'The row is created'], 0, 'Rows exist before payment.'),
    ] },
    { from: 'Testing a payment change', checks: [
      q('End to end in Stripe test mode, you check the order shows paid…', ['Once', 'At least twice'], 0, 'And the email went once.'),
      q('A script writing money rows on live needs…', ['A backup and June\'s yes', 'Nothing'], 0, 'Never without both.'),
    ] },
  ],
  'v5-refunds': [
    { from: null, checks: [
      q('A refund can fail at the bank…', ['Weeks later', 'Never'], 0, 'So refunded totals can go down.'),
      q('What catches an event that never arrived?', ['The hourly pass', 'Nothing'], 0, 'Hourly reconciliation.'),
    ] },
    { from: 'Disputes', checks: [
      q('Does an open dispute move the ledger?', ['Not until it is lost', 'Yes, at once'], 0, 'Recorded from the day it opens.'),
      q('Tax for a filed month is read from…', ['The stored figure on each payment', 'Today\'s quote'], 0, 'Never recompute it.'),
    ] },
    { from: 'Other people\'s systems', checks: [
      q('A scheduled job that failed answers…', ['An error status', '200 with "failed" in the body'], 0, 'So someone is told.'),
      q('Twilio accepting a text means it was…', ['Accepted, not yet delivered', 'Delivered'], 0, 'Ask for the delivery report.'),
    ] },
  ],
  'v6-tests': [
    { from: null, checks: [
      q('You compare your test failures with…', ['main', 'Yesterday\'s mood'], 0, 'Add no new failures.'),
      q('When do you run all the tests?', ['Before the pull request', 'Never'], 0, 'Area tests while working; all before the PR.'),
    ] },
    { from: 'What to test', checks: [
      q('New SQL is tried against…', ['A real Postgres', 'A mock only'], 0, 'Mocks accept any SQL.'),
      q('A test that passes before your fix proves…', ['Nothing about your fix', 'Everything'], 0, 'It must fail first.'),
    ] },
    { from: 'Trying it for real', checks: [
      q('To check a save works you…', ['Refresh and see it is still there', 'Trust the success message'], 0, 'Persisted, not just shown.'),
      q('Something you could not test is…', ['Said in the pull request, with manual steps', 'Hidden'], 0, 'Honest gaps.'),
    ] },
  ],
  'v6-claude': [
    { from: null, checks: [
      q('A line you cannot explain…', ['Does not ship', 'Ships anyway'], 0, 'You own it.'),
      q('AI tools often…', ['Tidy and add things nobody asked for', 'Do exactly the minimum'], 0, 'Check scope.'),
    ] },
    { from: 'The rules it works by', checks: [
      q('When Claude Code breaks an AGENTS.md rule…', ['The rule wins', 'Claude wins'], 0, 'Read it once fully.'),
      q('Customer data in a prompt is…', ['Never allowed', 'Fine if short'], 0, 'Use made-up examples.'),
    ] },
    { from: 'Good ways to use it', checks: [
      q('A good use of Claude Code:', ['Writing tests for code that has none', 'Pasting live keys'], 0, 'Then read and run them.'),
      q('It cites a function. You…', ['Open the file to check it exists', 'Trust it'], 0, 'It sometimes invents things.'),
    ] },
  ],
  'v7-apps': [
    { from: null, checks: [
      q('Every upload needs…', ['A bumped version and build number', 'Nothing new'], 0, 'Apple refuses duplicates.'),
      q('Update the Expo SDK…', ['Before a release, not on the day', 'Never'], 0, 'Keep it current.'),
    ] },
    { from: 'Testing', checks: [
      q('The reviewer needs, for a sign-in app…', ['A working demo account in the notes', 'Nothing'], 0, 'Or the review stalls.'),
      q('If accounts can be made in the app, deleting one must be…', ['Possible in the app', 'By email only'], 0, 'Apple requires it.'),
    ] },
    { from: 'When it is rejected', checks: [
      q('A rejection names…', ['The guideline it broke', 'Nothing'], 0, 'Fix exactly that.'),
      q('After fixing you…', ['Reply in App Store Connect and tell June', 'Say nothing'], 0, 'Plain words, new date.'),
    ] },
  ],
  'v7-quiet': [
    { from: null, checks: [
      q('Security updates are applied…', ['On a branch, with the tests run', 'Straight to main'], 0, 'Same path as every change.'),
      q('A quiet afternoon ends with…', ['A note to June', 'Nothing'], 0, 'What you checked and fixed.'),
    ] },
    { from: 'Talking to June', checks: [
      q('Lead with…', ['What it means for customers and money', 'Technical detail'], 0, 'Then what you did.'),
      q('Bad news goes to June…', ['Early', 'Late'], 0, 'With what you are doing about it.'),
    ] },
    { from: 'What is June\'s', checks: [
      q('A new monthly paid service is…', ['June\'s call', 'Yours'], 0, 'Anything that costs money.'),
      q('Your end-of-day note includes…', ['What is open and on whom', 'Nothing'], 0, 'And what you do first tomorrow.'),
    ] },
  ],
};
