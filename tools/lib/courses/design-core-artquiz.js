'use strict';

/* The artwork quiz (key `design`): the one the design checklist had before
   the Design course existed, kept word for word so a pass still counts. It
   gates module 3. `A` is the course's article titles (unused here: these
   questions name the Playbook articles they were written against). */

module.exports = (A) => [
    { id: 'blurry', q: 'A customer sends a blurry 200-pixel logo from Facebook for a 12-inch back print. What do you do?',
      choices: ['Upscale it and print it', 'Ask for the original file, or offer to redraw it as a vector (a design fee may apply)',
        'Print it smaller so the blur shows less', 'Tell them we cannot use it'],
      answer: 1, article: 'What artwork should I send?', why: 'The best file is a vector. With only a small image, ask for the original or redraw it, and say if a fee applies.' },
    { id: 'pantone', q: 'A customer wants their logo screen printed in "exactly our brand red". What do you need?',
      choices: ['Nothing, pick the closest red', 'A screenshot of their website', 'The Pantone number for the red', 'A photo of a shirt they like'],
      answer: 2, article: 'Screen printing: artwork do\'s and don\'ts', why: 'Never promise an exact color match without a Pantone number.' },
    { id: 'colours', q: 'Why does the number of ink colors matter for screen printing?',
      choices: ['It does not matter', 'Every color is its own screen, so it changes the price', 'More colors print faster', 'Only white ink costs extra'],
      answer: 1, article: 'Screen printing: artwork do\'s and don\'ts', why: 'Every ink color needs its own screen, and the price is banded on the color count.' },
    { id: 'glow', q: 'A DTF design has a soft glow and drop shadow behind the text. What do you do?',
      choices: ['Leave it, DTF prints everything', 'Remove the semi-transparent glow and shadow, or make them solid',
        'Make the glow bigger', 'Switch it to embroidery'],
      answer: 1, article: 'DTF: artwork do\'s and don\'ts', why: 'Semi-transparent pixels, glows and soft shadows print as a haze on DTF.' },
    { id: 'whitebox', q: 'Your DTF file has a white box behind the design. What is wrong?',
      choices: ['Nothing, white disappears on a white shirt', 'The background must be transparent, or the white box prints too',
        'It needs to be a JPG', 'It must be 72 dpi'],
      answer: 1, article: 'DTF: artwork do\'s and don\'ts', why: 'DTF needs a transparent PNG at 300 dpi. A white box behind the design prints as a white box.' },
    { id: 'embtext', q: 'A left-chest embroidery logo has a tiny tagline under it. What do you do?',
      choices: ['Shrink it further to fit', 'Keep text at least 0.25 inches tall: enlarge it or drop the tagline (ask the customer)',
        'Embroider it as is', 'Switch the whole logo to DTF without asking'],
      answer: 1, article: 'Embroidery: artwork do\'s and don\'ts', why: 'Embroidered text needs to be at least 0.25 inches tall. Small text fills in and cannot be read.' },
    { id: 'teamlogo', q: 'A parent asks for a design using the Chicago Bulls logo. What do you do?',
      choices: ['Redraw the logo so it is not an exact copy', 'Design it, it is for personal use', 'Bring it to the owner: we do not print logos the customer does not own',
        'Find the logo on Google Images'],
      answer: 2, article: 'What never to promise', why: 'Logos the customer does not own always go to the owner. Offer an original design instead.' },
    { id: 'typo', q: 'The customer replies "looks great!" to a proof, but you notice their team name is misspelled. What now?',
      choices: ['Print it, they approved it', 'Fix it quietly and print', 'Point out the spelling, send a corrected proof, and get approval in writing again',
        'Ask the owner to print it anyway'],
      answer: 2, article: 'Proof approval', why: 'We print exactly what is approved. A corrected design needs a new proof and a new written approval.' },
    { id: 'approved', q: 'When can you tick "Proof approved" on a job?',
      choices: ['When you send the proof', 'When the customer says yes on a phone call', 'Only when you have their approval in writing (email, text or chat), logged as a note',
        'After 24 hours with no reply'],
      answer: 2, article: 'Proof approval', why: 'Approval must be in writing and logged on the job before anything goes to print.' },
    { id: 'blogimg', q: 'You need a photo for a blog post about team shirts. Which can you use?',
      choices: ['Any photo from Google Images', 'Our own job photos, or stock photos we are licensed to use',
        'A photo from another print shop\'s website', 'A customer\'s child from their Facebook page'],
      answer: 1, article: 'Blog updates: copy and images', why: 'Use our own photos (with permission for any customer in them) or licensed stock. Never copy images from the web.' },
];
