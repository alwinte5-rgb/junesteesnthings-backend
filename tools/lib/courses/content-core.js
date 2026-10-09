'use strict';

/* The Content course: the eight hours the content (video) person walks
   before posting on their own (owner, 2026-10-09). The designer makes the
   images, carousels and COS posts; this person makes the videos, from
   footage June films on her phone.

   What the course teaches comes from what the shop already wrote down: the
   "Making and posting our videos" SOP, the social and COS articles in the
   Playbook, and the content editor's hiring test (tools/lib/hiring-content.js),
   whose model answers are the standard we hired against. Platform practice
   fills the rest (9:16 sizes, safe zones, licensed music, AI labels).
   Anything only the owner knows is written "[owner to fill in: ...]", which
   the Training page's "Playbook gaps" card asks her for. */

const TEAM = require('./shared-team');

const A = {
  why:      'Content course 2: What makes a video work',
  plan:     'Content course 3a: Planning a shoot June can film',
  footage:  'Content course 3b: Footage, files and folders',
  edit:     'Content course 4a: Editing a short',
  finish:   'Content course 4b: Captions, sound and export',
  rules:    'Content course 5a: Music and people on camera',
  ai:       'Content course 5b: AI in our videos',
  many:     'Content course 6a: One shoot, many posts',
  posting:  'Content course 6b: Posting on each platform',
  comments: 'Content course 7: Comments and messages',
  numbers:  'Content course 8: What is working',
};

const GLOSSARY = {
  'hook': 'The first one or two seconds of a video: the shot and words that make someone stop scrolling.',
  'short': 'A vertical video under about a minute, for TikTok, Reels, YouTube Shorts and Facebook.',
  'b-roll': 'Extra shots laid over the main story: close-ups, hands, the press moving, the stack of shirts.',
  'retention graph': 'The line in each app\'s analytics showing how many viewers are still watching at each second.',
  'watch time': 'How long people spent watching, in total and on average per view.',
  'burned-in captions': 'Words that are part of the video picture itself, so they show with the sound off on every app.',
  'commercial music library': 'Music each platform licenses for business accounts to use in posts.',
  'cross-post': 'Posting the same video on several platforms, with a caption written for each.',
  'call to action': 'The one next step a video asks for: "Team order? Link in bio", or a question for the comments.',
  'thumbnail': 'The still picture people see before they press play, mostly on YouTube.',
};

