'use strict';

/* The Content course lessons as pages, the same way design-core-pages.js
   does the Design course: `from` is the bold heading a page starts at, and
   every page ends with a couple of questions about what it just said
   (multiple choice, answered on the page, never marked). */

const q = (text, choices, answer, why) => ({ q: text, choices, answer, why });

module.exports = {
  'c2-why': [
    { from: null, checks: [
      q('Why do videos matter to a custom shirt shop?', ['They earn trust faster than anything we can write', 'They replace quotes', 'They are required by law'], 0, 'People order when they trust we will get it right.'),
      q('Which is a "result" video?', ['A finished order, boxed and ready', 'Our logo spinning', 'A blank screen with music'], 0, 'Show the work, the result, and that we know our trade.'),
    ] },
    { from: 'The first two seconds', checks: [
      q('What comes first in a short?', ['A logo intro', 'The hook: the payoff', '"Hi everyone"'], 1, 'Most people decide in the first second or two.'),
      q('Good on-screen text for a hook is…', ['"Welcome to our channel"', '"200 shirts. 1 day. Watch the first one."', 'Our phone number'], 1, 'Text that makes people want to see the end.'),
    ] },
    { from: 'One idea, one next step', checks: [
      q('How many calls to action does a video end with?', ['One', 'Four', 'None'], 0, 'Two asks at once get neither.'),
      q('A short about everything we do is…', ['Perfect', 'Too much: one idea per video', 'Required'], 1, 'One idea per video.'),
    ] },
  ],
  'c3-plan': [
    { from: null, checks: [
      q('Who films the footage?', ['June, on her phone, while she works', 'A hired crew', 'Customers'], 0, 'So the shot list has to be quick to follow.'),
      q('How do you find out which jobs print next week?', ['Guess', 'Ask June in your team channel', 'Call customers'], 1, 'Then pick the ones worth filming.'),
    ] },
    { from: 'A shot list June can follow', checks: [
      q('How long is each shot on the list?', ['5 to 10 seconds, holding still 2 seconds before and after', '1 second', '5 minutes'], 0, 'Enough to cut from, quick for June.'),
      q('For a planned YouTube video, the main shots are filmed…', ['Vertical only', 'Twice: once vertical, once sideways', 'Sideways only'], 1, 'Shorts are vertical; YouTube is sideways.'),
    ] },
    { from: 'Permission before filming', checks: [
      q('Who asks the customer before their design is filmed for posting?', ['June', 'You, by phone', 'Nobody'], 0, 'June asks when she films.'),
      q('A shipping label with an address is in the shot. You…', ['Keep it', 'Do not post it', 'Make it smaller'], 1, 'Never a customer\'s name, address or price.'),
    ] },
  ],
  'c3-footage': [
    { from: null, checks: [
      q('When do you copy new footage to your project folder?', ['The same day', 'Next month', 'Never'], 0, 'Phones replace clips and shared folders fill up.'),
      q('Why treat footage carefully?', ['June cannot film the same first print twice', 'It is expensive to store', 'It is not important'], 0, 'Footage is the raw material for everything.'),
    ] },
    { from: 'One folder per shoot', checks: [
      q('A shoot folder name starts with…', ['The date', 'IMG', 'Your name'], 0, 'Date first so folders sort in order.'),
      q('The three folders inside each shoot are…', ['raw, project, exports', 'old, new, final', 'a, b, c'], 0, 'Raw stays as filmed; exports are finished videos.'),
    ] },
    { from: 'Your editing tools', checks: [
      q('Shop work is edited in…', ['The shop\'s accounts', 'Your personal free trial', 'Whatever is quickest'], 0, 'So the projects stay with the shop.'),
      q('How long do you keep the project file after posting?', ['At least a month', 'Delete it at once', 'One day'], 0, 'A fix is quicker from the project.'),
    ] },
  ],
  'c4-edit': [
    { from: null, checks: [
      q('A short needs how many shots?', ['Three to six is plenty', 'Fifty', 'One'], 0, 'Setup, the work, the result.'),
      q('What do you build before music and captions?', ['A rough cut that works on its own', 'The thumbnail', 'The hashtags'], 0, 'If it works with no music, it only gets better.'),
    ] },
    { from: 'Cutting for pace', checks: [
      q('June explains the press. On screen you show…', ['Her face the whole time', 'The press, as b-roll', 'A black screen'], 1, 'Show the thing she is explaining.'),
      q('A machine runs for a minute. You…', ['Keep the whole minute', 'Speed it up', 'Cut it all'], 1, 'Speed up slow parts rather than losing them.'),
    ] },
    { from: 'A vertical frame', checks: [
      q('Where do you keep the subject?', ['In the middle of the frame', 'The right edge', 'The very bottom'], 0, 'Buttons on the right, captions at the bottom.'),
      q('A clip was filmed sideways. In a short you…', ['Leave black bars', 'Crop in on the action', 'Skip it'], 1, 'Crop in rather than black bars.'),
    ] },
  ],
  'c4-finish': [
    { from: null, checks: [
      q('How many words on screen at a time?', ['Two to five', 'A whole paragraph', 'One letter'], 0, 'Large, high-contrast, easy to read.'),
      q('Where do auto-captions go wrong most?', ['Names, numbers, prices and dates', 'Short words', 'Never'], 0, 'Proofread every word.'),
    ] },
    { from: 'Sound', checks: [
      q('After noise clean-up you…', ['Listen back on headphones', 'Post at once', 'Add more clean-up'], 0, 'Over-cleaned voices sound robotic.'),
      q('The sound of the press is…', ['Worth keeping in the mix', 'Always removed', 'Illegal'], 0, 'Satisfying shop sounds help.'),
    ] },
    { from: 'Export', checks: [
      q('A YouTube video is exported at…', ['1920 x 1080 (16:9)', '1080 x 1920', '500 x 500'], 0, 'Shorts are 9:16; YouTube videos 16:9.'),
      q('The last check before posting is…', ['Watching the final export on your phone, sound off and on', 'Asking AI', 'None'], 0, 'Check story, sound, captions and privacy.'),
    ] },
  ],
  'c5-rules': [
    { from: null, checks: [
      q('Why can a trending song get our video muted?', ['Business accounts are not licensed for most of them', 'It is too loud', 'It is too old'], 0, 'Use the commercial music library.'),
      q('Is a video with no music OK?', ['Yes: shop sounds and June\'s voice often work better', 'No, never', 'Only on YouTube'], 0, 'No music is fine.'),
    ] },
    { from: 'People on camera', checks: [
      q('Who keeps the written permission?', ['June, with the job', 'Nobody', 'The customer only'], 0, 'A message or email saying yes, kept with the job.'),
      q('A school name on kids\' shirts with faces showing needs…', ['A parent\'s or the team\'s permission', 'Nothing', 'A filter'], 0, 'It identifies the children.'),
    ] },
    { from: 'What else to check in every frame', checks: [
      q('A misprint is visible in the background. You…', ['Leave it out', 'Post it', 'Point an arrow at it'], 0, 'Nothing a customer would be unhappy to see.'),
      q('When in doubt about a shot, you…', ['Leave it out or ask June', 'Post and see', 'Ask a commenter'], 0, 'Fixing a posted video means it has been seen.'),
    ] },
  ],
  'c5-ai': [
    { from: null, checks: [
      q('A transcript helps you…', ['Find the best line by reading', 'Pick music', 'Get followers'], 0, 'Reading beats scrubbing through the clip.'),
      q('AI suggests ten clips for shorts. You…', ['Post all ten', 'Choose the ones that make us look good', 'Ignore them all'], 1, 'You still choose.'),
    ] },
    { from: 'Check everything it made', checks: [
      q('Is "the tool did it" a check?', ['Yes', 'No: watch the final export yourself'], 1, 'AI is wrong in ways that look right.'),
      q('In a prompt, the customer is called…', ['By full name', '"The customer"', 'By email address'], 1, 'Customer details never go into any AI tool.'),
    ] },
    { from: 'What AI must never make', checks: [
      q('An AI shirt in a color we cannot print is…', ['Fine', 'Never OK: it shows work better than it really is', 'OK on TikTok'], 1, 'Never our work looking better than it is.'),
      q('Which needs an AI label?', ['A realistic AI-made person', 'AI noise clean-up', 'An AI-suggested title'], 0, 'Realistic AI imagery or voice gets labeled.'),
    ] },
  ],
  'c6-many': [
    { from: null, checks: [
      q('Which do you edit first from a shoot?', ['The shorts', 'The YouTube video', 'The thumbnail'], 0, 'Shorts post fastest.'),
      q('Where does the plan for a shoot\'s pieces go?', ['A list in the shoot folder', 'Nowhere', 'A comment'], 0, 'Plan before you edit.'),
    ] },
    { from: 'Each short stands on its own', checks: [
      q('Every short from one shoot opens on the same shot. The problem?', ['None', 'People scroll past the second one', 'It is too long'], 1, 'Different openings.'),
      q('A longer video\'s title should…', ['Answer what someone would search for', 'Be a joke', 'Be our name only'], 0, 'Clear and searchable.'),
    ] },
    { from: 'Working with the designer', checks: [
      q('Where do you say which stills would make a good carousel?', ['Your team channel', 'A customer email', 'Nowhere'], 0, 'Same plan, shared in the channel.'),
      q('Same moment as a video and a carousel on the same day?', ['Yes', 'No'], 1, 'Spread them out.'),
    ] },
  ],
  'c6-posting': [
    { from: null, checks: [
      q('Longer videos go to…', ['YouTube', 'TikTok only', 'Nowhere'], 0, 'Shorts go everywhere; longer videos to YouTube.'),
      q('Shorts go to…', ['TikTok, Reels, YouTube Shorts and Facebook', 'Only Facebook', 'Only our website'], 0, 'Cross-post with a caption for each.'),
    ] },
    { from: 'A caption for each platform', checks: [
      q('Where does the jtees.net link go on YouTube?', ['In the description', 'Nowhere', 'In the thumbnail only'], 0, 'Title says what it is; description has the link.'),
      q('Always safe in any caption:', ['"Get a free quote at jtees.net"', '"50% off today"', '"Ready tomorrow"'], 0, 'Never an unapproved price, discount or date.'),
    ] },
    { from: 'When and how often', checks: [
      q('How do you find the best posting times?', ['Each app\'s analytics', 'Guess', 'Always midnight'], 0, 'Post when our followers are online.'),
      q('After posting, you…', ['Open it on your phone and log it', 'Close the app', 'Delete the export'], 0, 'Check it plays, captions are clear, the link works.'),
    ] },
  ],
  'c7-comments': [
    { from: null, checks: [
      q('Why do replies help twice?', ['Viewers become customers, and the apps show the video to more people', 'They do not', 'They cost less'], 0, 'Every reply helps twice.'),
      q('You do not know the answer to a question. You…', ['Say you will find out, and come back', 'Make one up', 'Ignore it'], 0, 'Answer what was asked, or come back.'),
    ] },
    { from: 'Someone wants to order', checks: [
      q('Where do you post a would-be customer\'s profile link?', ['The # Sales channel', 'Nowhere', 'Your own account'], 0, 'So sales can follow up the same day.'),
      q('A rough price in a comment is…', ['Fine', 'Never yours to give'], 1, 'Prices come from sales and June.'),
    ] },
    { from: 'Criticism and complaints', checks: [
      q('Why never delete fair criticism?', ['Other people judge us by how we reply', 'It is against the law', 'It helps the algorithm'], 0, 'Reply calmly and invite them to message.'),
      q('Who hears about a complaint the same day?', ['June', 'Nobody', 'The commenter\'s friends'], 0, 'Tell June before replying further.'),
    ] },
    { from: 'Spam, abuse and trolls', checks: [
      q('Before deleting an abusive comment you…', ['Screenshot it', 'Reply to it', 'Share it'], 0, 'Keep a record, then tell June.'),
      q('Does every rude comment need a reply?', ['Yes', 'No'], 1, 'A joke can get a friendly reply, or nothing.'),
    ] },
  ],
  'c8-numbers': [
    { from: null, checks: [
      q('Which number shows people cared enough to pass a video on?', ['Shares', 'Upload date', 'File size'], 0, 'Shares and saves.'),
      q('Where are the weekly numbers kept?', ['In one place, the same way every week', 'In your head', 'Different each week'], 0, 'So you can compare.'),
    ] },
    { from: 'Reading the retention graph', checks: [
      q('A steady slope on the graph is…', ['Normal', 'A disaster', 'An error'], 0, 'People drift away; slower is better.'),
      q('A big drop in the first 2 seconds means…', ['The hook did not work', 'The ending is weak', 'Nothing'], 0, 'Try a different first shot or text.'),
    ] },
    { from: 'Learning from it', checks: [
      q('Whose videos do you copy first?', ['Our own best ones', 'Any viral one', 'Our competitors\''], 0, 'Copy what works from our own first.'),
      q('Engagement groups and follow-for-follow are…', ['Never used', 'Great for growth', 'Fine on weekends'], 0, 'They bring no customers and hurt reach.'),
    ] },
    { from: 'Your Friday summary for June', checks: [
      q('How long is the Friday summary?', ['About five lines', 'Ten pages', 'One word'], 0, 'She can read it in a minute.'),
      q('What footage you need next week goes…', ['In the summary', 'Nowhere', 'In a comment'], 0, 'What you will try and what you need from her.'),
    ] },
  ],
};
