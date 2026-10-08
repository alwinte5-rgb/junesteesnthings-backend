'use strict';

/* The applicant test for the content editor, in the same shape as the sales
   one in hiring.js (see ROLES there). Everything else is shared by every role.

   What the job is: editing prerecorded footage and AI-assisted content into
   videos for YouTube, TikTok, Instagram Reels, YouTube Shorts and Facebook,
   and growing organic (unpaid) engagement: hooks, captions, posting rhythm,
   replying to comments, trends. AI tools are part of the job; checking what
   they produce, and the rules on music, consent and disclosure, matter as
   much as speed. */

const MINUTES = 30;

const INTRO = `This test takes about ${MINUTES} minutes. It is the same kind of work you would do for us every day:
judging what makes a video work on each platform, planning edits from raw footage, growing a following
without paid ads, and deciding what to do when nobody is telling you what to do.
You do not need editing software for this test: everything is written. Please do not use ChatGPT or other
AI tools to write your answers: we want to see how you think.`;

const PARTS = {
  choice: { label: 'Part 1: Content judgment', note: '8 questions, about 6 minutes. Pick what you would really do.' },
  craft: { label: 'Part 2: Editing', note: 'About 13 minutes. Be specific: platforms, timings, tools, settings.' },
  growth: { label: 'Part 3: Organic growth', note: 'About 10 minutes. No paid ads: how would you grow it?' },
  bonus: { label: 'Part 4: Bonus', note: 'Optional, about 3 minutes. This can change the direction of your interview.' },
};

const WEIGHTS = { choice: 25, craft: 40, growth: 35 };

const MULTIPLE_CHOICE = [
  { id: 'hook', q: 'What should the first 2 seconds of a TikTok or Reel show?',
    choices: ['Our logo animation', 'A slow intro: "Hi everyone, welcome back"',
      'The most interesting moment or the payoff (the finished shirt, the reveal) with on-screen text that makes people stay',
      'A black screen with music'],
    answer: 2, why: 'Most people decide in the first second or two. Lead with the payoff or a question the video answers; logos and greetings lose them.' },
  { id: 'repurpose', q: 'You have a 20-minute YouTube video. What is the best way to turn it into short videos?',
    choices: ['Post the first 60 seconds', 'Cut 3 to 5 moments that make sense on their own, reframe them to 9:16 with the subject in frame, add captions and a new hook to each',
      'Speed the whole video up to fit in 60 seconds', 'Post the full video on TikTok'],
    answer: 1, why: 'A short works on its own: one idea, framed vertically, captioned for sound-off viewing, with its own hook.' },
  { id: 'music', q: 'A trending song would be perfect for a video on our business account. What do you do?',
    choices: ['Use it: everyone does', 'Use it quietly under the voice-over',
      'Use the platform\'s commercial sound library or licensed music. Most trending songs are not licensed for business accounts',
      'Use 10 seconds of it, since short clips are always fine'],
    answer: 2, why: 'Business accounts get muted, taken down or struck for unlicensed music. Commercial libraries and licensed tracks are safe.' },
  { id: 'aicheck', q: 'An AI tool wrote the captions and subtitles for a video. What do you do before posting?',
    choices: ['Post it: AI captions are accurate', 'Proofread every word, especially names, the brand, prices and dates, and fix the timing',
      'Turn captions off', 'Ask the AI to check itself'],
    answer: 1, why: 'AI captions get names, brands and numbers wrong. One wrong price or a misspelt school name on a public post costs more than the check.' },
  { id: 'fake', q: 'The owner wants more reviews in our videos. Someone suggests an AI-generated "customer" talking about us. What do you say?',
    choices: ['Great idea, it is cheaper than real customers', 'Only if the voice sounds real',
      'No: a fake customer misleads people and breaks platform rules. Use real customers who agree to it, and label AI content where the platform requires it',
      'Use it but do not tell anyone'],
    answer: 2, why: 'Fake testimonials mislead customers and can get the account removed. Real customers with permission, and honest AI labels, build trust.' },
  { id: 'consent', q: 'You have great footage of a kids\' soccer team wearing our shirts. What do you check before posting?',
    choices: ['Nothing: they are wearing our shirts', 'That the music is good',
      'That we have permission from the team or parents, and leave out or blur children\'s faces and names if we do not',
      'That the video is under 60 seconds'],
    answer: 2, why: 'Children on a business account need permission from their parents or the team. Without it, keep faces and names out.' },
  { id: 'hate', q: 'A comment says: "These shirts look cheap. $20 for a tee is a ripoff." What do you do?',
    choices: ['Delete it', 'Argue that they are wrong',
      'Reply calmly and kindly with what makes our shirts worth it, invite them to message us, and tell the owner if it is about a real order',
      'Block them'],
    answer: 2, why: 'A calm, helpful reply in public wins over the people reading it. Fair criticism is never deleted; real order problems go to the owner.' },
  { id: 'metrics', q: 'A video got 1,000 views but most people left after 3 seconds. What do you do next?',
    choices: ['Pay to promote it', 'Delete it',
      'Look at where viewers dropped off, and test a stronger opening (a different first shot or on-screen text) on the next videos',
      'Post the same video again'],
    answer: 2, why: 'The retention graph shows exactly where people leave. Fixing the opening on the next videos is how organic reach grows.' },
];

