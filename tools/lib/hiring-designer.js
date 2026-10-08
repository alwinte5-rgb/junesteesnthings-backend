'use strict';

/* The applicant test for the graphic designer, in the same shape as the sales
   one in hiring.js (see ROLES there): judgment questions marked on the server,
   written answers graded by Claude against a rubric and a model answer, and a
   video-call guide. Everything else (the private link, the clock, round 2, the
   one results email, the owner-only answer key) is shared by every role.

   What the job is: turning what sales learned from a customer into proofs and
   print-ready files for screen printing, embroidery and DTF, through the
   Artwork card on each job (Artwork pipeline: sales to designer to owner). */

const MINUTES = 30;

const INTRO = `This test takes about ${MINUTES} minutes. It is the same kind of work you would do for us every day:
judging what a design needs before it can be printed, planning artwork from a customer's request, talking to
customers about proofs, and deciding what to do when nobody is telling you what to do.
You do not need design software for this test: everything is written. Write the way you would really work.
Please do not use ChatGPT or other AI tools to write your answers: we want to see how you think.`;

const PARTS = {
  choice: { label: 'Part 1: Print judgment', note: '8 questions, about 6 minutes. Pick what you would really do.' },
  craft: { label: 'Part 2: Design work', note: 'About 18 minutes. Be specific: tools, file types, sizes, colors.' },
  initiative: { label: 'Part 3: Initiative', note: 'About 4 minutes. There is no single right answer; we want to see how you think.' },
  bonus: { label: 'Part 4: Bonus', note: 'Optional, about 3 minutes. This can change the direction of your interview.' },
};

const WEIGHTS = { choice: 25, craft: 45, initiative: 30 };

const MULTIPLE_CHOICE = [
  { id: 'lowres', q: 'A customer sends their logo as a 200 x 200 pixel JPG and wants it 12 inches wide on the back of a shirt. What do you do?',
    choices: ['Enlarge it and send it to print', 'Run it through an AI upscaler and print that',
      'Explain it will print blurry and ask for the original file (.ai, .eps, .svg or .pdf), or offer to redraw it as vector',
      'Print it smaller so the blur is less visible'],
    answer: 2, why: 'A small raster file cannot be printed large. The original vector, or a clean redraw the owner prices, is the only way to a sharp print.' },
  { id: 'stitch', q: 'A logo with 6-point text and a color gradient is going to be embroidered on a cap. What do you do?',
    choices: ['Send it to the embroiderer as it is', 'Simplify it: enlarge or drop the tiny text, replace the gradient with solid thread colors, and show the customer a proof of the simplified version',
      'Tell the customer we cannot embroider logos', 'Switch the order to DTF without asking'],
    answer: 1, why: 'Thread cannot hold tiny text or blends. A simplified version, approved on a proof, stitches cleanly.' },
  { id: 'colours', q: 'A screen-print design has 7 colors and the customer says the price is too high. What is the best move?',
    choices: ['Tell them that is the price', 'Offer a discount',
      'Offer a version in 2 or 3 spot colors (each color is a screen, which is what drives the price) and show both side by side',
      'Switch it to 1 color without asking'],
    answer: 2, why: 'In screen printing every color is a screen and a setup. A well-designed version with fewer colors often looks just as good and fits the budget.' },
  { id: 'approval', q: 'A customer says "looks good!" in a chat about your mockup. What happens before anything is printed?',
    choices: ['Nothing: they said it looks good', 'Send the proof from the Proofs card and get written approval of the spelling, colors, size and placement',
      'Ask the owner to approve it instead', 'Print one sample shirt first'],
    answer: 1, why: 'A written approval on the proof protects the customer and the shop. "Looks good" in a chat is not an approval of the details.' },
  { id: 'typo', q: 'After the customer approved the proof, you notice "Anual Picnic" on it. What do you do?',
    choices: ['Nothing: they approved it', 'Fix it quietly and send it to print',
      'Tell the customer and the owner before it prints, send a corrected proof, and get it approved again', 'Wait to see if anyone notices'],
    answer: 2, why: 'Catching a mistake before it prints is the job. Changing approved art without asking is never OK, so it goes back for a fresh approval.' },
  { id: 'brief', q: 'Sales sends you a job due tomorrow with no sizes, no placement and no colors. What do you do first?',
    choices: ['Guess and design something', 'Wait until sales notices',
      'Press "Ask sales a question" straight away with exactly what is missing, and start on what you already know', 'Tell the owner sales made a mistake'],
    answer: 2, why: 'One clear question, asked at once, saves a day. Starting on the parts you know keeps the deadline.' },
  { id: 'character', q: 'A customer wants a famous cartoon character on 50 birthday-party shirts. What do you do?',
    choices: ['Design it: it is only a party', 'Find the character online and use it',
      'Bring it to the owner: we do not print characters, brands or team logos the customer does not own. Offer an original design on the same theme',
      'Change the colors so it is not an exact copy'],
    answer: 2, why: 'Characters and brands are not ours to print, changed or not. An original design on the theme is the usual offer, and the owner decides.' },
  { id: 'dtf', q: 'A DTF design has a soft drop shadow and a semi-transparent glow. What do you do with it?',
    choices: ['Nothing: DTF prints anything', 'Turn the soft effects into solid shapes or a halftone, so they print cleanly with no box around them',
      'Print it on a white shirt so it does not matter', 'Remove the whole design background including the main art'],
    answer: 1, why: 'Partly transparent pixels print as a faint box or a muddy edge in DTF. Solid shapes or a halftone keep the edge clean on any shirt color.' },
];

