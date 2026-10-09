'use strict';

/* The Design course final exam: forty new questions across every module,
   80% to pass. `A` is the course's article titles; Team basics questions
   name that module's articles. */

const TEAM = require('./shared-team').articles;

const f = (id, q, choices, answer, article, why) => ({ id, q, choices, answer, article, why });

module.exports = (A) => [
  // Team basics
  f('f1', 'You finish a banner and the 5K organiser\'s job is waiting on it. Where do you say so?',
    ['Nowhere', 'Your team channel, and a note on the job', 'Your own Instagram', 'An email to the customer'], 1, TEAM.chat,
    'Things more than one person needs go in a channel; notes about a job go on the job.'),
  f('f2', 'You said you would post a proof by noon. At noon it is not finished. You…',
    ['Stay quiet', 'Post why, and a new time', 'Send an unfinished proof to the customer', 'Mark it done'], 1, TEAM.chat,
    'Keep the time you gave, even when the news is a delay.'),
  f('f3', 'A customer replies to your proof asking for 15% off. You…',
    ['Agree', 'Say you will check and reply by a set time, then tell June', 'Refuse', 'Ignore the question'], 1, TEAM.questions,
    'Discounts are always June\'s.'),
  f('f4', 'You are off tomorrow and a proof is half done. Your handover says…',
    ['Nothing', 'What is done, what is open and on whom, any promise to the customer, and where the files are', 'Only "see you Monday"', 'The customer\'s phone number'], 1, TEAM.questions,
    'A handover nobody has to ask about.'),
  f('f5', 'You want ChatGPT to tidy a proof message. What do you paste?',
    ['The message with the customer\'s name and email', 'Your draft with "the customer" in place of their details', 'A screenshot of the job page', 'Their address'], 1, TEAM.customers,
    'Customer details never go into any AI tool.'),

  // How a design job moves
  f('f6', 'Which order does a design job follow?',
    ['Final art, proof, approval', 'Proof, written customer approval, final art, June approves, print', 'Print, then proof', 'June approves, then the customer sees it'], 1, A.flow,
    'The customer approves the proof in writing, then June approves the final files.'),
  f('f7', 'The sales note does not say which shirt color. You…',
    ['Pick black', 'Check What to make, and if it is not there, Ask sales a question', 'Ask the customer directly by phone', 'Wait'], 1, A.flow,
    'What to make has the garment color; if anything is missing, ask sales.'),
  f('f8', 'June presses Send back for changes on your final art. You…',
    ['Start over', 'Fix what her note says and submit again', 'Send it to the printer', 'Argue'], 1, A.flow,
    'Fix exactly what she asked.'),
  f('f9', 'Redrawing a low-resolution logo is which design fee?',
    ['Tweak $10', 'Setup $30', 'Commission $60', 'Free'], 1, A.flow,
    'Setup covers background removal and redrawing a low-resolution logo, with one round of changes.'),

  // Print-ready files
  f('f10', 'A 3-color design on the front of 60 tees needs how many screens?',
    ['3', '4', '6', '1'], 1, A.screen, '3 inks + 1 white base, one print place.'),
  f('f11', 'A design has 8 colors and a photo. It suits…',
    ['Screen print', 'DTF', 'Embroidery', 'Vinyl'], 1, A.screen, 'More than 5 colors or a photo is a DTF job.'),
  f('f12', 'A screen print design has a soft drop shadow. You…',
    ['Keep it', 'Remove it or make it a halftone of solid dots', 'Make it a glow', 'Print it as DTF without telling anyone'], 1, A.screen,
    'A screen prints solid ink or nothing.'),
  f('f13', 'Which text is too small for screen print?',
    ['12 pt', '8 pt', '4 pt', '24 pt'], 2, A.screen, 'Text at least 6 pt; lines at least 1 pt.'),
  f('f14', 'A DTF design has a white rectangle behind it. You…',
    ['Leave it', 'Make the background transparent', 'Make it a JPG', 'Print it smaller'], 1, A.dtf, 'A white background prints as a white box.'),
  f('f15', 'Faded edges on a DTF design will…',
    ['Look soft and nice', 'Print as a haze, because white ink goes under them', 'Disappear', 'Turn black'], 1, A.dtf,
    'Every pixel fully solid or fully clear.'),
  f('f16', 'A left-chest embroidered logo is about…',
    ['1 inch wide', '3.5 to 4 inches wide', '11 inches wide', 'Full back'], 1, A.dtf, 'Left chest is about 3.5 to 4 inches.'),
  f('f17', 'The customer already has a DST file of their logo. Digitizing is…',
    ['Charged twice', 'Waived, if the file is usable', '$60', 'Needed anyway'], 1, A.dtf, 'A usable stitch file waives the fee.'),

  // Signs
  f('f18', 'A 4 ft wide banner at 100 dpi is how many pixels wide?',
    ['400', '4800', '1200', '100'], 1, A.signs, '48 inches x 100 dpi.'),
  f('f19', 'A photo panel needs what resolution at full size?',
    ['100 dpi', '150 dpi', '200 dpi', '50 dpi'], 2, A.signs, 'People stand close to photo panels and canvas.'),
  f('f20', 'Why design signs in CMYK?',
    ['It is smaller', 'Bright screen colors can print duller; CMYK shows what will print', 'Signs365 hates RGB', 'It is faster'], 1, A.signs,
    'CMYK is the ink the sign is printed with.'),
  f('f21', 'A customer wants rope in the hem and grommets on the same edge. That is…',
    ['Fine', 'Not possible: rope goes in welded edges with no grommets', 'Extra $1', 'Only on vinyl'], 1, A.signs,
    'Rope needs welded edges and no grommets.'),
  f('f22', 'Text on a stretched canvas sits…',
    ['In the 3 inches that wrap the frame', 'Inside the front face, clear of the wrap', 'On the back', 'Anywhere'], 1, A.signs,
    'The wrap goes round the sides.'),

  // Photoshop and Illustrator
  f('f23', 'Image Trace gives you a wobbly logo with 40 colors. You…',
    ['Send it', 'Reduce colors, delete specks, fix curves and letters by hand, or redraw it', 'Add more colors', 'Rasterize it'], 1, A.adobe,
    'Tracing always needs hand cleanup.'),
  f('f24', 'Before sending a screen print file, the type is…',
    ['Live', 'Outlined', 'Deleted', 'Rasterized at 72 dpi'], 1, A.adobe, 'Outlined, so it cannot change on another computer.'),
  f('f25', 'Defringe (Layer, Matting) is for…',
    ['Adding a glow', 'Removing a white fringe around a cutout', 'Changing color mode', 'Making text'], 1, A.adobe,
    'It cleans the edge of a cutout.'),
  f('f26', 'You need a design 12 inches wide at 300 dpi. The image is 1500 pixels wide. It is…',
    ['Big enough', 'Too small: it needs 3600', 'Too big', 'Fine for screen print'], 1, A.adobe, '12 x 300 = 3600 pixels.'),

  // AI
  f('f27', 'Which job should AI never do?',
    ['A background for a post', 'The words on a team shirt', 'A rough concept', 'Extending a photo background'], 1, A.aiWhen,
    'AI misspells and invents letters: set every word yourself.'),
  f('f28', 'A business asks for a new logo. You…',
    ['Generate it with AI', 'Draw it yourself, so they can own it', 'Use a free logo site', 'Copy a similar one'], 1, A.aiWhen,
    'AI-only art cannot be copyrighted.'),
  f('f29', 'A prompt idea: "a Mickey Mouse style mascot". You…',
    ['Use it', 'Never put characters or brands in a prompt', 'Use it in Firefly', 'Change one letter'], 1, A.aiWhen,
    'Never brands, characters, teams or named artists.'),
  f('f30', 'Which tool for removing a car from a shop photo?',
    ['Vectorizer.ai', 'Photoshop Generative Fill', 'Canva', 'Illustrator Image Trace'], 1, A.aiWhen, 'Generative Fill edits photos.'),
  f('f31', 'An AI cutout looks perfect on white. Next check?',
    ['None', 'On black at 100%, for a halo', 'Print it', 'Shrink it'], 1, A.aiClean, 'Halos hide on white.'),
  f('f32', 'A customer\'s AI design from the website has a faint gray box behind it. You…',
    ['Print it', 'Remove it, send a proof showing the change, get written approval', 'Ignore it', 'Cancel the order'], 1, A.aiClean,
    'Fix what will not print well, and never change a customer\'s design silently.'),
  f('f33', 'Vectorizing AI art: the right order?',
    ['Vectorize, then remove the background', 'Clean background and text, vectorize, then clean up in Illustrator', 'Upscale only', 'Print first'], 1, A.aiClean,
    'Clean, vectorize, clean again.'),

  // Proofs
  f('f34', 'A proof for an order printed on the front and the left sleeve shows…',
    ['The front', 'Both places, with size and placement', 'The sleeve', 'Neither'], 1, A.proofs, 'Every print place on the order.'),
  f('f35', 'The customer approves by text. Before June ticks it approved, the approval is…',
    ['Forgotten', 'Logged on the job', 'Deleted', 'Forwarded to the printer'], 1, A.proofs, 'Approval in writing, logged on the job.'),

  // Web and Etsy
  f('f36', 'A blog photo is 4 MB. Before you hand it over you…',
    ['Send it as is', 'Export it 1200 px wide, JPG or WebP, under 300 KB', 'Make it a PNG', 'Zip it'], 1, A.web, 'Fast pages need small images.'),
  f('f37', 'Which is the right file name for a web image?',
    ['IMG_9921.JPG', 'embroidered-polos-chicago.jpg', 'polo FINAL.jpg', 'image.jpg'], 1, A.web, 'Plain words, lowercase, hyphens.'),
  f('f38', 'An Etsy download listing says "8.5 x 11 in PDF". You export…',
    ['Any size', 'Exactly 8.5 x 11 in, full quality, every page checked', 'A small preview', 'A JPG'], 1, A.web,
    'Exactly what the listing promises.'),

  // Social
  f('f39', 'A Story graphic has text right at the bottom edge. Problem?',
    ['None', 'The app\'s buttons cover it: keep text clear of the top and bottom', 'It is too small', 'Stories cannot have text'], 1, A.social,
    'Keep text out of the top and bottom 250 pixels.'),
  f('f40', 'You have a great photo of a kids\' team in their shirts, faces clear. You…',
    ['Post it', 'Post it only with a parent\'s or the team\'s OK', 'Post it with the team name', 'Use AI to change the faces'], 1, A.social,
    'Children\'s faces need a parent\'s OK.'),
];