const WRITTEN = [
  { id: 'plan', part: 'craft', minutes: 6, label: 'Plan the edits from raw footage',
    prompt: 'You get 45 minutes of raw footage of June\'s Tees printing 200 shirts for a high school: setting up the screens, the first print, the stack of finished shirts, and the coach picking them up. Plan what you would make from it for YouTube, TikTok, Instagram Reels and YouTube Shorts. For ONE short video, describe the first 3 seconds exactly, then the rest, with the captions, music, and the tools you would use (including any AI tools).',
    rubric: 'Plans several pieces from one shoot (a longer YouTube video or behind-the-scenes, several shorts, stills or a carousel); each short has one idea and a strong hook in the first 1 to 3 seconds (the satisfying print pull, the reveal, the coach\'s reaction, on-screen text that creates curiosity); vertical 9:16, burned-in captions for sound-off viewing, licensed or platform music, a call to action that fits (order link, comment prompt); names real tools (Premiere Pro, CapCut, DaVinci Resolve, Descript, Final Cut) and uses AI sensibly (transcripts, finding clips, cleaning audio) with a check; mentions permission for the school, players or coach on camera. Generic plans with no timings or specifics score 2 or lower.',
    model: "From one shoot: a 6 to 8 minute YouTube video (\"How we print 200 shirts for a high school\"), 4 shorts, and 5 stills for a carousel.\n\nShort 1, 25 seconds, \"The first pull\":\n0-1s: close-up of the squeegee pulling the first print, the school logo appearing. Text: \"200 shirts. 1 day. Watch the first one.\"\n1-3s: the shirt lifted off the press, slow motion.\nThen: 3 fast cuts of the setup (screens, ink, press) on the beat, the stack growing in a time-lapse, and the coach's reaction at pickup to end on. Last frame: \"Team order? Link in bio.\"\nCaptions burned in (white, black outline, kept clear of the app buttons), a commercial-library track, 9:16.\n\nTools: Premiere Pro or CapCut. Descript to transcribe the coach and find the best line fast. AI audio clean-up on the shop noise. I check every caption by hand and confirm the school and coach agreed to be shown.",
  },
  { id: 'workflow', part: 'craft', minutes: 4, label: 'Your workflow',
    prompt: 'Walk us through how you take one raw video to published posts on three platforms: your steps, export settings (resolution, aspect ratio, frame rate), file naming, where AI tools help, and how you check what the AI produced.',
    rubric: 'A real, ordered workflow: organise and name files, rough cut, tighten, captions, color and audio, music, exports per platform (1080x1920 9:16 for shorts, 1920x1080 16:9 for YouTube, 30 or 60fps, high bitrate), thumbnails and titles, captions and hashtags per platform, posting at good times, logging results; names where AI helps (transcripts, clip finding, auto-captions, audio clean-up, ideas for titles) and how it is checked (proofreading, listening back, watching the final export); a clear naming and folder system so footage can be found and reused.',
    model: "1. Copy the footage into a dated folder (2026-10-04_LincolnHS_print), with raw/, project/ and exports/ inside.\n2. Transcribe with Descript (AI) and mark the best moments from the transcript.\n3. Rough cut in Premiere, then tighten: cut every pause and breath, keep the pace.\n4. Audio: AI noise clean-up, then I listen back with headphones; music from the platform's commercial library at -20 dB under voice.\n5. Captions: auto-generate, then proofread every word, especially names and prices.\n6. Export: 1080x1920 9:16 at 30fps for TikTok, Reels and Shorts; 1920x1080 16:9 for YouTube, with a custom thumbnail.\n7. Write a caption, title and hashtags for each platform (AI drafts ideas, I write the final), schedule at our best times, and log views, watch time and comments in a sheet a week later.",
  },
  { id: 'portfolio', part: 'craft', minutes: 3, label: 'Your work',
    prompt: 'Share links to 2 or 3 videos you edited (YouTube, TikTok, Instagram or Google Drive). Pick ONE and tell us: what the goal was, what you did (editing, hook, captions, any AI tools), and how it performed (views, watch time, followers, or sales).',
    rubric: 'Gives links (the grader cannot open them: judge the description); the chosen video was clearly edited by them; explains the goal, their specific editing choices and tools; gives real results with numbers and what they learned. No links or results and only general claims score 1-2.',
    model: "Links: [TikTok], [YouTube], [Drive]. One: a 30-second TikTok for a coffee shop launching a fall drink. The goal was foot traffic. I opened on the pour in slow motion with the text \"Only here until November\", cut it on the beat in CapCut, used AI captions (proofread) and a commercial-library track. It reached 180,000 views with 62% average watch time, gained the shop 1,400 followers, and the owner said the drink sold out the first weekend.",
  },
  { id: 'grow', part: 'growth', minutes: 5, label: 'Grow it without ads',
    prompt: 'Our TikTok has 300 followers and videos get 200-500 views. No paid ads. Tell us exactly what you would do in the first 30 days to grow organic engagement, and how you would know it is working.',
    rubric: 'A concrete 30-day plan: a steady posting rhythm (for example 4 to 5 shorts a week, cross-posted to Reels and Shorts); content pillars that fit a custom apparel shop (satisfying print process, before-and-after, customer reveals with permission, behind the scenes, how-to and tips, trends adapted to us); strong hooks and series people come back for; replying to every comment, often with a video reply; engaging with local schools, teams and businesses\' accounts; testing and measuring (watch time, shares, saves, follows, profile visits, link clicks, enquiries) and doubling down on what works. Buying followers or views, or spam, scores 1.',
    model: "Week 1: look at our 10 best and worst videos and the comments, and pick 4 pillars: the satisfying first print, before-and-after (design to shirt), team reveals (with permission), and quick tips (\"how to send us your logo\"). Set a rhythm of 5 shorts a week, cross-posted to Reels and Shorts.\nWeeks 2-4: start a series people come back for (\"Order of the week\"); reply to every comment within the day, using video replies for good questions; follow and comment on local schools', teams' and businesses' accounts; join one trend a week, adapted to printing, using commercial sounds.\nEvery Friday: compare watch time, shares, saves, follows and enquiries per video. Make more of what holds people past 3 seconds, and drop what doesn't.\nWorking means: average watch time and follows rising week by week, and enquiries that mention TikTok.",
  },
  { id: 'reply', part: 'growth', minutes: 2, label: 'Reply to a comment',
    prompt: 'A comment on our video says: "These shirts look cheap. $20 for a tee is a ripoff." Write the public reply exactly as you would post it.',
    rubric: 'Calm, friendly and brief; not defensive or sarcastic; gives one or two concrete reasons (garment quality, print that lasts, custom design for their group) without attacking; invites them to message or ask a question; might turn it into content (a video reply on how we print); never deletes fair criticism.',
    model: "Fair question! Our $20 tees are a heavyweight 100% cotton shirt with a print that's made to survive the wash, custom-made for your team. Happy to show you the difference: send us a message and we'll show you samples 👕",
  },
  { id: 'quiet', part: 'growth', minutes: 3, label: 'Quiet time',
    prompt: 'It is 1pm. No footage to edit and nothing assigned. The owner is busy until 4pm. Tell us exactly what you would do with those 3 hours, and why.',
    rubric: 'Self-starter: names concrete, useful content work without being told, for example replying to comments and messages, cutting more shorts from old footage, planning next week\'s posts and filming list, studying what performed and why, engaging with local and customer accounts, building templates (captions, intros, thumbnails), organising the footage library; prioritised and specific. "I would wait" or "I would study" alone score low.',
    model: "1:00-1:30 Reply to every comment and message on all platforms, and send June anything about an order.\n1:30-2:45 Cut 3 new shorts from old footage we haven't used, ready to schedule.\n2:45-3:30 Check last week's numbers, write down what held people and what didn't, and plan next week's 5 posts with a shot list June can film on her phone.\n3:30-4:00 Send June a summary: what's scheduled, what worked, and the shots I need.",
  },
  { id: 'bonus', part: 'bonus', minutes: 3, optional: true, label: 'Bonus: a skill we did not ask about',
    prompt: 'Is there a skill we did not ask about that could help us grow? For example motion graphics, thumbnails and graphic design, scripting and storytelling, filming and lighting, YouTube SEO, community management, analytics, or AI video tools. Tell us what you have done with it and one result you are proud of. Links are welcome.',
    rubric: 'Score 0 if left blank. Rewards a real, evidenced skill useful to a small business growing on video (motion graphics, thumbnails, scripting, YouTube SEO, community management, analytics, AI video and voice tools used carefully and honestly) with a concrete result. Vague claims with no example score 1-2.',
    model: "I design YouTube thumbnails in Photoshop and test two versions of each. For a fitness channel, the new thumbnails raised click-through from 3.1% to 6.4% and the channel passed 10,000 subscribers in four months. [link]",
  },
];