const WRITTEN = [
  { id: 'plan', part: 'craft', minutes: 6, label: 'Plan a design from a customer request',
    prompt: 'Sales passes you this from a customer: "We need shirts for our church\'s 5K fun run, about 150 people. Something fun! Our colors are navy and gold. We need them in 3 weeks." What questions do you ask before you design, and describe the design you would propose: layout, fonts, colors, where it goes on the shirt, the print method and why.',
    rubric: 'Asks only what is missing and needed (event name and date, church name or logo file, shirt color, any sponsors for the back, sizes split, front and back or front only, text that must appear); proposes a concrete design that suits a fun run (movement, a clear readable title, the date) using navy and gold sensibly on a chosen shirt color; chooses a print method that fits 150 shirts and a few spot colors (screen printing) and says why; mentions sending a proof; keeps the 3-week deadline in view. Vague answers ("something modern and fun") score 2 or lower.',
    model: "Questions first (one message to sales): the exact event name and date, the church's logo file if they want it on, the shirt color (navy shirts with gold ink, or white or heather grey shirts with both), front only or a sponsor list on the back, and the size split.\n\nDesign: a bold \"[Church] Fun Run 5K\" title in a heavy rounded sans-serif (easy to read from a distance), with a running shoe whose speed lines turn into a cross, and the date underneath in a smaller condensed font. On a navy shirt it is 2 colors: gold for the title and shoe, white for the date and lines. Front, 11 inches wide. A small logo on the back yoke if they have one.\n\nPrint: screen printing. 150 shirts in 2 spot colors is exactly what it is best and cheapest at, and gold ink stays bright on navy. I would send a proof with the shirt mockup and the sizes within a day, and get it approved by the end of week 1 so production has two weeks.",
  },
  { id: 'prep', part: 'craft', minutes: 5, label: 'Make it print-ready',
    prompt: 'A bakery sends their logo as a phone photo of their shop sign, taken at an angle. They want it embroidered on 20 aprons and screen printed in 1 color on 100 tees. Walk us through exactly how you would prepare the print-ready files for both.',
    rubric: 'Straightens and redraws the logo as clean vector (not an auto-trace left as is), matches or asks about the fonts; for screen printing makes a 1-color version (solid shapes, any shading as a halftone or removed), sized for the print area, sent as vector or separated film-ready art; for embroidery simplifies further (minimum text height, no fine detail or gradients, thread colors chosen), sized for the apron (about 3.5 to 4 inches), and either digitised or sent to the digitiser with size and thread colors; sends proofs of both versions for approval; mentions the extra time or cost of a redraw going to the owner or sales.',
    model: "1. Redraw: straighten the photo (perspective crop in Photoshop), then rebuild the logo as vector in Illustrator, using the Pen tool, not a raw auto-trace. Find the closest fonts (WhatTheFont) or redraw the lettering, and ask the bakery for their brand colors if they have them. I'd tell sales a redraw is needed so the owner can price it.\n2. Screen print, 1 color: a solid one-color version. Any shading becomes a simple halftone or is removed, and thin lines are thickened to at least 1pt. Sized at about 10 inches wide for the front, saved as .ai/.pdf with the ink color named (for example black or Pantone 7505 C).\n3. Embroidery: a simplified version, at about 3.5 inches wide for the apron chest. Text no smaller than 0.25 inch high, no thin outlines or tiny details, 2 or 3 thread colors. I'd send it to the digitiser with the size and thread colors, or digitise it if I have the software, and check the stitch-out preview.\n4. Proof both versions on mockups of the apron and the tee, and get written approval before anything is made.",
  },
  { id: 'feedback', part: 'craft', minutes: 4, label: 'Reply to a customer about a proof',
    prompt: 'A customer replies to your proof: "Hmm, I don\'t really like it. Can you make it pop more?" Write your reply to the customer exactly as you would send it.',
    rubric: 'Warm, not defensive; turns "pop" into specific choices (brighter or more contrasting colors, a bolder or bigger title, a different shirt color, more or less detail) and asks which they prefer, or offers two quick variations; asks what they DO like so it is kept; keeps the timeline in view (when the next proof comes, any deadline); short and clear.',
    model: "Thanks for telling me! Let's get it to where you love it. \"Pop\" can mean a few things, so I'll send you two quick versions by 2pm today:\n1. Brighter colors with more contrast against the shirt\n2. A bigger, bolder title with the rest kept simpler\nIs there anything in the current one you'd like to keep (the layout, the font, the icon)? And if you've seen a shirt you love, a photo helps a lot. We're still on track for your [date].",
  },
  { id: 'portfolio', part: 'craft', minutes: 3, label: 'Your work',
    prompt: 'Share a link to your portfolio (Behance, Google Drive, Dribbble, Instagram or a website). Then pick ONE piece you made to be printed on clothing or merchandise and tell us: what the brief was, which tools you used, how you prepared the file for print, and how it turned out.',
    rubric: 'Gives a portfolio link (the grader cannot open links: judge the description); the chosen piece was really made for print on apparel or merch; names the tools; describes print preparation concretely (vector, color count or separations, Pantone or thread colors, size, file type, halftones); a result or what they learned. Only screen or web work with no print preparation scores 2 or lower; no link and no piece scores 1.',
    model: "Portfolio: [link]. One piece: a 3-color tee for a high-school cross-country team. The brief was \"fast, old-school, the school's green and white\". I drew a running figure and a retro arched title in Illustrator, kept it to 3 spot colors (Pantone 342 C, white, and a light grey halftone made from the white for shading) for screen printing on a black tee, and sent the printer a separated .ai file at 11 inches wide with the fonts outlined. 220 shirts were printed, and the team reordered the same design the next year.",
  },
  { id: 'quiet', part: 'initiative', minutes: 4, label: 'Quiet time',
    prompt: 'It is 1pm. There is no artwork waiting, no questions from sales, and the owner is busy until 4pm. Tell us exactly what you would do with those 3 hours, and why.',
    rubric: 'Self-starter: names concrete, useful design work without being told, for example ready-made designs for upcoming seasons and events (back to school, sports seasons, holidays, graduations) that customers can order, new clipart or templates for the online designer, cleaning and naming past files so reorders are fast, better mockups or photos for the website and social posts, simplified embroidery versions of common logos; prioritised and specific. "I would wait", "I would ask what to do" or "I would study" alone score low.',
    model: "1:00-2:15 Make two ready-made designs for what is coming up next month (for example a back-to-school spirit tee and a fall football design), each in a 2-color screen-print version and a full-color DTF version, so sales has something to show schools and teams.\n2:15-3:00 Go through the last month's jobs: name and file the final art by customer, so a reorder takes five minutes, not an hour.\n3:00-3:40 Turn two recent jobs into clean mockups and draft social posts for June to approve.\n3:40-4:00 Send June a short summary: the new designs, where the files are, and anything that needs her decision.",
  },
  { id: 'bonus', part: 'bonus', minutes: 3, optional: true, label: 'Bonus: a skill we did not ask about',
    prompt: 'Is there a skill we did not ask about that could help June\'s Tees grow? For example embroidery digitising, color separations, video or motion graphics, social media, photography, web design, or AI image tools. Tell us what you have done with it and one result you are proud of. Links are welcome.',
    rubric: 'Score 0 if left blank. Rewards a real, evidenced skill useful to a small print shop (digitising, separations, video or Reels, product photography, social media growth, web or Shopify design, using AI image tools well and checking their output) with a concrete result. Vague claims with no example score 1-2.',
    model: "I digitise embroidery in Wilcom: about 300 logos for a uniform shop over two years, and I learned to plan stitch direction so small text stays sharp on caps. I also edit short Reels in CapCut: a before-and-after Reel I made of a print job reached 40,000 views. [link]",
  },
];

