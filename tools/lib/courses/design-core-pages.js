'use strict';

/* The Design course lessons as pages, the same way sales-core-pages.js does
   the Sales course: `from` is the bold heading a page starts at, and every
   page ends with a couple of questions about what it just said (multiple
   choice, answered on the page, never marked). */

const q = (text, choices, answer, why) => ({ q: text, choices, answer, why });

module.exports = {
  'd2-flow': [
    { from: null, checks: [
      q('Which card shows what the customer is paying for?', ['Notes', 'What to make', 'Messages'], 1, 'Design for what is on What to make.'),
      q('Where do new design jobs also show up?', ['Artwork to do on My Day', 'The Quotes board', 'Your email'], 0, 'Oldest first, on My Day.'),
    ] },
    { from: 'When something is missing', checks: [
      q('The logo is a blurry screenshot. First step?', ['Guess', 'Ask sales a question on the Artwork card', 'Start the proof'], 1, 'Never guess; a wrong proof costs a day.'),
      q('When do you submit final art?', ['Before the proof', 'After the customer approves the proof in writing', 'Whenever'], 1, 'Written approval first, then final art to June.'),
    ] },
    { from: 'Chasing the customer', checks: [
      q('When is the second nudge?', ['After 1 hour', 'After 2 more working days', 'Never'], 1, 'First after 1 working day, second after 2 more.'),
      q('A job needs more design work than the quote shows. You tell sales…', ['Before you do it', 'After you finish', 'Never'], 0, 'Sales adds the fee before you start.'),
    ] },
  ],
  'd3-screen': [
    { from: null, checks: [
      q('A 2-color design on the front and back needs how many screens?', ['2', '4', '6: (2 + 1 base) x 2 places'], 2, 'Screens = (inks + 1 for the base) x print places.'),
      q('How many ink colors can our press print at most?', ['5', '8', 'Unlimited'], 0, '6 screens per pass, the base included.'),
    ] },
    { from: 'Building the file', checks: [
      q('Each ink in a screen print file is…', ['A named spot color', 'A gradient', 'A drop shadow'], 0, 'One spot color per ink.'),
      q('A fade in a screen print design has to become…', ['A glow', 'A halftone of solid dots', 'A photo'], 1, 'A screen prints solid ink or nothing.'),
    ] },
    { from: 'Lines, text and small details', checks: [
      q('Minimum line weight for screen print?', ['0.1 pt', '1 pt', '10 pt'], 1, 'Thinner lines close up in the mesh.'),
      q('"Exactly our brand blue" needs…', ['A Pantone number', 'A screenshot', 'Nothing'], 0, 'Never promise an exact match without one.'),
    ] },
  ],
  'd3-dtf': [
    { from: null, checks: [
      q('A DTF print 10 inches wide needs how many pixels across?', ['1000', '3000', '300'], 1, '300 dpi x 10 inches.'),
      q('A soft drop shadow on DTF prints as…', ['A crisp shadow', 'A haze', 'Nothing'], 1, 'Semi-transparent pixels get white ink under them.'),
    ] },
    { from: 'Embroidery', checks: [
      q('Smallest text for embroidery?', ['0.1 inch', '0.25 inch', '1 inch'], 1, 'Smaller text fills in.'),
      q('Digitizing is…', ['Charged on every order', 'A one-time fee per design', 'Free'], 1, '$30 up to 15,000 stitches; waived with a usable stitch file.'),
    ] },
    { from: 'Patches, vinyl and puff print', checks: [
      q('Before you submit, you check the file at…', ['Any size', 'The real print size', 'Thumbnail size'], 1, 'Big enough, sharp, spelled right, at the real size.'),
      q('A design uses a brand the customer does not own. It goes to…', ['Print', 'June', 'The customer'], 1, 'Logos the customer does not own are June\'s call.'),
    ] },
  ],
  'd4-signs': [
    { from: null, checks: [
      q('Who prints our signs?', ['Signs365, from our files', 'Our DTF printer', 'The customer'], 0, 'A trade printer prints and finishes them.'),
      q('Banners come in…', ['Any inch size', 'Whole feet, short side up to 5 ft', 'Only 3x6'], 1, 'Whole feet; short side up to 5 ft, long up to 30 ft.'),
    ] },
    { from: 'Resolution at size', checks: [
      q('A yard sign needs what at full size?', ['150 dpi', '30 dpi', '1000 dpi'], 0, 'Yard, rigid, window, wall, vehicle and magnets: 150.'),
      q('Signs are designed in…', ['RGB', 'CMYK', 'Grayscale'], 1, 'CMYK, with fonts outlined.'),
    ] },
    { from: 'Bleed and safe zone', checks: [
      q('Text on a banner sits…', ['At the very edge', 'Well inside the cut line', 'In the grommet area'], 1, 'Hems and grommets must never touch it.'),
      q('Can rope and pole pockets go on one banner?', ['Yes', 'No'], 1, 'Never both.'),
    ] },
  ],
  'd5-adobe': [
    { from: null, checks: [
      q('Photoshop is mainly for…', ['Vectors', 'Pixels: photos, DTF art, mockups, web images', 'Stitch files'], 1, 'Illustrator for vectors, Photoshop for pixels.'),
      q('A simple logo from a website, needed big: you…', ['Enlarge it', 'Ask for the original, or redraw it in Illustrator', 'Blur it'], 1, 'Enlarging only makes the blur bigger.'),
    ] },
    { from: 'Separations for screen print', checks: [
      q('Before export, type in a screen print file is…', ['Live text', 'Outlined', 'Deleted'], 1, 'Outlines cannot change on another computer.'),
      q('Best way to see a white halo?', ['On a white layer', 'On a solid black layer, zoomed in', 'Printed'], 1, 'Halos hide on white.'),
    ] },
    { from: 'Size and resolution', checks: [
      q('You set the document to…', ['The real print size in inches at 300 dpi', '1000 x 1000 pixels always', 'Whatever opens'], 0, 'Work at the real size.'),
      q('Customer orders are made in…', ['Canva', 'Illustrator and Photoshop'], 1, 'Canva is only for Etsy downloads.'),
    ] },
  ],
  'd6-ai-when': [
    { from: null, checks: [
      q('The rule for AI images?', ['AI makes the final file', 'AI makes drafts; you make the file'], 1, 'Everything AI makes is a draft.'),
      q('A good AI job?', ['A business logo', 'A background for a mockup', 'A customer\'s portrait'], 1, 'Backgrounds and concepts, not logos or people.'),
    ] },
    { from: 'Never use AI for', checks: [
      q('Why never an AI logo for a business?', ['It is slow', 'AI-only art cannot be copyrighted, so they could not own it', 'It is too colorful'], 1, 'US Copyright Office, January 2025.'),
      q('May a customer\'s email go into an AI tool?', ['Yes', 'No, never'], 1, 'Customer details never go into AI.'),
    ] },
    { from: 'Which tool for what', checks: [
      q('Removing a stray object from a photo: which tool?', ['Photoshop Generative Fill', 'Vectorizer.ai', 'Canva'], 0, 'Generative Fill edits photos.'),
      q('A realistic AI scene in a post needs…', ['Nothing', 'The platform\'s AI label', 'A watermark'], 1, 'Label it; never pass it off as a real order.'),
    ] },
  ],
  'd6-ai-clean': [
    { from: null, checks: [
      q('AI lettering on a design is…', ['Kept', 'Retyped in a real font', 'Upscaled'], 1, 'Never keep AI lettering.'),
      q('A faint box behind an AI design is…', ['A backdrop AI painted: remove it', 'Fine for DTF', 'A shadow to keep'], 0, 'AI often paints a backdrop even when asked not to.'),
    ] },
    { from: 'Customers\' AI designs from the website', checks: [
      q('The site already cleaned the halo. You…', ['Skip checks', 'Still check the print file, especially on dark garments'], 1, 'The site helps; it is not perfect.'),
      q('You fix a flaw in a customer\'s AI design. Next?', ['Print it', 'Send a proof showing the change and get written approval'], 1, 'Never change a customer\'s design silently.'),
    ] },
    { from: 'Vectorizing AI art', checks: [
      q('Before Vectorizer.ai, you…', ['Remove the background and fix the text', 'Add a glow', 'Shrink it'], 0, 'Clean it first, then vectorize, then clean again.'),
      q('Upscaling is good for…', ['Photos and textures', 'Logos and text'], 0, 'Redraw logos and text instead.'),
    ] },
  ],
  'd7-proofs': [
    { from: null, checks: [
      q('A proof shows the design on…', ['A white shirt always', 'The garment and color they ordered'], 1, 'What they ordered, every print place.'),
      q('Written on the proof:', ['The print size and placement', 'The price'], 0, 'For example "Front, 11 in wide, 3 in below the collar".'),
    ] },
    { from: 'Check before you send', checks: [
      q('How do you check names on a proof?', ['Letter by letter, out loud', 'A quick look'], 0, 'Names, numbers and dates are where mistakes hide.'),
      q('While you are in training, a sent proof goes…', ['Straight to the customer', 'To June first'], 1, 'That is normal.'),
    ] },
    { from: 'Changes and approval', checks: [
      q('"Looks good" on a call is…', ['Approval', 'Not approval: it must be in writing'], 1, 'Email, text or chat.'),
      q('A customer approves a proof with a typo. You…', ['Print it', 'Point it out, send a corrected proof, get approval again'], 1, 'We print exactly what was approved.'),
    ] },
  ],
  'd8-web': [
    { from: null, checks: [
      q('Product images on the shop are…', ['Square, on a clean, consistent background', 'Any shape and background'], 0, 'So the shop looks like one shop.'),
      q('Which mockup templates may you use?', ['Any from the internet', 'Ones the shop has a license for'], 1, 'Licensed templates only.'),
    ] },
    { from: 'Blog images', checks: [
      q('A blog image weighs…', ['Under 300 KB', 'Over 5 MB'], 0, '1200 px wide, JPG or WebP, under 300 KB.'),
      q('Alt text is…', ['A list of keywords', 'One plain sentence saying what is in the image'], 1, 'Under 125 characters, no "image of".'),
    ] },
    { from: 'Etsy downloads in Canva', checks: [
      q('Canva is used for…', ['Etsy downloads', 'Screen print separations'], 0, 'The one place we use Canva.'),
      q('Clipart for the online designer is at most…', ['3300 px on its longest side', '20,000 px'], 0, 'Bigger shows as a black box on iPhones.'),
    ] },
  ],
  'd9-social': [
    { from: null, checks: [
      q('Who makes the videos?', ['You', 'The Content person'], 1, 'You make images; Content makes video.'),
      q('Instagram feed size?', ['1080 x 1350', '1920 x 1080'], 0, '4:5 portrait.'),
    ] },
    { from: 'What to post', checks: [
      q('How many feed posts a week, at least?', ['3', '1 a month'], 0, 'Aim for 3 or more.'),
      q('Steps or a before-and-after suit…', ['A carousel', 'A single text post'], 0, 'Carousels show steps.'),
    ] },
    { from: 'Building posts in COS', checks: [
      q('Where do you upload graphics in COS?', ['Media Library', 'The Calendar only'], 0, 'With a short description each.'),
      q('Pending on the calendar means…', ['Waiting for June\'s approval', 'Posted'], 0, 'June approves before it goes out.'),
    ] },
    { from: 'Never post', checks: [
      q('A customer\'s photo needs…', ['Their written permission', 'Nothing'], 0, 'And a parent\'s OK for children\'s faces.'),
      q('An AI image passed off as a real order is…', ['Fine', 'Never allowed'], 1, 'Label realistic AI; never fake an order.'),
    ] },
  ],
};