const MODULES = [
  /* ── 1 ── */
  TEAM.MODULE,

  /* ── 2 ── */
  {
    key: 'c2', icon: '🎬', title: 'What makes a video work',
    goal: 'Know what our videos are for, and why the first two seconds decide everything.',
    lessons: [{
      id: 'c2-why', article: A.why, minutes: 25, tags: 'content, video, hook, one idea, call to action, shorts, tiktok, reels, youtube, organic',
      goals: ['Say what our videos are for', 'Write a hook for the first two seconds', 'End every video with one clear next step'],
      images: [{ src: '/assets/images/work/screen-printing-press.jpg', alt: 'The screen printing press: the first print pull is our best opening shot' }],
      body:
`You make the videos that show people what we do: shirts, hoodies, banners and signs being made in our Chicago shop, and the groups who wear them. We grow without paid ads, so every video has to earn its views.

**What our videos are for**

People order custom shirts when they trust that we will get it right and on time. Videos earn that trust faster than anything we can write. A good video shows:

- **The work being done:** the squeegee pulling the first print, the embroidery machine stitching a logo, a banner unrolled
- **The result:** a finished order, boxed and ready, or a team wearing their shirts
- **That we know our trade:** a quick tip on files, colors or which print method suits a job

Every video has one job: make someone with a team, school, church, business or event think "I should get ours made there".

**The first two seconds**

Most people decide in the first second or two whether to keep watching. So the **hook** comes first:

- Open on the payoff: the first print pull, the reveal, the reaction. Never a logo intro, a "hi everyone" or a slow pan of the shop
- Add on-screen text that makes people want to see the end: "200 shirts. 1 day. Watch the first one."
- Move in the first second. A still opening loses people

If a video is not working, the opening is the first thing to change.

**One idea, one next step**

- **One idea per video.** "How we print a 3-color shirt" is one video; "everything we do" is none
- Most shorts should run 15 to 45 seconds: long enough for the idea, no longer. Cut every pause and every second that does not move it forward
- End with one **call to action** that fits: "Team order? Link in bio", or a question for the comments ("Which color would your team pick?")
- Never two asks at once. "Follow, like, share and get a quote" gets none of them`,
    }],
    practice: [],
    quiz: {
      key: 'content-2', title: 'Module 2 quiz: what makes a video work', minutes: 10,
      questions: [
        { id: 'job', q: 'What is every one of our videos trying to do?',
          choices: ['Get views for their own sake', 'Make a group that needs shirts think "we should order there"', 'Show off editing effects', 'Sell blank shirts'],
          answer: 1, article: A.why, why: 'Videos earn the trust that turns viewers into orders.' },
        { id: 'open', q: 'Which is the best opening for a short?',
          choices: ['Our logo spinning in', '"Hi everyone, welcome back"', 'The first print pull, with "200 shirts. 1 day." on screen', 'A slow pan of the empty shop'],
          answer: 2, article: A.why, why: 'Lead with the payoff in the first one or two seconds.' },
        { id: 'decide', q: 'When do most viewers decide whether to keep watching?',
          choices: ['After 30 seconds', 'In the first second or two', 'At the end', 'After reading the caption'],
          answer: 1, article: A.why, why: 'The hook comes first because most people decide almost at once.' },
        { id: 'oneidea', q: 'How many ideas should one short have?',
          choices: ['One', 'Three', 'As many as fit', 'Everything we do'],
          answer: 0, article: A.why, why: 'One idea per video.' },
        { id: 'length', q: 'Most of our shorts should run about…',
          choices: ['3 seconds', '15 to 45 seconds', '5 minutes', '10 minutes'],
          answer: 1, article: A.why, why: 'Long enough for one idea, no longer.' },
        { id: 'cta', q: 'Which ending is best?',
          choices: ['"Follow, like, share, comment and get a quote"', '"Team order? Link in bio"', 'No ending at all', 'Our logo for 5 seconds'],
          answer: 1, article: A.why, why: 'One clear next step; two asks get neither.' },
        { id: 'fix', q: 'A video is not working. What do you change first?',
          choices: ['The music', 'The opening', 'The hashtags', 'Nothing, post it again'],
          answer: 1, article: A.why, why: 'The first two seconds decide whether anyone sees the rest.' },
        { id: 'still', q: 'Why should the first second have movement?',
          choices: ['It looks expensive', 'A still opening loses people while they scroll', 'The apps require it', 'It is shorter'],
          answer: 1, article: A.why, why: 'Movement stops the scroll.' },
        { id: 'tip', q: 'Which is a good "we know our trade" video?',
          choices: ['A 15-second tip on which print method suits a 12-piece order', 'A dance trend with no shirts', 'A price list read aloud', 'A rant about another shop'],
          answer: 0, article: A.why, why: 'Tips show we know what we are doing.' },
        { id: 'paid', q: 'How do our videos grow?',
          choices: ['Bought views', 'Paid ads on every video', 'Without paid ads: every video has to earn its views', 'Follow-for-follow'],
          answer: 2, article: A.why, why: 'We grow organically, so the video itself has to be good.' },
      ],
    },
    buffer: 6,
  },

  /* ── 3 ── */
  {
    key: 'c3', icon: '📋', title: 'Planning shoots and handling footage',
    goal: 'Plan shoots June can film on her phone between jobs, and keep every clip where you can find it.',
    lessons: [{
      id: 'c3-plan', article: A.plan, minutes: 20, tags: 'content, shot list, filming, phone, planning, content mix, june',
      goals: ['Write a shot list June can film in a few minutes', 'Plan a week from our content mix', 'Get permission before anyone is filmed'],
      images: [{ src: '/assets/images/work/embroidery-in-progress.jpg', alt: 'Embroidery in progress: a close-up that makes a strong short' }],
      body:
`June does the filming, on her phone, while she works. She has a shop to run, so your shot list has to be quick to follow. A good list gets you a week of videos from a few minutes of her time.

**What to plan**

Mix these through the week:

- **How it is made:** the press, the embroidery machine, a heat press lifting off a DTF transfer, a banner unrolled
- **The reveal:** a finished order, the stack of boxes, the customer picking it up (with permission)
- **Tips:** which print method suits which job, what file to send, how to pick a shirt color
- **The shop and the people:** June at work, a busy morning, a funny moment
- **The season:** back to school, team season, graduation, holidays. Plan these a few weeks early

Ask June in your team channel which jobs are printing next week, and pick the ones worth filming: a lot of pieces, bright colors, a well-known local group, or something unusual.

**A shot list June can follow**

One short message per job, sent at least a day before it prints. For each shot:

- **What:** "the first pull of the navy shirts, close up on the squeegee"
- **How long:** 5 to 10 seconds, holding still for 2 seconds before and after
- **How:** vertical, phone steady (on the press frame or a stand), close enough to see detail
- **Extras:** 10 seconds of the room's sound with nobody talking, and one wide shot of the whole press

If a YouTube video is planned from the job, ask for the main shots twice: once vertical, once sideways.

Filming tips to share once: wipe the lens, film near a window or under the shop lights, and no zooming while recording (move the phone closer instead).

**Permission before filming**

- A customer's design, team name or logo: June asks the customer before it is filmed for posting
- People's faces: their permission. Children: their parent's or the team's permission, or no faces and no names
- Never film a screen, an order form, a shipping label or anything else showing a customer's name, address or price

If you are not sure a job has permission, ask June before you edit it.`,
    }, {
      id: 'c3-footage', article: A.footage, minutes: 20, tags: 'content, footage, files, folders, backup, naming, google drive',
      goals: ['Find any clip from any shoot in under a minute', 'Name folders and files the same way every time', 'Never lose raw footage'],
      body:
`Footage is the raw material for everything you make, and June cannot film the same first print twice. Treat it carefully and keep it findable.

**Getting the footage**

[owner to fill in: where June's footage goes (a shared Drive folder or another place), and how you are told new footage is there]

Copy it to your project folder the same day. Phones replace clips, and shared folders fill up.

**One folder per shoot**

Name every shoot folder the same way: date first, then the job, then what it is.

- 2026-10-04_LincolnHS_print
- 2026-10-11_ReunionBanner_unroll

Inside each, three folders:

- **raw:** the clips exactly as June filmed them. Never edit or rename these in place
- **project:** your editing project file and anything you made for it (titles, voice-overs)
- **exports:** the finished videos, one per platform, named for what they are: 2026-10-04_LincolnHS_firstpull_9x16.mp4

Date first means folders sort in order. Words instead of IMG_4432 mean you can search for them.

**Your editing tools**

[owner to fill in: which editing and AI tools the shop pays for, and whose account you use]

Use the shop's accounts for shop work, so the projects stay with the shop if you move on. Never upload customer footage to a free tool that keeps the rights to what you upload: read the terms first, and ask June if you are unsure.

**Keeping it safe**

- Never delete raw footage. June decides what to clear out, and when
- Keep the project file until the video has been posted for a month. A fix after posting is quicker from the project than from scratch
- Unused clips are not waste: in quiet time, they become new shorts

**What you write down**

Log each video when it is posted, on one line: the date, the shoot folder, the platforms, and the link. When June asks "did we ever post the reunion banner?", the answer takes a minute, not an hour.`,
    }],
    practice: [],
    quiz: {
      key: 'content-3', title: 'Module 3 quiz: planning shoots and handling footage', minutes: 10,
      questions: [
        { id: 'who', q: 'Who films most of our footage?',
          choices: ['You, at the shop every day', 'June, on her phone, while she works', 'Customers', 'A film crew'],
          answer: 1, article: A.plan, why: 'June films between jobs, so the shot list has to be quick to follow.' },
        { id: 'when', q: 'When do you send June a shot list for a job?',
          choices: ['After it has printed', 'At least a day before it prints', 'Never', 'Only on Fridays'],
          answer: 1, article: A.plan, why: 'A day ahead, one short message per job.' },
        { id: 'shot', q: 'Which shot instruction is best?',
          choices: ['"Film something cool"', '"First pull of the navy shirts, close on the squeegee, 5 to 10 seconds, vertical, hold 2 seconds before and after"', '"Film the whole day"', '"Zoom in a lot"'],
          answer: 1, article: A.plan, why: 'What, how long and how: June can do it without asking.' },
        { id: 'zoom', q: 'June wants a closer shot. She should…',
          choices: ['Zoom in while recording', 'Move the phone closer', 'Film from across the room', 'Crop it later only'],
          answer: 1, article: A.plan, why: 'No zooming while recording; move closer instead.' },
        { id: 'screen', q: 'Which must never appear in a video?',
          choices: ['The press', 'A shipping label with a customer\'s name and address', 'June\'s hands', 'A stack of boxes'],
          answer: 1, article: A.plan, why: 'Nothing showing a customer\'s name, address or price.' },
        { id: 'kids', q: 'The youth team is in the footage, faces clear. You need…',
          choices: ['Nothing', 'A parent\'s or the team\'s permission, or no faces and no names', 'Only the coach\'s first name', 'A filter'],
          answer: 1, article: A.plan, why: 'Children need a parent\'s or the team\'s permission.' },
        { id: 'folder', q: 'Which folder name follows our pattern?',
          choices: ['New folder (3)', '2026-10-04_LincolnHS_print', 'lincoln stuff', 'IMG_4432'],
          answer: 1, article: A.footage, why: 'Date first, then the job, then what it is.' },
        { id: 'raw', q: 'What do you do with clips in the raw folder?',
          choices: ['Edit them in place', 'Leave them exactly as filmed', 'Delete the ones you do not use', 'Rename them IMG_1'],
          answer: 1, article: A.footage, why: 'Raw stays raw; June decides what is cleared out.' },
        { id: 'delete', q: 'Can you delete raw footage once the video is posted?',
          choices: ['Yes, straight away', 'No: June decides what to clear out', 'Only the good clips', 'Only on weekends'],
          answer: 1, article: A.footage, why: 'Unused clips become new shorts, and the first print cannot be filmed twice.' },
        { id: 'free', q: 'A free online tool would speed up your edit but keeps the rights to anything uploaded. You…',
          choices: ['Upload the customer footage anyway', 'Do not use it for customer footage; ask June if unsure', 'Use it only at night', 'Upload half the clips'],
          answer: 1, article: A.footage, why: 'Read the terms first; customer footage stays with us.' },
      ],
    },
    buffer: 7,
  },

  /* ── 4 ── */
  {
    key: 'c4', icon: '✂️', title: 'Editing a short',
    goal: 'Turn raw clips into a tight, captioned, vertical short that is ready for every platform.',
    lessons: [{
      id: 'c4-edit', article: A.edit, minutes: 20, tags: 'content, editing, pacing, cuts, b-roll, 9:16, vertical, rough cut',
      goals: ['Go from raw clips to a rough cut in order', 'Cut for pace without losing the story', 'Frame for a vertical screen'],
      images: [{ src: '/assets/images/work/full-color-team-logo-print.jpg', alt: 'A full-color team logo print: the reveal at the end of a short' }],
      body:
`Editing is where a video becomes good or forgettable. The footage is the same either way; the choices are yours.

**From raw clips to a rough cut**

1. Watch everything once, all the way through, and note the best moments: the first pull, the lift, a reaction, a good line from June
2. Pick the **hook**: the best two seconds you have. It goes first, even if it happened last
3. Lay out the story behind it: setup, the work, the result. Three to six shots is plenty for a short
4. End on the payoff and the call to action

Do this before any music, captions or effects. A rough cut that works with no music will only get better.

**Cutting for pace**

- Cut every pause, breath, "um" and second of nothing. If a shot has made its point, cut to the next
- Most shots last 1 to 3 seconds in a short. A satisfying moment (the lift, the stitch filling in) can hold longer
- Use **b-roll** over talking: when June explains something, show the thing she is explaining
- Cut on movement (the squeegee starting, the hand lifting) so cuts feel smooth
- Speed up the slow parts (a stack growing, a machine running) rather than cutting them out completely

Then watch it as a stranger would, on your phone, with the sound off. Anything that drags, cut.

**A vertical frame**

- Shorts are 9:16, 1080 x 1920. Set the project to that size before you start
- Keep the subject in the middle of the frame. The apps put buttons on the right and captions along the bottom
- When a clip was filmed sideways, crop in on the action rather than leaving black bars
- Avoid tiny details far from the middle: on a phone they are lost

**What makes it ours**

- Real work, real people, our shop. Polished matters less than true
- Our caption style, used the same way every time: [owner to fill in: our caption font and colors]
- No other shop's logo, no brands the customer does not own, and nothing negative about anyone`,
    }, {
      id: 'c4-finish', article: A.finish, minutes: 20, tags: 'content, captions, subtitles, audio, sound, music level, export, 1080x1920, 30fps',
      goals: ['Add captions people can read with the sound off', 'Clean up the sound and set the music level', 'Export the right file for each platform'],
      body:
`The last 20% of the edit is what people notice: captions they can read, sound that is clear, and a file each app shows sharp.

**Captions**

Most people watch with the sound off, so every video gets **burned-in captions**: words that are part of the picture.

- Auto-generate them, then **proofread every word**. Names, numbers, prices and dates are where auto-captions go wrong
- Two to five words on screen at a time, large and high-contrast (white with a dark outline works on almost anything)
- Keep them in the middle of the screen: out of the top 250 pixels, the bottom 400 pixels and the right edge, where the apps put their buttons and the post caption
- On-screen text (the hook line) follows the same rules and stays up long enough to read twice

**Sound**

- Clean up shop noise with a noise-reduction tool, then listen back on headphones. Over-cleaned voices sound robotic
- June's voice, or a customer's, always sits on top. Music goes about 20 dB under any voice, and can come up when nobody is talking
- The satisfying sounds of the shop (the press, the stitch, the tape gun) are worth keeping: mix them in, not out
- Only licensed music (Module 5)

**Export**

- **Shorts:** 1080 x 1920 (9:16), 30 frames per second, MP4
- **YouTube video:** 1920 x 1080 (16:9), MP4, with a custom thumbnail
- Export a clean copy for each platform from your editor. Never download your own video from one app to post on another: it carries that app's watermark and the other app shows it to fewer people
- Name the export for what it is and where it goes, in the shoot's exports folder

**Before it goes anywhere**

Watch the final export, start to finish, on your phone:

- Sound off: does the story still make sense?
- Sound on: is every word clear, and is the music at the right level?
- Every caption right: spelling, names, numbers?
- Nothing showing a customer's details, and permission for everyone on camera?`,
    }],
    practice: [
      { key: 'signoff:content-edit', type: 'signoff', minutes: 10,
        title: 'Edits a short that is ready to post', hint: 'Send June your first edited short. She checks the hook, the pace, the captions, the sound and the export before she signs this off.' },
    ],
    quiz: {
      key: 'content-4', title: 'Module 4 quiz: editing a short', minutes: 10,
      questions: [
        { id: 'first', q: 'What do you do first with a new shoot?',
          choices: ['Add music', 'Watch everything once and note the best moments', 'Export it', 'Write the caption'],
          answer: 1, article: A.edit, why: 'Know what you have before you cut it.' },
        { id: 'hookplace', q: 'The best moment happened at the end of the shoot. Where does it go?',
          choices: ['At the end only', 'First, as the hook', 'Nowhere', 'In the middle'],
          answer: 1, article: A.edit, why: 'The hook goes first, even if it happened last.' },
        { id: 'rough', q: 'When do you add music, captions and effects?',
          choices: ['Before the rough cut', 'After the rough cut works on its own', 'Never', 'Only music, never captions'],
          answer: 1, article: A.edit, why: 'A rough cut that works with no music only gets better.' },
        { id: 'shotlen', q: 'Most shots in a short last about…',
          choices: ['1 to 3 seconds', '20 seconds', '1 minute', 'Half a second, always'],
          answer: 0, article: A.edit, why: 'Cut once a shot has made its point.' },
        { id: 'size', q: 'A short is exported at…',
          choices: ['1920 x 1080', '1080 x 1920 (9:16)', '1080 x 1080', '4000 x 4000'],
          answer: 1, article: A.finish, why: 'Shorts are vertical 9:16, 1080 x 1920.' },
        { id: 'captions', q: 'Why do we burn in captions?',
          choices: ['To hide mistakes', 'Most people watch with the sound off', 'The apps require it', 'It makes the file smaller'],
          answer: 1, article: A.finish, why: 'Captions carry the story with the sound off.' },
        { id: 'proof', q: 'Auto-captions are done. You…',
          choices: ['Post it', 'Proofread every word, especially names, numbers and dates', 'Remove half of them', 'Make them smaller'],
          answer: 1, article: A.finish, why: 'Auto-captions go wrong exactly where it matters.' },
        { id: 'where', q: 'Where do captions sit on a short?',
          choices: ['At the very bottom', 'In the middle, clear of the top, bottom and right edge', 'Top right corner', 'Anywhere'],
          answer: 1, article: A.finish, why: 'The apps put buttons and the post caption at the edges.' },
        { id: 'music', q: 'June is talking. The music sits…',
          choices: ['Louder than her', 'About 20 dB under her voice', 'At the same level', 'Muted for the whole video'],
          answer: 1, article: A.finish, why: 'Voices always sit on top.' },
        { id: 'watermark', q: 'You want the TikTok version on Reels too. You…',
          choices: ['Download it from TikTok and post that', 'Export a clean copy from your editor', 'Screen-record TikTok', 'Skip Reels'],
          answer: 1, article: A.finish, why: 'Another app\'s watermark gets a video shown to fewer people.' },
      ],
    },
    buffer: 7,
  },

  /* ── 5 ── */
  {
    key: 'c5', icon: '⚖️', title: 'Music, people and AI',
    goal: 'Follow the rules that keep our videos up and our customers\' trust: licensed music, permission, and honest AI.',
    lessons: [{
      id: 'c5-rules', article: A.rules, minutes: 20, tags: 'content, music, license, copyright, commercial music library, permission, consent, children, privacy',
      goals: ['Pick music a business account may use', 'Know whose permission you need, and how to keep it', 'Spot anything in a shot that must not be posted'],
      images: [{ src: '/assets/images/work/youth-team-shirts.jpg', alt: 'A youth team in their shirts: children on camera need a parent\'s or the team\'s permission' }],
      body:
`Two mistakes take a video down or lose a customer's trust: music we may not use, and people who did not agree to be posted. Both are easy to avoid and hard to undo.

**Music**

We are a business account, and business accounts are not allowed most trending songs. A song you hear on a hundred personal videos can still get ours muted, taken down, or the account flagged.

- Use each platform's **commercial music library** (TikTok, Instagram and Facebook each have one for business accounts), the YouTube Audio Library, or a track the shop has paid a license for
- A licensed track from one place is not automatically licensed everywhere. Check before you cross-post
- No music is fine too. Shop sounds and June's voice often work better
- If a platform mutes or flags a video, tell June that day. Do not just re-upload it

**People on camera**

- Anyone whose face can be seen, or whose name is said or shown: their permission, in writing. A message or email saying yes is enough; June keeps it with the job
- Children: their parent's or the team's permission, or no faces and no names. A team photo of kids with a school name on the shirts counts
- A customer's design or logo: they agreed to it being shown. June asks when she films
- If someone asks us to take a video down, take it down that day and tell June. Never argue in the comments

**What else to check in every frame**

- Screens, papers, labels, boxes or phones showing a customer's name, address, email, order or price
- Another shop's or brand's logo the customer does not own
- Anything a customer would be unhappy to see: a misprint, their order next to someone else's
- June, or another helper, in a moment they would not want posted

When in doubt, leave it out, or ask June before posting. Fixing a posted video means it has already been seen.`,
    }, {
      id: 'c5-ai', article: A.ai, minutes: 20, tags: 'content, ai, transcripts, captions, clips, audio clean-up, ai label, disclosure, fake reviews',
      goals: ['Use AI where it saves time', 'Check everything AI made before it is posted', 'Never let AI make something look real that is not'],
      body:
`AI tools are part of the job: they make the slow parts quick. They also make mistakes confidently, and they can make fakes that cost us trust. These are our rules.

**Where AI helps**

- **Transcripts:** turn June's talking into text, then find the best line by reading instead of scrubbing through the clip
- **Captions:** auto-generate them, then proofread every word
- **Finding clips:** tools that suggest moments from a long video for shorts. You still choose; they do not know what makes us look good
- **Sound clean-up:** shop noise, echo, hum. Then listen back on headphones
- **Ideas:** hooks, titles, captions and video ideas to start from. Then write the final version yourself, in our voice

**Check everything it made**

AI is wrong in ways that look right. Before anything AI touched is posted:

- Every caption and title: names, prices, dates, numbers and spelling. AI invents details that sound plausible
- Every clip it picked: is it actually the best moment, and does the video still make sense?
- The cleaned sound: does June still sound like June?
- Watch the final export yourself. "The tool did it" is not a check

Customer details never go into any AI tool: no names, emails, phone numbers or order details in a prompt. Write "the customer" instead.

**What AI must never make**

- A fake customer, a fake review or a fake testimonial. Real customers who agree to it, or nothing
- A realistic person, place or event that did not happen, shown as if it did
- Our work looking better than it really is: a print color we cannot match, a product we do not sell

**Labels**

TikTok, Instagram, Facebook and YouTube each ask you to label realistic AI-made or AI-altered content, and some add a label themselves. If a video includes realistic AI imagery or voice, turn the label on. Captions, transcripts, noise clean-up and ideas do not need one.

If you are unsure whether something needs a label, label it, and ask June.`,
    }],
    practice: [],
    quiz: {
      key: 'content-5', title: 'Module 5 quiz: music, people and AI', minutes: 10,
      questions: [
        { id: 'trend', q: 'A trending song would be perfect for our video. You…',
          choices: ['Use it: everyone else does', 'Use a track from the commercial music library or one we licensed', 'Use it but turn it down', 'Use 10 seconds of it'],
          answer: 1, article: A.rules, why: 'Business accounts are not licensed for most trending songs.' },
        { id: 'everywhere', q: 'A track is licensed for TikTok. On YouTube it is…',
          choices: ['Licensed too, automatically', 'Something to check before you cross-post', 'Always banned', 'Free for everyone'],
          answer: 1, article: A.rules, why: 'A license from one place is not automatically a license everywhere.' },
        { id: 'muted', q: 'Instagram mutes a video for its music. You…',
          choices: ['Upload it again', 'Tell June that day', 'Delete the account', 'Post it on TikTok instead'],
          answer: 1, article: A.rules, why: 'Never just re-upload a flagged video.' },
        { id: 'consent', q: 'What counts as permission from an adult customer to be in a video?',
          choices: ['A nod', 'A message or email saying yes, kept with the job', 'Their friend saying it is fine', 'Nothing is needed'],
          answer: 1, article: A.rules, why: 'Permission in writing, kept by June with the job.' },
        { id: 'takedown', q: 'A parent asks us to remove a video their child is in. You…',
          choices: ['Explain why it should stay', 'Take it down that day and tell June', 'Blur it next week', 'Ignore it'],
          answer: 1, article: A.rules, why: 'Take it down, tell June, never argue.' },
        { id: 'aigood', q: 'Which is a good use of AI?',
          choices: ['A fake customer review', 'A transcript to find June\'s best line', 'A realistic video of a team we never printed for', 'Making a print look brighter than it came out'],
          answer: 1, article: A.ai, why: 'Transcripts, captions, clips, sound and ideas, all checked.' },
        { id: 'aicheck', q: 'AI wrote the captions. Before posting you…',
          choices: ['Trust them', 'Proofread every word: names, prices, dates, numbers', 'Delete them', 'Ask the AI if they are right'],
          answer: 1, article: A.ai, why: 'AI invents details that sound plausible.' },
        { id: 'prompt', q: 'Which may go into an AI prompt?',
          choices: ['The customer\'s email address', '"The customer" in place of their name and details', 'Their phone number', 'Their order total and address'],
          answer: 1, article: A.ai, why: 'Customer details never go into any AI tool.' },
        { id: 'fake', q: 'Someone suggests an AI "customer" talking about how good we are. You say…',
          choices: ['Great idea', 'No: never a fake customer or review', 'Only if it looks real', 'Only on TikTok'],
          answer: 1, article: A.ai, why: 'Real customers who agree to it, or nothing.' },
        { id: 'label', q: 'Which video needs the platform\'s AI label?',
          choices: ['One with AI-proofread captions', 'One with a realistic AI-made scene', 'One with AI noise clean-up', 'One whose title AI suggested'],
          answer: 1, article: A.ai, why: 'Realistic AI-made or altered content gets labeled.' },
      ],
    },
    buffer: 7,
  },

  /* ── 6 ── */
  {
    key: 'c6', icon: '📲', title: 'One shoot, many posts',
    goal: 'Get the most from every shoot, and post each piece the way each platform wants it.',
    lessons: [{
      id: 'c6-many', article: A.many, minutes: 20, tags: 'content, repurpose, youtube, shorts, carousel, stills, designer, plan',
      goals: ['Plan several pieces from one shoot', 'Make each short stand on its own', 'Hand stills to the designer'],
      images: [{ src: '/assets/images/work/family-reunion-bulk-order.jpg', alt: 'A family reunion bulk order: one job, several videos and a carousel' }],
      body:
`June's time filming is the scarce part. So every shoot should become several posts, not one.

**From one shoot**

A typical job can give you:

- **A longer YouTube video** (16:9), for example "How we print 200 shirts for a high school", 4 to 8 minutes, when there is enough footage and a story
- **3 to 5 shorts**, each one idea: the first pull, the setup, the stack growing, the pickup reaction, a tip
- **Stills** for a carousel or a post, which the designer makes

Plan these before you edit, as a list in the shoot folder. Then edit the shorts first: they post fastest.

**Each short stands on its own**

Someone who sees only one short must understand it:

- Its own hook, its own story and its own call to action
- No "part 2" and no "as I said in the last video"
- Different openings: if every short from one shoot starts on the same squeegee shot, people scroll past the second

**The longer video**

- A clear title that answers what someone would search for: "How screen printing works", "Custom team shirts: from logo to pickup"
- The same rule for the opening: show what is coming in the first few seconds
- Chapters in the description help people jump to what they want
- A custom **thumbnail**: one clear image of the work, three or four words at most. Ask the designer if you want one made

**Working with the designer**

The designer makes the images: single posts, carousels and graphics. You make the videos. You work from the same plan:

- Post in your team channel which shoot you are cutting, and which stills you think would make a good carousel
- Export the stills at full size into the shoot's exports folder and say where they are
- Never post the same moment as both a video and a carousel on the same day

**Quiet time**

When there is nothing new to edit, the raw folders are full of shorts nobody has made yet: a different hook, a tip, a "how long does it take", a before and after. Cut them and keep them ready for a week with no new footage.`,
    }, {
      id: 'c6-posting', article: A.posting, minutes: 20, tags: 'content, posting, cross-post, captions, hashtags, tiktok, instagram, reels, youtube shorts, facebook, cos, schedule',
      goals: ['Write a caption made for each platform', 'Post or schedule on every platform we use', 'Keep a steady posting rhythm'],
      body:
`A video is finished when it is posted well on every platform we use, with a caption written for each.

**Where we post**

Shorts go to **TikTok**, **Instagram Reels**, **YouTube Shorts** and **Facebook**. Longer videos go to **YouTube**.

Our accounts and how you sign in: [owner to fill in: our TikTok, Instagram, YouTube and Facebook account names, and how the content person signs in to each]

How videos are scheduled: [owner to fill in: whether videos are scheduled in COS Creator Studio or posted in each app]

**A caption for each platform**

The same caption pasted everywhere reads like it was. Write each one for where it goes:

- **TikTok and Reels:** short. One line that adds to the video, the call to action, and 3 to 5 hashtags (for example, Chicago custom shirts, screen printing, team shirts)
- **YouTube Shorts and YouTube:** a title that says what it is, and a description with the link to jtees.net. On longer videos, chapters too
- **Facebook:** friendly and local, written like a person; this is where many of our schools, churches and families are

Every caption: spelling checked, names right, and never a price, discount, date or promise June has not approved. "Get a free quote at jtees.net" is always safe.

**When and how often**

- How many: [owner to fill in: how many shorts and how many longer videos a week]
- Post at the times our followers are online: each app's analytics shows when. Spread posts out rather than four in one hour
- A steady rhythm beats a burst. Three good shorts every week beat ten in one week and none the next
- Seasonal videos go up a few weeks before the season, when people start planning, not on the day

**After you post**

- Open each post on your phone: the video plays, the captions are not covered, the link works
- Log it: date, shoot folder, platforms and links
- Stay around for the first hour if you can, and reply to the early comments (Module 7)`,
    }],
    practice: [],
    quiz: {
      key: 'content-6', title: 'Module 6 quiz: one shoot, many posts', minutes: 10,
      questions: [
        { id: 'pieces', q: 'One good shoot should become…',
          choices: ['One short', 'A longer video, 3 to 5 shorts and stills for a carousel', 'Nothing until June films more', 'Ten copies of one short'],
          answer: 1, article: A.many, why: 'June\'s filming time is the scarce part.' },
        { id: 'standalone', q: 'Which short stands on its own?',
          choices: ['"Part 2: as I said before…"', 'One with its own hook, story and call to action', 'One that only makes sense after the YouTube video', 'One with no ending'],
          answer: 1, article: A.many, why: 'Someone who sees only one short must understand it.' },
        { id: 'stills', q: 'Who makes the carousel from the shoot\'s stills?',
          choices: ['You', 'The designer', 'The customer', 'Nobody'],
          answer: 1, article: A.many, why: 'The designer makes images; you make videos, from the same plan.' },
        { id: 'thumb', q: 'A good YouTube thumbnail is…',
          choices: ['A blurry frame with a paragraph of text', 'One clear image of the work with three or four words', 'Our logo only', 'Black'],
          answer: 1, article: A.many, why: 'One clear image, three or four words at most.' },
        { id: 'quiet', q: 'No new footage this week. You…',
          choices: ['Post nothing', 'Cut new shorts from unused clips in the raw folders', 'Repost last week\'s videos', 'Buy stock footage of another shop'],
          answer: 1, article: A.many, why: 'Unused clips are shorts nobody has made yet.' },
        { id: 'where', q: 'Where do our shorts go?',
          choices: ['TikTok only', 'TikTok, Instagram Reels, YouTube Shorts and Facebook', 'Only YouTube', 'Only our website'],
          answer: 1, article: A.posting, why: 'Cross-post shorts, with a caption written for each.' },
        { id: 'caption', q: 'Which caption is right for every platform?',
          choices: ['The same one pasted everywhere', 'One written for each platform', 'No caption', 'All hashtags'],
          answer: 1, article: A.posting, why: 'A pasted caption reads like it was.' },
        { id: 'promise', q: 'Which may go in a caption without June approving it?',
          choices: ['"20% off this week"', '"Ready in 3 days, guaranteed"', '"Get a free quote at jtees.net"', '"Cheapest in Chicago"'],
          answer: 2, article: A.posting, why: 'Never a price, discount, date or promise June has not approved.' },
        { id: 'rhythm', q: 'Which posting plan is better?',
          choices: ['Ten shorts one week, none the next', 'Three good shorts every week', 'Four posts in the same hour', 'Only when you feel like it'],
          answer: 1, article: A.posting, why: 'A steady rhythm beats a burst.' },
        { id: 'season', q: 'When does a back-to-school video go up?',
          choices: ['The first day of school', 'A few weeks before, when people start planning', 'After school starts', 'In December'],
          answer: 1, article: A.posting, why: 'Seasonal videos go up when people plan, not on the day.' },
      ],
    },
    buffer: 7,
  },

  /* ── 7 ── */
  {
    key: 'c7', icon: '💬', title: 'Comments and messages',
    goal: 'Reply to every comment the same day, and send anything about an order or a complaint to the right person.',
    lessons: [{
      id: 'c7-comments', article: A.comments, minutes: 30, tags: 'content, comments, replies, criticism, spam, video reply, escalate, sales, dms',
      goals: ['Reply to every comment within the day', 'Handle criticism calmly and in public', 'Pass on orders, prices and complaints the same day'],
      tryIt: [{ label: 'Open Team chat', href: '/admin/team-chat' }],
      body:
`Comments are where viewers become customers. The apps also show a video to more people when it gets replies, so every reply helps twice.

**Reply to every comment**

- Every comment gets a reply within the day, ideally within the first hour after posting
- Reply like a person from the shop: friendly, short, specific. "Thank you! That's 3 colors on navy" beats "Thanks!"
- Answer the question that was asked. If you do not know, say you will find out, and come back
- A good question gets a **video reply**: "How do you print white on a black shirt?" is a 20-second short already
- Pin a helpful comment, or your own answer to the most-asked question

**Someone wants to order**

When someone asks for a price, a quote or how to order, in a comment or a message:

1. Reply kindly that we would love to help, and point them to the quote form at jtees.net
2. Post their profile link and what they asked in the # Sales channel, the same day, so sales can follow up
3. Never quote a price, a date or a discount yourself, even a rough one. Those come from sales and June

Anything about an order that already exists (a late order, a wrong size, a problem with a print) goes to June, the same day, before you reply beyond "Thank you for telling us, we will message you".

**Criticism and complaints**

- Fair criticism gets a calm, kind public reply and an invitation to message us: "We are sorry to hear that. Please message us so we can put it right"
- Never argue, never blame the customer, never delete fair criticism. Other people judge us by how we reply
- Tell June the same day, before you reply to anything more than that
- Never reply when you are annoyed. Write it, wait, then read it again

**Spam, abuse and trolls**

- Spam, scams and fake giveaways: delete or hide, and block if it repeats
- Abuse, slurs or threats: hide or delete, screenshot it first, and tell June
- Not every rude comment needs a reply. A joke at our expense can get a friendly one, or nothing

**Messages**

Direct messages to our accounts follow the same rules: reply within the day, send would-be customers to the quote form and the # Sales channel, and send anything about an existing order to June. If you are not the person checking messages on an account, leave them for whoever is, and tell them about anything urgent.`,
    }],
    practice: [],
    quiz: {
      key: 'content-7', title: 'Module 7 quiz: comments and messages', minutes: 10,
      questions: [
        { id: 'when', q: 'How fast do comments get a reply?',
          choices: ['Within the week', 'Within the day, ideally the first hour after posting', 'Only on Fridays', 'Only if they tag us'],
          answer: 1, article: A.comments, why: 'Every comment, within the day.' },
        { id: 'good', q: 'Which reply is best to "love the colors!"?',
          choices: ['"Thanks"', '"Thank you! That\'s 3 colors on navy"', 'No reply', '"Follow us"'],
          answer: 1, article: A.comments, why: 'Friendly, short and specific.' },
        { id: 'video', q: '"How do you print white on a black shirt?" is…',
          choices: ['Spam', 'A good question for a video reply', 'Something to delete', 'A complaint'],
          answer: 1, article: A.comments, why: 'A good question is a short already.' },
        { id: 'price', q: 'A commenter asks "how much for 40 shirts?" You…',
          choices: ['Guess a price', 'Point them to the quote form and post it in # Sales the same day', 'Ignore it', 'Give a discount'],
          answer: 1, article: A.comments, why: 'Prices and quotes come from sales and June.' },
        { id: 'late', q: 'A comment says their order is late. You…',
          choices: ['Promise it tomorrow', 'Tell June the same day; reply only that we will message them', 'Delete it', 'Argue that it is not late'],
          answer: 1, article: A.comments, why: 'Anything about an existing order goes to June.' },
        { id: 'criticism', q: 'Fair criticism of a print. You…',
          choices: ['Delete it', 'Reply calmly, invite them to message us, and tell June', 'Argue in public', 'Block them'],
          answer: 1, article: A.comments, why: 'Never delete fair criticism; others judge us by our reply.' },
        { id: 'annoyed', q: 'A comment annoys you. Before replying you…',
          choices: ['Reply at once', 'Write it, wait, then read it again', 'Reply in all caps', 'Ask a friend to reply'],
          answer: 1, article: A.comments, why: 'Never reply when you are annoyed.' },
        { id: 'spam', q: 'A fake giveaway comment with a link. You…',
          choices: ['Reply to it', 'Delete or hide it, and block if it repeats', 'Click the link', 'Pin it'],
          answer: 1, article: A.comments, why: 'Spam and scams are removed.' },
        { id: 'threat', q: 'A comment contains a threat. You…',
          choices: ['Delete it and forget it', 'Screenshot it, hide or delete it, and tell June', 'Reply to it', 'Leave it up'],
          answer: 1, article: A.comments, why: 'Keep a record, remove it, tell June.' },
        { id: 'dm', q: 'A message asks how to order team shirts. You…',
          choices: ['Send a price', 'Point them to the quote form and tell sales in # Sales', 'Ignore it', 'Ask for their card number'],
          answer: 1, article: A.comments, why: 'Messages follow the same rules as comments.' },
      ],
    },
    buffer: 6,
  },

  /* ── 8 ── */
  {
    key: 'c8', icon: '📈', title: 'What is working',
    goal: 'Read the numbers every Friday, learn from them, and tell June in plain words.',
    lessons: [{
      id: 'c8-numbers', article: A.numbers, minutes: 25, tags: 'content, analytics, watch time, retention, shares, saves, follows, enquiries, friday report, summary',
      goals: ['Compare videos on the numbers that matter', 'Read a retention graph and fix the next opening', 'Send June a Friday summary she can act on'],
      body:
`Views alone tell you little. The numbers that matter show whether people watched, cared, and got in touch.

**The numbers we look at**

Every Friday, for each video posted that week, note:

- **Watch time** and the **average percentage viewed**: did people watch it, or leave?
- **Shares** and **saves**: did people find it worth passing on or keeping?
- **Follows** from the video: did it make people want more?
- **Enquiries**: comments or messages asking about an order, and quote requests that mention the video

Keep them in one place, the same way every week, so you can compare: [owner to fill in: where the Friday numbers are kept]

A video with fewer views and more enquiries did better than a viral one that brought none.

**Reading the retention graph**

Each app shows how many viewers are still watching at each second. Read it like this:

- **A big drop in the first 2 seconds:** the hook did not work. Try a different first shot or on-screen text on the next videos
- **A steady slope:** normal. People drift away; the slower, the better
- **A sudden drop in the middle:** something there lost them. A slow shot, a confusing cut, a long talk with nothing to look at
- **A bump up:** people rewatched that part. That is what to make more of

**Learning from it**

- Change one thing at a time (a new kind of hook, a shorter length, a different posting time) and compare over a few videos, not one
- Look for patterns: which kinds of video bring enquiries? Which openings keep people?
- Copy what works from our own best videos before copying anyone else
- Never buy views, likes or followers, and never use follow-for-follow or engagement groups. They bring no customers, and the apps show our videos to fewer real people afterwards

**Your Friday summary for June**

Short, plain English, in your team channel or Direct with June:

1. What went up this week, with the numbers that matter: "3 shorts, 4,100 views, 2 quote requests from the hoodie video"
2. The best and the worst video, and why you think so
3. What you will try next week, and what footage you need from her
4. Anything she needs to decide or know: a complaint, a flagged video, a comment she should see

Five lines she can read in a minute beat a spreadsheet she will not open.`,
    }],
    practice: [
      { key: 'signoff:content-report', type: 'signoff', minutes: 5,
        title: 'Sends a Friday summary June can act on', hint: 'Your first Friday summary: the numbers that matter, the best and worst video and why, next week\'s plan and footage, and anything for June to decide.' },
    ],
    quiz: {
      key: 'content-8', title: 'Module 8 quiz: what is working', minutes: 10,
      questions: [
        { id: 'better', q: 'Which video did better for the shop?',
          choices: ['20,000 views, no enquiries', '2,000 views, 3 quote requests', 'Both the same', 'Neither'],
          answer: 1, article: A.numbers, why: 'Enquiries matter more than views.' },
        { id: 'watch', q: 'Watch time and average percentage viewed tell you…',
          choices: ['How many followers we have', 'Whether people actually watched', 'Who commented', 'What music was used'],
          answer: 1, article: A.numbers, why: 'They show whether people stayed.' },
        { id: 'drop', q: 'Most viewers leave in the first 2 seconds. You…',
          choices: ['Change the music', 'Try a stronger opening on the next videos', 'Post it again', 'Make it longer'],
          answer: 1, article: A.numbers, why: 'A drop at the start means the hook did not work.' },
        { id: 'middle', q: 'A sudden drop in the middle of the graph means…',
          choices: ['Nothing', 'Something at that point lost them', 'The video is too short', 'The caption is wrong'],
          answer: 1, article: A.numbers, why: 'A slow shot or confusing cut there.' },
        { id: 'bump', q: 'A bump up in the retention graph means…',
          choices: ['People rewatched that part: make more like it', 'An error', 'Fewer viewers', 'The video was muted'],
          answer: 0, article: A.numbers, why: 'Rewatched moments are what to make more of.' },
        { id: 'onething', q: 'How do you test a new kind of hook?',
          choices: ['Change everything at once', 'Change one thing and compare over a few videos', 'Try it once', 'Ask a friend'],
          answer: 1, article: A.numbers, why: 'One change at a time, over several videos.' },
        { id: 'buy', q: 'Someone offers 10,000 followers for $20. You…',
          choices: ['Buy them', 'Say no: never buy views, likes or followers', 'Buy 5,000', 'Ask for a free trial'],
          answer: 1, article: A.numbers, why: 'Bought followers bring no customers and hurt reach.' },
        { id: 'when', q: 'When do you review the numbers?',
          choices: ['Every Friday', 'Once a year', 'Only when June asks', 'Every hour'],
          answer: 0, article: A.numbers, why: 'Every Friday, the same way each week.' },
        { id: 'summary', q: 'A good Friday summary for June is…',
          choices: ['A 20-tab spreadsheet', 'Five plain lines: what went up, best and worst, next week, what she must decide', 'A screenshot of every app', 'Nothing unless asked'],
          answer: 1, article: A.numbers, why: 'Five lines she can read in a minute.' },
        { id: 'flagged', q: 'A video was flagged this week. Where does that go?',
          choices: ['Nowhere', 'In the Friday summary, as something June needs to know (and you told her the day it happened)', 'In a comment', 'Only in your notes'],
          answer: 1, article: A.numbers, why: 'Anything June must decide or know goes in the summary.' },
      ],
    },
    buffer: 7,
  },
];

/* The final exam: new questions across the whole course, 80% to pass. */
const FINAL = {
  floating: 15,
  quiz: {
    key: 'content-final', title: 'Final exam: the Content course', minutes: 25,
    questions: null, // content-core-final.js
  },
  signoffs: [
    { key: 'signoff:handoff', type: 'signoff', minutes: 0,
      title: 'Knows when to hand a comment or a customer to June', hint: 'Complaints, orders that already exist, takedown requests, prices and discounts. June signs this off after seeing you do it.' },
    { key: 'signoff:ready', type: 'signoff', minutes: 0,
      title: 'Ready to post on their own', hint: 'The last step. June decides when your videos can go up without her checking each one first.' },
  ],
};
FINAL.quiz.questions = require('./content-core-final')(A);

const PAGES = require('./content-core-pages');
for (const l of MODULES.flatMap((m) => m.lessons)) {
  if (l.pages) continue; // the shared module's lessons carry their own
  l.pages = PAGES[l.id] || [{ from: null, checks: [] }];
  l.checks = l.pages.flatMap((pg) => pg.checks);
}

module.exports = { key: 'content-core', title: 'Content', track: 'content', articles: A, glossary: GLOSSARY, modules: MODULES, final: FINAL };