const INTERVIEW_GUIDE = [
  { section: 'Warm-up (3 min)', questions: [
    { q: 'Tell me about the design job where you learned the most about printing on clothing.',
      listen: 'Real print experience: screen printing, embroidery, DTF or vinyl, and a specific lesson (a print that went wrong and what they changed).' },
    { q: 'Why this job, and why a small print shop rather than an agency or freelancing?',
      listen: 'Wants steady work, to learn production, and to see their designs worn. Watch for "any job" answers.' }] },
  { section: 'Portfolio, on screen (8 min)', questions: [
    { q: 'Share your screen and open the working file of one piece from your portfolio. Walk me through the layers and how you made it print-ready.',
      listen: 'Organised layers, outlined fonts, named spot colors, sized to print. A flat JPG with no working file is a warning.' },
    { q: 'Which piece are you least proud of, and what would you change now?',
      listen: 'Honest, specific self-criticism. Designers who cannot name a weakness are hard to give feedback to.' }] },
  { section: 'Live task (8 min)', questions: [
    { q: 'I will send you a small logo as a JPG. In 8 minutes, make a clean 1-color version ready for screen printing, and talk me through it as you go.',
      listen: 'Uses the Pen tool or a careful trace and cleans it, keeps lines thick enough to print, works fast and explains choices. Panic or a raw auto-trace left as is is a warning.' }] },
  { section: 'Print knowledge (5 min)', questions: [
    { q: 'How do you prepare one design for screen printing, for embroidery and for DTF? What changes each time?',
      listen: 'Screen: spot colors, separations, halftones, ink color count. Embroidery: simplify, minimum text size, thread colors, digitising. DTF: full color OK, no semi-transparency, transparent PNG at 300 dpi.' },
    { q: 'A customer wants their logo matched exactly to their brand color. How do you do it?',
      listen: 'Asks for the brand guide or Pantone, uses Pantone for ink and the closest thread chart for embroidery, and explains that screens and fabrics vary a little.' }] },
  { section: 'Working with sales and customers (3 min)', questions: [
    { q: 'A customer has asked for a fourth round of changes and the deadline is in two days. What do you do?',
      listen: 'Stays friendly, asks for all remaining changes in one message, tells sales or the owner about the deadline risk, and never skips the final written approval.' }] },
  { section: 'Practical check (3 min)', questions: [
    { q: 'Show me your internet speed test and which design software you have, with its licence.',
      listen: 'At least 25 Mbps down, a backup connection, licensed Illustrator and Photoshop (or CorelDRAW / Affinity), a computer that runs them smoothly.' },
    { q: 'Confirm the schedule we posted. Any conflicts with other clients in those hours?',
      listen: 'A clear yes with no other job in the same hours.' }] },
  { section: 'Their questions (2 min)', questions: [
    { q: 'What would you like to know about us?',
      listen: 'Questions about the printing methods, the customers or how feedback works show real interest.' }] },
];