const INTERVIEW_GUIDE = [
  { section: 'Warm-up (3 min)', questions: [
    { q: 'Tell me about the account you grew the most. What changed it?',
      listen: 'A specific account, numbers, and a specific decision (a new hook style, a series, a posting rhythm) that made the difference.' },
    { q: 'Why this job, and why a small business rather than an agency or many clients?',
      listen: 'Wants to own one brand\'s voice over time. Watch for someone editing for many clients in the same hours.' }] },
  { section: 'Their work, on screen (8 min)', questions: [
    { q: 'Share your screen and open the editing project for one video you are proud of. Walk me through the timeline.',
      listen: 'An organised timeline, deliberate cuts, captions they checked, audio levels. Can explain each choice and the numbers it got.' },
    { q: 'Show me that video\'s analytics. Where did people leave, and what did you change afterwards?',
      listen: 'Knows the retention graph and acts on it. Only quoting views is a weak sign.' }] },
  { section: 'Live task (8 min)', questions: [
    { q: 'I will share a 2-minute clip. In 8 minutes, make the first 5 seconds of a short from it, and talk me through it.',
      listen: 'Finds the strongest moment fast, adds hook text, keeps it vertical and captioned. Calm under time pressure.' }] },
  { section: 'AI, rules and honesty (5 min)', questions: [
    { q: 'Which AI tools do you use in editing, and what do you always check yourself?',
      listen: 'Transcripts, captions, clip finding, audio clean-up, ideas. Always proofreads and watches the final export. Labels AI content where required.' },
    { q: 'What do you do about music, people on camera and children on a business account?',
      listen: 'Commercial or licensed music only, permission from people shown, and no children\'s faces or names without their parents\' permission.' }] },
  { section: 'Practical check (3 min)', questions: [
    { q: 'Show me your internet speed test and your editing setup.',
      listen: 'At least 25 Mbps down (upload speed matters too), a computer that edits 1080p or 4K smoothly, licensed software, headphones.' },
    { q: 'Confirm the schedule we posted. Any conflicts with other clients in those hours?',
      listen: 'A clear yes with no other job in the same hours.' }] },
  { section: 'Their questions (3 min)', questions: [
    { q: 'What would you like to know about us?',
      listen: 'Questions about our customers, footage and goals show real interest.' }] },
];

module.exports = {
  key: 'content',
  label: 'Content editor (video & social)',
  job: 'a remote content editor who edits prerecorded and AI-assisted video for YouTube, TikTok, Instagram Reels, YouTube Shorts and Facebook, and grows organic engagement',
  reward: 'Reward editors who hook viewers in the first seconds, think platform by platform, grow engagement without paid ads, use AI tools well but check everything they produce, respect music rights and people\'s consent, and find useful work without being told.',
  minutes: MINUTES,
  intro: INTRO, parts: PARTS, weights: WEIGHTS, choice: MULTIPLE_CHOICE, written: WRITTEN, guide: INTERVIEW_GUIDE,
};