module.exports = {
  key: 'designer',
  label: 'Graphic designer',
  job: 'a remote graphic designer who turns customer requests into proofs and print-ready art for screen printing, embroidery and DTF',
  reward: 'Reward designers who think about how the art will actually print, communicate clearly with customers and sales, and find useful design work without being told.',
  /* The owner, 2026-10-06: every designer scored low, and the best customer
     communicator lost marks for print-shop detail. The post promises "We'll
     train you on our printing methods", so the grade must not demand them. */
  calibration: 'Calibrate to the people who apply. The job post promises we train printing methods (screen printing, embroidery, DTF) on the job, so do not mark a designer down to 1 or 2 only for missing print-shop specifics: Pantone numbers, color separations, thread colors, digitising, minimum text heights or exact print sizes. Those lift an answer to 4 or 5 when present. Score the design thinking, the customer communication and basic file sense (a clean vector redraw, sensible sizing, sending a proof). A capable designer with no print-shop experience who answers clearly and sensibly scores 3 or 4. Customer-facing communication counts heavily: a warm, clear reply that asks the right questions is worth at least a 3 even if it suggests a technique we would steer away from in print. Keep low scores for answers that are vague, careless, off-topic or blank, and keep judging initiative strictly.',
  minutes: MINUTES,
  intro: INTRO, parts: PARTS, weights: WEIGHTS, choice: MULTIPLE_CHOICE, written: WRITTEN, guide: INTERVIEW_GUIDE,
};
