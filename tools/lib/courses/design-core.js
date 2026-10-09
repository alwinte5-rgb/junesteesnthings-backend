'use strict';

/* The Design course: the eight hours a designer walks before sending proofs
   on their own (owner, 2026-10-09). It replaced the old design checklist in
   training.js and keeps its sign-off keys (signoff:art, signoff:handoff,
   signoff:ready), its "do" steps (do:message, do:proof) and its quiz key
   (`design`), so a designer's earlier ticks and passes still count.

   What the course teaches comes from what the shop already wrote down or
   built: the artwork articles in the Playbook, the screen, embroidery and
   design-fee prices in server.js, the sign families in
   tools/lib/sign-families.js and signage.js, and the online designer's AI
   pipeline and its known failure modes. Industry practice fills the rest
   (DTF opacity, sign bleed, image sizes for the web and social). Anything
   only the owner knows is written "[owner to fill in: ...]", which the
   Training page's "Playbook gaps" card asks her for. */

const TEAM = require('./shared-team');

const A = {
  flow:     'Design course 2: How a design job moves',
  screen:   'Design course 3a: Screen print files',
  dtf:      'Design course 3b: DTF, embroidery and the rest',
  signs:    'Design course 4: Signs and banners',
  adobe:    'Design course 5: Photoshop and Illustrator',
  aiWhen:   'Design course 6a: AI, when to use it',
  aiClean:  'Design course 6b: AI, cleaning up what it makes',
  proofs:   'Design course 7: Proofs that get approved',
  web:      'Design course 8: Site, blog and Etsy images',
  social:   'Design course 9: Social media graphics',
};

const GLOSSARY = {
  'vector': 'Artwork made of shapes and paths (AI, EPS, SVG, PDF). It scales to any size without blurring.',
  'raster': 'Artwork made of pixels (PNG, JPG, PSD). It blurs when it is printed bigger than it was made.',
  'dpi': 'Dots (pixels) per inch at the size it prints. We ask for 300 at print size.',
  'spot color': 'One solid ink, mixed to a recipe. Screen printing prints one spot color per screen.',
  'halftone': 'Shading made of solid dots, so a screen can print a fade with one ink.',
  'underbase': 'A layer of white ink printed first, so colors stay bright on the shirt.',
  'bleed': 'Extra artwork past the cut line, so nothing white shows if the cut moves slightly.',
  'safe zone': 'The area inside the cut line where text and logos stay, clear of trimming, hems and grommets.',
  'digitizing': 'Turning a logo into a stitch file for the embroidery machine. A one-time fee per design.',
  'semi-transparent': 'Pixels that are partly see-through: soft edges, glows, shadows. On DTF they print as a haze.',
  'mockup': 'A picture of the design on the product, for a proof, the website or a post.',
  'alt text': 'A short description of an image, read aloud to people who cannot see it and read by search engines.',
};

const DESIGN_FEES = 'Tweak $10 (small changes to a customer\'s ready file), Setup $30 (background removal, redrawing a low-resolution logo, one round of changes), Commission $60 (a new design: up to two hours and two rounds, then $35 an hour), and $25 for each extra round of changes';

const MODULES = [
  /* ── 1 ── */
  { ...TEAM.MODULE,
    practice: [{ key: 'do:message', type: 'do', fact: 'messages', minutes: 5,
      title: 'Write your first customer message', hint: 'From a job page, for example "Proof ready". While you are in training it waits for June first.' }] },

  /* ── 2 ── */
  {
    key: 'd2', icon: '🧭', title: 'How a design job moves',
    goal: 'Know where your work comes from, what you hand back, and how a job reaches the printer.',
    lessons: [{
      id: 'd2-flow', article: A.flow, minutes: 25, tags: 'design board, artwork, ask sales, final art, approve, changes, chasing, design fees, my day',
      goals: ['Find your jobs and everything you need on them', 'Ask sales a question instead of guessing', 'Submit final art June can approve first time'],
      tryIt: [{ label: 'Your design board', href: '/admin/design' }, { label: 'My Day', href: '/admin/my-day' }],
      body:
`Every design job follows the same path: sales takes the order, you make the art and the proof, the customer approves it in writing, June approves the final files, and it goes to print. You see only what you need for the art: no prices and no customer contact details.

**Your design board**

Open **Design** in the menu. Jobs are listed soonest-due first; finished ones stay for two weeks. New jobs also show under **Artwork to do** on My Day, oldest first.

Each job page has, in order:

- **What to make:** the items, garment color, quantity, sizes, print method and where it prints. This is what the customer is paying for, so it is what you design for
- **Customer artwork:** their files. Download one, or **Download all** as a zip
- **Artwork:** the note from sales, your questions, and your final files
- **Proofs**, **Messages** and **Notes**

Customers show by first name only. Messages you send go through the system; their replies go to June, who passes on anything for you.

**When something is missing**

Read the sales note and the customer's files before you start. If anything is unclear or missing (a blurry logo, no colors, a size that will not fit), press **Ask sales a question** on the Artwork card. The question shows on the salesperson's My Day, and their answer comes back to the job.

Never guess. A guess becomes a proof, and a wrong proof costs a day.

**Submitting final art**

Once the customer has approved the proof in writing:

1. Upload the print-ready files on the Artwork card: vector or separated colors for screen print, a transparent PNG for DTF, the art for digitizing for embroidery, a print file for signs
2. Press **Submit final art to the owner** with a short note: what each file is, and anything June should know ("2 colors plus base, front 11 in wide")
3. June presses **Approve final art**, or **Send back for changes** with a note. Fix exactly what she asks and submit again

Submit is refused with no files attached. A reorder or a new design starts a new round; earlier files stay in History.

**Chasing the customer**

A job cannot print without the customer's file and their written approval. Each morning, check your jobs waiting on the customer:

- After 1 working day, a friendly, specific nudge: what you need and the date it affects (Playbook /artnudge)
- After 2 more days, a second nudge with the print date at risk spelled out. Tell sales so they can call
- If the deadline is now at risk, tell sales and June the same day

**Design fees**

Some work is charged: ${DESIGN_FEES}. Sales adds the fee to the quote. If a job needs more work than the quote shows (the "logo" is a photo of a sign, or the customer wants a third round), tell sales before you do the extra work, not after.`,
    }],
    practice: [],
    quiz: {
      key: 'design-2', title: 'Module 2 quiz: how a design job moves', minutes: 10,
      questions: [
        { id: 'where', q: 'Where do you see the garment color, sizes and print method for a job?',
          choices: ['In Team chat', 'The "What to make" card on the job\'s design page', 'In the customer\'s email', 'On the Quotes board'],
          answer: 1, article: A.flow, why: 'What to make is what the customer is paying for, so it is what you design for.' },
        { id: 'order', q: 'Which order is right?',
          choices: ['Final art, then proof, then customer approval', 'Proof, written customer approval, then final art to June', 'Print, then proof', 'June approves, then the customer sees a proof'],
          answer: 1, article: A.flow, why: 'The customer approves the proof in writing; then June approves the final files.' },
        { id: 'missing', q: 'The sales note says "use their logo" but no file is attached. You…',
          choices: ['Find their logo on Google', 'Press Ask sales a question on the Artwork card', 'Design a new logo', 'Wait a week'],
          answer: 1, article: A.flow, why: 'Ask sales instead of guessing.' },
        { id: 'contact', q: 'Why can you not see the customer\'s email or phone?',
          choices: ['A bug', 'Designers see only what they need; messages go through the system', 'You must ask the customer', 'Only on weekends'],
          answer: 1, article: A.flow, why: 'Messages go through the job page; replies come to June.' },
        { id: 'submit', q: 'You press Submit final art with no files. What happens?',
          choices: ['June gets an empty job', 'It is refused: upload the files first', 'It prints', 'The customer is emailed'],
          answer: 1, article: A.flow, why: 'Submit is refused until the final files are attached.' },
        { id: 'note', q: 'What goes in the note with your final art?',
          choices: ['Nothing', 'What each file is and anything June should know, like color count and size', 'The price', 'The customer\'s phone'],
          answer: 1, article: A.flow, why: 'A short note lets June approve it first time.' },
        { id: 'sentback', q: 'June presses Send back for changes. You…',
          choices: ['Start again from scratch', 'Fix exactly what her note asks and submit again', 'Argue in chat', 'Send it to the customer'],
          answer: 1, article: A.flow, why: 'Fix what she asked and resubmit.' },
        { id: 'nudge', q: 'A customer has not sent their logo for one working day. You…',
          choices: ['Wait another week', 'Send a friendly nudge saying what you need and the date it affects', 'Cancel the job', 'Print without it'],
          answer: 1, article: A.flow, why: 'First nudge after 1 working day, specific and friendly (/artnudge).' },
        { id: 'atrisk', q: 'The print date is now at risk because the customer has not approved. You…',
          choices: ['Print anyway', 'Tell sales and June the same day', 'Say nothing', 'Approve it yourself'],
          answer: 1, article: A.flow, why: 'Never print without written approval; tell sales and June when the date is at risk.' },
        { id: 'fee', q: 'The "logo" turns out to be a phone photo of a sign and needs redrawing. The quote has no design fee. You…',
          choices: ['Redraw it and say nothing', 'Tell sales before you do the extra work', 'Refuse the job', 'Charge the customer yourself'],
          answer: 1, article: A.flow, why: 'Redrawing a low-resolution logo is a $30 setup fee; sales adds it before you start.' },
      ],
    },
    buffer: 6,
  },

  /* ── 3 ── */
  {
    key: 'd3', icon: '🎨', title: 'Print-ready files by method',
    goal: 'Make files that print right the first time, for each way we decorate.',
    lessons: [{
      id: 'd3-screen', article: A.screen, minutes: 20, tags: 'screen printing, vector, spot color, separations, underbase, white base, screens, halftone, line weight, pantone',
      goals: ['Count the screens a design needs', 'Prepare separated spot-color art', 'Know when a design should be DTF instead'],
      images: [{ src: '/assets/images/work/screen-printing-press.jpg', alt: 'A screen printing press: one screen per ink' }, { src: '/assets/images/work/screen-printing-silkscreen.jpg', alt: 'A silkscreen ready for the press' }],
      body:
`Screen printing pushes ink through a mesh screen, one screen per ink color. It is the cheapest way to print 50 or more of the same design, and the most demanding about files.

**Colors and screens**

- Every ink color is its own screen, and every garment also gets a white base (underbase) screen. Screens = (ink colors + 1 for the white base) x print places
- Each screen costs $25 to set up, and the price per shirt is banded on the color count, so one more color really does change the price
- Our press takes 6 screens in one pass, base included. That is **5 ink colors at most**
- A design with a photo, a fade between many colors, or more than 5 colors is a DTF job. The online designer moves those to DTF by itself; on a quote, tell sales
- Under 50 pieces is also DTF

**Building the file**

- Vector (AI, EPS, SVG or PDF) is best. A raster file must be 300 dpi at the size it prints
- Build each ink as a **spot color** on its own layer or separation, named for the ink ("Navy", "Gold")
- Fonts converted to outlines, so they cannot change on another computer
- No transparency effects, blends, glows or drop shadows: a screen prints solid ink or nothing
- Shading has to become a **halftone**: solid dots of one ink that read as a fade from a distance. Ask June the first few times you make one

**Lines, text and small details**

- Lines at least 1 pt thick and text at least 6 pt. Thinner closes up in the mesh and disappears
- Leave a little gap between colors that touch, or overlap them slightly (a trap) where they meet, so no shirt shows through if the screens move a hair
- Check the design at the real print size, not zoomed in

**Matching colors**

- An exact match needs a **Pantone number** (for example "Pantone 186 C"). Ask the customer through sales if they want "exactly our red"
- Without one, we match by eye and never promise exact
- Specialty inks (metallic, glitter, water-based, discharge) cost extra per piece; only use one if the quote has it`,
    }, {
      id: 'd3-dtf', article: A.dtf, minutes: 20, tags: 'dtf, transparent png, semi-transparent, glow, halo, embroidery, digitizing, stitches, left chest, patches, vinyl, puff',
      goals: ['Prepare a DTF file with no haze or white box', 'Size and simplify art for embroidery', 'Know what to check for patches, vinyl and puff'],
      images: [{ src: '/assets/images/work/full-color-dtf-transfer.jpg', alt: 'A full-color DTF transfer' }, { src: '/assets/images/work/embroidery-in-progress.jpg', alt: 'Embroidery in progress' }],
      body:
`**DTF (direct-to-film)**

DTF prints the design in full color onto a film, with white ink behind it, and heat-presses it onto the garment. No minimum and no color limit, which is why it is our default for small runs and photos.

- A **transparent PNG at 300 dpi at the print size**. A 10-inch-wide print is 3000 pixels wide
- No white box behind the design: a white background prints as a white box
- **Every pixel either fully solid or fully clear.** The printer lays white ink under anything that is not clear, so semi-transparent pixels (soft edges, glows, drop shadows, smoke, faded backgrounds) print as a cloudy haze or a box
- Make glows and shadows solid, or turn fades into halftone dots
- Check the edges on a dark background in Photoshop: a white halo around the design will show on a dark shirt
- Lines at least about 0.5 mm. The largest standard print is about 11.7 x 16.5 inches

**Embroidery**

We embroider in house. A machine stitches the design from a stitch file, so the art must be simple enough to sew.

- Bold, simple shapes. No gradients, photos, thin outlines or tiny detail
- Text at least 0.25 inch tall. Small text on caps rarely works; say so early
- Left chest is about 3.5 to 4 inches wide. Bigger sizes are priced in bands by size and stitch count, up to a full back. Over 25,000 stitches, ask June
- A design over 11 inches needs a jumbo hoop (+50%). Puff (3D foam) is $4.50 a piece
- Use the fewest thread colors the design needs. Match colors to [owner to fill in: the thread color chart we match to]
- Digitizing (making the stitch file) is a one-time fee: $30 up to 15,000 stitches, plus $5 per 1,000 more. It is waived if the customer has a usable stitch file (DST, PES, EXP, JEF, VP3, XXX or EMB). June arranges the digitizing; you supply clean, simplified art at the real size

**Patches, vinyl and puff print**

- Minimum size and quantity: [owner to fill in: minimum size and quantity for patches, vinyl and puff print]
- Color limits: [owner to fill in: color limits for patches, vinyl and puff print]
- Which garments each works on: [owner to fill in: which garments take patches, vinyl and puff print]

**Before you submit any file**

- At the real print size: big enough, sharp, spelled right
- Matches the quote: method, colors, size and placement
- Not a logo, character or brand the customer does not own. Those go to June`,
    }],
    practice: [
      { key: 'signoff:art', type: 'signoff', minutes: 5,
        title: 'Prepares print-ready art correctly', hint: 'June checks a few of your files: vectors, color count, size at print, transparent background, no semi-transparent pixels.' },
    ],
    quiz: { key: 'design', title: 'Artwork quiz: print-ready files and proofs', minutes: 10, questions: null },
    buffer: 7,
  },

  /* ── 4 ── */
  {
    key: 'd4', icon: '🪧', title: 'Signs and banners',
    goal: 'Make sign and banner files at the right size, resolution and layout for how each one is made.',
    lessons: [{
      id: 'd4-signs', article: A.signs, minutes: 25, tags: 'signs, banners, signs365, yard signs, dpi, cmyk, bleed, safe zone, grommets, pole pockets, cutouts, canvas, magnets',
      goals: ['Pick the right resolution for a sign\'s size and viewing distance', 'Keep text clear of trims, hems and grommets', 'Know the banner finishing rules'],
      images: [{ src: '/assets/images/work/custom-printed-banner.jpg', alt: 'A custom printed banner' }],
      tryIt: [{ label: 'Signs on jtees.net', href: 'https://www.jtees.net/services/banners-signs.html' }],
      body:
`Signs and banners are printed for us by Signs365, a trade printer, from the files we send. They are big, they are seen from a distance, and they are cut and finished after printing, so the file rules are different from shirts.

**What we sell**

- **Yard signs and rigid signs:** stock sizes 18x12, 24x18, 36x24, 48x36 and 96x48 inches (coroplast, foamcore, PVC, aluminum and more)
- **Vinyl banners:** whole feet, short side up to 5 ft, long side up to 30 ft
- **Window, wall, floor and vehicle graphics:** 6 to 120 inches a side, short side up to 54
- **Magnets:** vehicle magnets in stock sizes; custom magnets 2 to 48 inches
- **Photo panels and stretched canvas:** for photos and wall art
- **Big Head Cutouts:** a face cut to shape on a stick

**Resolution at size**

A sign is seen from further away than a shirt, so it needs fewer pixels per inch, but at a much bigger size:

- Banners: at least 100 dpi at full size
- Yard, rigid, window, wall, vehicle and magnet signs: 150 dpi at full size
- Photo panels and canvas: 200 dpi, because people stand close to them

A 6 ft banner at 100 dpi is 7200 pixels wide. A logo from a website will not stretch that far: ask for a vector, or redraw it.

**Color, fonts and files**

- Design in **CMYK**. Bright screen colors (RGB) can print duller; check anything neon or electric blue with June
- Fonts converted to outlines
- Vector where you can. Photos at the dpi above
- Send the print file at full size: [owner to fill in: the file type and settings we send to Signs365, and who uploads it]

**Bleed and safe zone**

Signs are cut after printing, and the cut can move slightly:

- **Bleed:** extend the background past the cut line so no white edge shows. [owner to fill in: the bleed Signs365 wants for each sign type]
- **Safe zone:** keep text and logos well inside the cut line, about an inch on a banner, so hems and grommets never touch them

**Banners: grommets, pockets and rope**

- Grommets and heat-welded edges are included. Standard is every 2 to 3 ft along the top and bottom; corners always get one
- Pole pockets (1 to 4 inches) need the edges left unwelded, and never go with rope
- Rope goes in welded edges with no grommets, on the top or bottom only
- Wind slits suit banners hung outside in the wind, over 24x24 inches
- Keep important art out of the pocket and grommet areas

**Cutouts and canvas**

- Big Head Cutouts: a clear, front-facing photo. The cut line follows the head, plus about an inch for the cut, so leave space around it
- Stretched canvas wraps 3 inches around the frame on every side: nothing important in that wrap`,
    }],
    practice: [],
    quiz: {
      key: 'design-4', title: 'Module 4 quiz: signs and banners', minutes: 10,
      questions: [
        { id: 'who', q: 'Who prints our signs and banners?',
          choices: ['Our screen press', 'Signs365, a trade printer, from our files', 'The customer', 'Our DTF printer'],
          answer: 1, article: A.signs, why: 'Signs365 prints them from the files we send.' },
        { id: 'banner-dpi', q: 'What resolution does a vinyl banner need at full size?',
          choices: ['72 dpi', 'At least 100 dpi', '600 dpi', 'Any'],
          answer: 1, article: A.signs, why: 'Banners are seen from a distance: at least 100 dpi at full size.' },
        { id: 'yard-dpi', q: 'A 24x18 yard sign needs…',
          choices: ['150 dpi at full size', '50 dpi', '300 dpi at 2 inches', 'Nothing special'],
          answer: 0, article: A.signs, why: 'Yard, rigid, window, wall, vehicle and magnet signs: 150 dpi at full size.' },
        { id: 'canvas-dpi', q: 'Why do photo panels and canvas need 200 dpi?',
          choices: ['They are bigger', 'People stand close to them', 'They are printed on shirts', 'They do not'],
          answer: 1, article: A.signs, why: 'Viewed close up, they need more detail.' },
        { id: 'width', q: 'A 6 ft banner at 100 dpi is how many pixels wide?',
          choices: ['600', '7200', '72', '1200'],
          answer: 1, article: A.signs, why: '6 ft = 72 inches; 72 x 100 = 7200 pixels.' },
        { id: 'cmyk', q: 'Which color mode do you design signs in?',
          choices: ['RGB', 'CMYK', 'Grayscale only', 'It does not matter'],
          answer: 1, article: A.signs, why: 'Design in CMYK; bright RGB colors can print duller.' },
        { id: 'bleed', q: 'What is bleed for?',
          choices: ['Extra artwork past the cut line, so no white edge shows', 'A red border', 'Space for the price', 'The back of the sign'],
          answer: 0, article: A.signs, why: 'The cut can move slightly; bleed hides it.' },
        { id: 'safe', q: 'Where does the text go on a banner?',
          choices: ['Right to the edge', 'Well inside the cut line, clear of hems and grommets', 'In the pole pocket', 'Anywhere'],
          answer: 1, article: A.signs, why: 'Keep text in the safe zone, about an inch in on a banner.' },
        { id: 'rope', q: 'May a banner have rope and pole pockets together?',
          choices: ['Yes', 'No, never both', 'Only on 3 ft banners', 'Only with grommets'],
          answer: 1, article: A.signs, why: 'Rope and pole pockets never go on the same banner.' },
        { id: 'canvas', q: 'On stretched canvas, what goes in the 3 inches that wrap round the frame?',
          choices: ['The main text', 'Nothing important', 'The logo', 'The date'],
          answer: 1, article: A.signs, why: 'The wrap goes round the sides; keep important art off it.' },
      ],
    },
    buffer: 6,
  },

  /* ── 5 ── */
  {
    key: 'd5', icon: '🖌️', title: 'Photoshop and Illustrator',
    goal: 'Turn what customers send into clean files: redraw, trace, separate, clean edges and export.',
    lessons: [{
      id: 'd5-adobe', article: A.adobe, minutes: 25, tags: 'photoshop, illustrator, redraw, image trace, vectorize, separations, spot colors, defringe, transparent, export, outlines, canva',
      goals: ['Decide between tracing and redrawing a logo', 'Clean a transparent PNG so no haze prints', 'Export the right file for each method'],
      images: [{ src: '/assets/images/work/juneteenth-graphic-design.jpg', alt: 'A finished shirt design' }],
      body:
`Photoshop and Illustrator are your main tools. Illustrator is for vectors (logos, text, screen print art); Photoshop is for pixels (photos, DTF art, mockups, web images). Accounts: [owner to fill in: which Adobe and Creative Fabrica accounts the designer uses, and where mockup templates and fonts are kept]

**Redrawing a blurry logo**

Customers often send a logo from a website or a screenshot. Enlarging it does not add detail; it only makes the blur bigger.

- First ask (through sales) for the original: AI, EPS, SVG or PDF from whoever made it
- Simple logo (a few flat shapes and a font): redraw it in Illustrator. Place the image, lock it, trace over it with the Pen and shape tools, and find the font (WhatTheFont helps) or a close match
- Image Trace (Illustrator) is fine for simple, high-contrast art: then reduce the colors, delete stray specks, and fix any wobbly curves and letters by hand
- Redrawing is the $30 setup fee. Tell sales before you start

**Separations for screen print**

- One spot color swatch per ink, named for the ink. Fill every shape with one of them, nothing else
- Delete unused swatches, expand strokes and appearances, and outline the type
- Check the color count against the quote. If the art needs more inks than the quote, tell sales
- Leave the white base to June unless she asks: it is made from the design at the press

**Clean edges in Photoshop**

For DTF and anything on a transparent background:

- Remove the background (Select Subject, or Remove Background), then zoom in to 200% and check the edges
- Put a solid black layer underneath, then a white one, to see halos and leftover background
- Make edges fully solid: Layer, Matting, Defringe (1 to 2 px) for a white fringe. To remove every semi-transparent pixel, Ctrl/Cmd-click the layer thumbnail, then Select, Modify, Contract 1 px and fill the selection solid on a new layer
- Delete stray specks with the eraser at 100% hardness

**Size and resolution**

- Set the document to the real print size in inches before you start: Image, Image Size, Resample off, 300 dpi
- If the pixels are too few for 300 dpi at that size, the file is too small. Redraw it, or ask for a better one. Do not just resample it up and call it done

**Exporting**

- **Screen print:** AI or PDF with spot colors and outlined text
- **DTF:** PNG, transparent, 300 dpi at print size, RGB
- **Embroidery:** a clean PNG or vector at the real size, for digitizing
- **Signs:** full size, CMYK, at the sign's dpi
- **Proofs and web:** JPG or PNG (see module 7 and module 8)

Name files so June knows what they are: "4F2K-front-navy-gold-11in.ai", not "final final 2.ai".

**Canva**

We use Canva only for Etsy downloads (module 8). Customer orders are made in Illustrator and Photoshop.`,
    }],
    practice: [],
    quiz: {
      key: 'design-5', title: 'Module 5 quiz: Photoshop and Illustrator', minutes: 10,
      questions: [
        { id: 'which', q: 'Which tool for a screen print logo?',
          choices: ['Photoshop', 'Illustrator', 'Canva', 'Paint'],
          answer: 1, article: A.adobe, why: 'Logos, text and screen print art are vectors: Illustrator.' },
        { id: 'enlarge', q: 'A customer\'s logo is 300 pixels wide. You need it 12 inches wide. Enlarging it in Photoshop…',
          choices: ['Fixes it', 'Only makes the blur bigger', 'Makes it a vector', 'Is what June wants'],
          answer: 1, article: A.adobe, why: 'Enlarging adds no detail. Ask for the original or redraw it.' },
        { id: 'first', q: 'What do you ask for first when a logo is blurry?',
          choices: ['A screenshot', 'The original AI, EPS, SVG or PDF from whoever made it', 'A photo of a shirt', 'Nothing'],
          answer: 1, article: A.adobe, why: 'The original vector is always best.' },
        { id: 'trace', q: 'After Image Trace, you…',
          choices: ['Export straight away', 'Reduce colors, delete specks and fix wobbly curves and letters by hand', 'Add a glow', 'Rasterize it'],
          answer: 1, article: A.adobe, why: 'Tracing always needs hand cleanup.' },
        { id: 'swatch', q: 'Screen print separations: each ink is…',
          choices: ['A CMYK mix', 'One named spot color swatch', 'A gradient', 'A layer effect'],
          answer: 1, article: A.adobe, why: 'One spot color swatch per ink, named for the ink.' },
        { id: 'moreinks', q: 'The art needs 4 inks but the quote has 2. You…',
          choices: ['Use 4 anyway', 'Tell sales', 'Drop two colors without asking', 'Make it DTF yourself'],
          answer: 1, article: A.adobe, why: 'Color count changes the price: tell sales.' },
        { id: 'halo', q: 'How do you spot a white halo on a transparent PNG?',
          choices: ['Look at it on white', 'Put a solid black layer underneath and zoom in', 'Print it', 'You cannot'],
          answer: 1, article: A.adobe, why: 'A halo hides on white and shows on black.' },
        { id: 'dpi', q: 'At Image Size, Resample off, the design is 140 dpi at 11 inches. It is…',
          choices: ['Fine', 'Too small: redraw it or ask for a better file', 'Too big', 'Ready for DTF'],
          answer: 1, article: A.adobe, why: 'We need 300 dpi at the print size.' },
        { id: 'dtfexport', q: 'A DTF file is exported as…',
          choices: ['JPG with white background', 'Transparent PNG at 300 dpi at print size', 'A PDF with spot colors', 'A GIF'],
          answer: 1, article: A.adobe, why: 'DTF needs a transparent PNG at 300 dpi.' },
        { id: 'name', q: 'Which file name is best?',
          choices: ['final final 2.ai', '4F2K-front-navy-gold-11in.ai', 'logo.ai', 'untitled.ai'],
          answer: 1, article: A.adobe, why: 'Job, place, inks and size: June knows what it is at a glance.' },
      ],
    },
    buffer: 6,
  },

  /* ── 6 ── */
  {
    key: 'd6', icon: '🤖', title: 'AI: when to use it, and cleaning it up',
    goal: 'Use AI where it saves time, never where it causes problems, and clean everything it makes before it prints.',
    lessons: [{
      id: 'd6-ai-when', article: A.aiWhen, minutes: 20, tags: 'ai, chatgpt, firefly, generative fill, ai designer, vectorizer, copyright, when to use ai, rules',
      goals: ['Name the jobs AI is good for and the ones it must never do', 'Pick the right AI tool for a task', 'Know why AI logos are a problem'],
      body:
`AI image tools can save you hours. They can also hand a customer art with garbled letters, a stolen style, or a logo nobody can own. The rule: **AI makes drafts; you make the file.** Read the Playbook's "AI rules" too; everything in it applies here.

**Good uses**

- Ideas and rough concepts to show a direction ("three styles for a 5K shirt")
- Backgrounds, textures and scenes for mockups, website images and posts
- Extending or fixing a photo: removing a stray object, widening a background (Photoshop Generative Fill)
- Upscaling a photo for a sign or canvas, then checking it at full size
- A starting point for an illustration that you then redraw or clean up

**Never use AI for**

- **Logos.** Art made only by AI cannot be copyrighted in the US (US Copyright Office, January 2025). A business that pays us for a logo needs to own it. Draw logos yourself
- **Text and lettering.** AI misspells and invents letters. Set every word in a real font yourself
- **Brands, teams, characters and celebrities**, or "in the style of" a named artist. Never type them into a prompt
- **Real people.** Never make a customer, a child or a famous person with AI, and never a fake customer or review
- **Customer details.** Never paste a customer's name, email, phone, address or order into any AI tool

**Which tool for what**

- **ChatGPT (images):** concepts and flat illustrations from a description. Ask for "flat vector style, solid colors, no gradients, no shadows, plain white background"; the Playbook has ready prompts ("Print-ready design idea")
- **Photoshop Generative Fill and Firefly:** editing photos and mockups, extending backgrounds, removing objects. Firefly is trained on licensed images, so it is the safer choice for anything we publish
- **Our website's AI designer:** customers make designs with it on jtees.net. You will mostly be fixing what it made (next lesson)
- **Vectorizer.ai:** turns clean raster art into a vector. Good for AI concepts and simple logos; always clean the result by hand
- Which AI accounts the shop pays for: [owner to fill in: which AI tools and accounts the shop pays for, and which the designer may use]

**Labels and honesty**

If a post or website image shows a realistic scene or person made by AI, turn on the platform's AI label when it asks (Instagram and Facebook show "AI info"; TikTok requires a label). Never pass an AI image off as a photo of a real order.`,
    }, {
      id: 'd6-ai-clean', article: A.aiClean, minutes: 20, tags: 'ai cleanup, garbled text, halo, semi-transparent, backdrop, specks, upscale, vectorize, ai designer, customer designs',
      goals: ['Check AI output against the cleanup list', 'Fix a customer\'s AI design from the website', 'Turn an AI concept into a clean vector'],
      images: [{ src: '/assets/images/work/design-studio-live.jpg', alt: 'The online design studio on jtees.net' }],
      tryIt: [{ label: 'The online designer', href: 'https://design.jtees.net/editor.php?product_base=14' }],
      body:
`Nothing an AI tool makes goes to print or to a customer as it came out. Every image gets the same checks.

**The cleanup checklist**

Zoom to 100% at the real print size, on a black and a white background:

- **Text:** every letter right? Retype all words in a real font. Never keep AI lettering
- **Background leftovers:** a pale box, a blob, smoke or a color panel behind the design. AI tools often paint a backdrop even when asked for none
- **Halo:** a thin white or gray edge that shows on dark shirts
- **Semi-transparent pixels:** soft or faded areas. On DTF they print as a haze; make them solid or remove them
- **Washed-out color:** fills that look pastel are often partly see-through. Make them fully solid
- **Specks:** tiny scattered dots that will not print cleanly. Delete them
- **Anatomy and objects:** extra fingers, melted shapes, impossible details. Fix or redraw
- **Size:** enough pixels for 300 dpi at the print size. If not, upscale and check again, or redraw it as a vector
- **Color count:** for screen print, reduce to the inks on the quote

**Customers' AI designs from the website**

Customers can make designs with the AI designer on jtees.net. The site already removes the background, cleans the white halo, and enlarges small images after payment, but it is not perfect. When one of these orders reaches you:

- Run the checklist above on the print file, especially halos on dark garments and faint backgrounds
- If letters came out wrong or the design has an obvious flaw, do not fix it silently: send the customer a proof showing the change, and get approval in writing
- If it looks like a brand, team or character the customer does not own, stop and tell June

**Vectorizing AI art**

For screen print or anything that must scale:

1. Remove the background first, and fix the text and the obvious flaws in Photoshop
2. Run it through Vectorizer.ai, or Image Trace in Illustrator
3. In Illustrator: reduce to the inks you need, delete specks, smooth the curves, and replace any text with a real font

**Upscaling**

Upscaling guesses at detail; it can invent texture and soften edges. Use it for photos and textures, check the result at full size, and redraw logos and text instead.

**When AI is not worth it**

If you have spent 20 minutes fixing what AI made, stop. Draw it yourself, or ask June. AI is meant to save time, not cost it.`,
    }],
    practice: [
      { key: 'signoff:ai-cleanup', type: 'signoff', minutes: 5,
        title: 'Cleans up AI art before it prints', hint: 'Show June one AI image before and after your cleanup: real text, no halo, no haze, no specks, the right size.' },
    ],
    quiz: {
      key: 'design-6', title: 'Module 6 quiz: AI, when to use it and how to clean it up', minutes: 10,
      questions: [
        { id: 'logo', q: 'A customer wants a new logo for their business. May you make it with AI?',
          choices: ['Yes, it is faster', 'No. AI-only art cannot be copyrighted, so they could not own it. Draw it yourself', 'Only with ChatGPT', 'Only if they ask'],
          answer: 1, article: A.aiWhen, why: 'A business needs to own its logo; AI-only art cannot be copyrighted.' },
        { id: 'good', q: 'Which is a good use of AI?',
          choices: ['The words on a shirt', 'A background scene for a mockup or post', 'A team\'s logo', 'A photo of a customer'],
          answer: 1, article: A.aiWhen, why: 'Backgrounds, scenes and concepts are good uses.' },
        { id: 'brand', q: 'May you type "Chicago Bulls style" into a prompt?',
          choices: ['Yes', 'No. Never brands, teams, characters or named artists', 'Only for kids\' shirts', 'Only in Firefly'],
          answer: 1, article: A.aiWhen, why: 'Never put brands, teams, characters or named artists in a prompt.' },
        { id: 'firefly', q: 'Which tool is the safer choice for editing an image we will publish?',
          choices: ['Any free site', 'Photoshop Generative Fill or Firefly', 'A screenshot', 'None'],
          answer: 1, article: A.aiWhen, why: 'Firefly is trained on licensed images.' },
        { id: 'label', q: 'A post uses a realistic AI-made scene. You…',
          choices: ['Hide that it is AI', 'Turn on the platform\'s AI label when it asks', 'Call it a real photo', 'Do not post it ever'],
          answer: 1, article: A.aiWhen, why: 'Label realistic AI images; never pass them off as real orders.' },
        { id: 'text', q: 'AI made a nice design with the words "Fmaily Reunoin". You…',
          choices: ['Print it', 'Retype every word in a real font', 'Upscale it', 'Ask AI again until it is right'],
          answer: 1, article: A.aiClean, why: 'Never keep AI lettering: retype all words in a real font.' },
        { id: 'black', q: 'How do you find a halo on an AI cutout?',
          choices: ['View it on white', 'View it on a black background at 100%', 'Print it', 'Ask the customer'],
          answer: 1, article: A.aiClean, why: 'Halos hide on white and show on black.' },
        { id: 'pastel', q: 'AI fills look washed-out and pastel. Most likely they are…',
          choices: ['The right color', 'Partly see-through: make them fully solid', 'Too big', 'A Pantone'],
          answer: 1, article: A.aiClean, why: 'Pastel AI fills are often semi-transparent.' },
        { id: 'customer', q: 'A customer\'s AI design from the website has a misspelled word. You…',
          choices: ['Fix it quietly and print', 'Send a proof showing the fix and get written approval', 'Print as is', 'Cancel the order'],
          answer: 1, article: A.aiClean, why: 'Never change a customer\'s design silently; proof it and get approval.' },
        { id: 'stop', q: 'You have spent 20 minutes fixing an AI image. You…',
          choices: ['Keep going all day', 'Stop, and draw it yourself or ask June', 'Send it as is', 'Try ten more prompts'],
          answer: 1, article: A.aiClean, why: 'AI is meant to save time, not cost it.' },
      ],
    },
    buffer: 7,
  },

  /* ── 7 ── */
  {
    key: 'd7', icon: '✅', title: 'Proofs that get approved',
    goal: 'Make proofs a customer understands at a glance, send them from the job, and never print without written approval.',
    lessons: [{
      id: 'd7-proofs', article: A.proofs, minutes: 20, tags: 'proof, mockup, placement, print size, approval, written approval, revisions, design pop, upload a proof',
      goals: ['Make a proof that shows size, placement and colors', 'Send it from the job page', 'Handle changes and approval the right way'],
      images: [{ src: '/assets/images/work/full-color-team-logo-print.jpg', alt: 'A team logo print, as approved on its proof' }],
      body:
`A proof is a picture of exactly what we will print. The customer checks it and approves it in writing; then June approves your final files. A good proof gets a yes the first time.

**What a proof shows**

- The design on the garment, in the garment color they ordered
- Every print place on the order (front, back, sleeve) on the same proof
- The print size in inches and the placement, written on it: "Front, 11 in wide, 3 in below the collar"
- The ink or thread colors on the quote. More colors change the price: ask June first
- For signs: the full layout at its size, with the finishing (grommets, pockets)

Save it as a JPG, PNG or PDF under 20 MB.

**Check before you send**

- Spelling, letter by letter, especially names, numbers and dates. Read it out loud
- Colors, sizes and places match the "What to make" card
- The file behind it is print-ready: vector or 300 dpi, transparent background for DTF

**Sending it**

1. On the job page, **Proofs**, **Upload a proof**
2. Press **Send this proof**. The message is written for you; make it personal, then pick email or text
3. While you are in training, it goes to June first. That is normal

**Changes and approval**

- Changes: make them, upload a new version, and send it again. Never change an approved design quietly
- Vague feedback ("make it pop"): send two clear options instead of guessing (Playbook /designpop)
- **Approval must be in writing**: a reply to the email, a text or a chat that says approved. "Looks good" on a call is not approval. June ticks the job approved once it is logged
- If the customer approves a proof that has a mistake in it, point out the mistake, send a corrected proof, and get approval again. We print exactly what was approved
- No reply? Chase it like missing art (module 2)`,
    }],
    practice: [
      { key: 'do:proof', type: 'do', fact: 'proofs', need: 3, minutes: 10, needs: 'proofs',
        title: 'Upload three proofs', hint: 'From job pages. June checks each one before the customer sees it.' },
    ],
    quiz: {
      key: 'design-7', title: 'Module 7 quiz: proofs', minutes: 10,
      questions: [
        { id: 'garment', q: 'The order is navy hoodies. The proof shows the design on…',
          choices: ['A white tee', 'A navy hoodie', 'No garment', 'Any color'],
          answer: 1, article: A.proofs, why: 'Show it on the garment and color they ordered.' },
        { id: 'size', q: 'What must be written on the proof?',
          choices: ['The price', 'The print size in inches and the placement', 'The customer\'s phone', 'Nothing'],
          answer: 1, article: A.proofs, why: 'Size and placement, e.g. "Front, 11 in wide, 3 in below the collar".' },
        { id: 'places', q: 'The order prints front and back. The proof…',
          choices: ['Shows the front only', 'Shows every print place', 'Shows the back only', 'Is two separate emails a week apart'],
          answer: 1, article: A.proofs, why: 'Every print place on the order goes on the proof.' },
        { id: 'format', q: 'Which file types can a proof be?',
          choices: ['JPG, PNG or PDF', 'AI only', 'DST', 'PSD'],
          answer: 0, article: A.proofs, why: 'JPG, PNG or PDF under 20 MB.' },
        { id: 'spell', q: 'The best way to check spelling on a proof?',
          choices: ['Skim it', 'Letter by letter, reading names, numbers and dates out loud', 'Trust the customer', 'Spellcheck only'],
          answer: 1, article: A.proofs, why: 'Names, numbers and dates are where mistakes hide.' },
        { id: 'send', q: 'Where do you send a proof from?',
          choices: ['Your own email', 'The job page: Proofs, Upload a proof, Send this proof', 'Team chat', 'Instagram'],
          answer: 1, article: A.proofs, why: 'From the job page, so there is a record.' },
        { id: 'call', q: 'The customer says "looks good" on a phone call. Is it approved?',
          choices: ['Yes', 'No: approval must be in writing', 'Only if June heard it', 'After a day'],
          answer: 1, article: A.proofs, why: 'Approval is in writing: an email, text or chat reply.' },
        { id: 'pop', q: '"Can you make it pop more?" You…',
          choices: ['Guess and resend', 'Send two clear options', 'Say no', 'Add glitter ink'],
          answer: 1, article: A.proofs, why: 'Vague feedback gets two options (/designpop).' },
        { id: 'quiet', q: 'After approval, you spot a better font. You…',
          choices: ['Swap it quietly', 'Leave it, or send a new proof and get approval again', 'Ask the printer', 'Change it on the final file only'],
          answer: 1, article: A.proofs, why: 'Never change an approved design quietly.' },
        { id: 'colors', q: 'You think a third ink would look better than the two on the quote. You…',
          choices: ['Add it', 'Ask June first: it changes the price', 'Tell the customer it is free', 'Use DTF'],
          answer: 1, article: A.proofs, why: 'More colors change the price.' },
      ],
    },
    buffer: 6,
  },

  /* ── 8 ── */
  {
    key: 'd8', icon: '🖼️', title: 'Site, blog and Etsy images',
    goal: 'Prepare images for jtees.net, the blog and Etsy at the right size, weight and name, with alt text.',
    lessons: [{
      id: 'd8-web', article: A.web, minutes: 25, tags: 'website images, blog images, webp, file size, alt text, file names, mockups, product photos, etsy, canva, digital downloads',
      goals: ['Export a web image at the right size and file weight', 'Write a file name and alt text', 'Make an Etsy download in Canva'],
      images: [{ src: '/assets/images/work/ghost-graphic-tee.jpg', alt: 'A product photo on a clean background' }],
      tryIt: [{ label: 'jtees.net', href: 'https://www.jtees.net' }],
      body:
`Images on jtees.net and the blog are often a customer's first look at our work. They have to look good and load fast on a phone. You prepare them; June or the developer puts them on the site.

**Product and mockup images**

- Square (1:1), at least 1200 pixels a side, the product centered with space around it
- A clean, consistent background: white or light gray for products, so the shop page looks like one shop
- Show the real colors. If a mockup's garment color is off, fix it to match the real garment
- Mockups: Photoshop smart-object templates. Place the design in the smart object, save, and the template bends it onto the shirt. Use only templates the shop has a license for

**Blog images**

- Our own photos ("June's Tees Website Photos" folder) or licensed stock. Never images copied from Google or other websites
- 1200 pixels wide, JPG or WebP, **under 300 KB**. In Photoshop: Export As, set the width, lower the quality until it is under 300 KB and still looks sharp
- Save finished images to the "2 – Images" folder of the blog Drive
- Customer photos only with their written permission. No children's faces without a parent's OK

**File names and alt text**

- File names in plain words, lowercase, with hyphens: "team-shirts-chicago.jpg", not "IMG_4432.jpg". Search engines read them
- **Alt text** for every image: one plain sentence, under 125 characters, saying what is in it: "Navy team hoodies with a gold soccer ball print". No "image of", and no list of keywords

**Etsy downloads in Canva**

We also sell digital downloads on Etsy, and these are the one place we use Canva.

- Build each download in Canva at exactly the size the listing promises (for example US Letter, 8.5 x 11 in)
- Export at full quality, in the file types the listing says, and check every page before uploading
- Listing photos: a mockup of the download in use, plus a clear one showing what is included
- Only fonts and graphics Canva allows for products sold to others (Canva's free and Pro content is fine; nothing from outside Canva unless the shop owns its license)
- Our process: [owner to fill in: the Etsy shop, which downloads we sell, the file types and sizes each includes, and who publishes the listing]

**Art for the online designer**

Clipart and ready-made designs for the designer on jtees.net: transparent PNG, no longer than 3300 pixels on its longest side (bigger files show as a black box on iPhones). Send them to June to add.`,
    }],
    practice: [],
    quiz: {
      key: 'design-8', title: 'Module 8 quiz: site, blog and Etsy images', minutes: 10,
      questions: [
        { id: 'shape', q: 'A product image for the shop page is…',
          choices: ['Any shape', 'Square, at least 1200 px, on a clean background', 'A tall phone photo', 'A screenshot'],
          answer: 1, article: A.web, why: 'Square, centered, consistent background.' },
        { id: 'blogsize', q: 'A blog image should be…',
          choices: ['5000 px wide and 4 MB', '1200 px wide, JPG or WebP, under 300 KB', 'A PNG of any size', 'A PDF'],
          answer: 1, article: A.web, why: 'Big enough to look good, small enough to load fast.' },
        { id: 'source', q: 'Which image may go on the blog?',
          choices: ['One from Google Images', 'Our own photo or licensed stock', 'Another shop\'s photo', 'A customer\'s Facebook photo of their child'],
          answer: 1, article: A.web, why: 'Our own photos or licensed stock only.' },
        { id: 'name', q: 'Which file name is right for the web?',
          choices: ['IMG_4432.jpg', 'team-shirts-chicago.jpg', 'Final Image (2).JPG', 'photo.jpg'],
          answer: 1, article: A.web, why: 'Plain words, lowercase, hyphens.' },
        { id: 'alt', q: 'Which is good alt text?',
          choices: ['"image"', '"Navy team hoodies with a gold soccer ball print"', '"custom shirts chicago cheap best shirts tees"', 'Leave it blank'],
          answer: 1, article: A.web, why: 'One plain sentence saying what is in the image.' },
        { id: 'customer', q: 'May you use a customer\'s photo of their order on the blog?',
          choices: ['Yes, always', 'Only with their written permission', 'Only if it is blurry', 'Only on Fridays'],
          answer: 1, article: A.web, why: 'Customer photos need written permission.' },
        { id: 'mockup', q: 'The garment in a mockup looks a different blue from the real one. You…',
          choices: ['Leave it', 'Adjust it to match the real garment', 'Use a different product', 'Add a filter'],
          answer: 1, article: A.web, why: 'Show the real colors.' },
        { id: 'canva', q: 'What do we use Canva for?',
          choices: ['Customer screen print files', 'Etsy downloads', 'Embroidery', 'Signs'],
          answer: 1, article: A.web, why: 'Canva is for Etsy downloads; orders are made in Illustrator and Photoshop.' },
        { id: 'etsyfonts', q: 'For an Etsy download you sell, which fonts and graphics may you use?',
          choices: ['Anything you find online', 'Canva content allowed for products, or ones the shop owns a license for', 'Any font on your computer', 'A team logo'],
          answer: 1, article: A.web, why: 'Only content licensed for products sold to others.' },
        { id: 'clipart', q: 'Clipart for the online designer must be no longer than…',
          choices: ['3300 px on its longest side', '10,000 px', '500 px', 'There is no limit'],
          answer: 0, article: A.web, why: 'Bigger files show as a black box on iPhones.' },
      ],
    },
    buffer: 6,
  },

  /* ── 9 ── */
  {
    key: 'd9', icon: '📣', title: 'Social media graphics',
    goal: 'Make posts that show our work, fit each platform, and follow the rules on permission and AI.',
    lessons: [{
      id: 'd9-social', article: A.social, minutes: 25, tags: 'social media, instagram, facebook, tiktok, sizes, carousel, content pillars, cos creator studio, captions, permission, ai label',
      goals: ['Make a graphic at the right size for each platform', 'Plan a week of posts from our content mix', 'Build and check a post in COS'],
      images: [{ src: '/assets/images/work/youth-team-shirts.jpg', alt: 'A youth team in their shirts: the kind of photo that makes a good post' }],
      body:
`You make the images: single posts, carousels and graphics. The Content person makes the videos. You work from the same plan, so share what you are making in your team channel.

**Sizes**

- **Instagram and Facebook feed:** 1080 x 1350 (4:5, portrait). It takes up the most screen
- **Stories and Reels covers, TikTok:** 1080 x 1920 (9:16). Keep text out of the top and bottom 250 pixels, where the app's buttons sit
- **Link previews and blog shares:** 1200 x 630
- Keep the main subject and any text in the middle; profile grids crop the edges
- Export JPG or PNG, sRGB

**What to post**

A good week mixes these:

- **Our work:** finished orders, close-ups of the print or stitching, a pile of boxed shirts
- **How it is made:** the press, the embroidery machine, a banner being unrolled (photos from June)
- **Tips:** what file to send, screen print vs DTF, how to pick a shirt color
- **Customers:** a review or a customer photo (with permission)
- **Seasonal and offers:** back to school, team season, holidays. Only offers June has approved

Aim for 3 or more feed posts a week. One clear message per post; carousels for steps and before-and-afters.

**Building posts in COS**

We plan and schedule in COS Creator Studio. Sign in: [owner to fill in: how the designer signs in to COS Creator Studio]

1. **Media Library:** upload your graphics and job photos, each with a short description (COS uses it to match media to posts)
2. **Create a Content Plan:** pick the content type, the June's Tees profile and the platforms, then generate
3. Read every post before it is scheduled; fix the caption and swap in your image
4. Posts marked **Pending** wait for June's approval on the Calendar

**Captions**

- Friendly, local, proud of the work. Short: under 40 words, then about 5 hashtags
- One next step: "Get a free quote at jtees.net"
- Check names, dates, prices and spelling. Never a price or discount June has not approved

**Never post**

- A customer's photo, name or design without their written permission; children's faces without a parent's OK
- Logos the customer does not own, or anything negative about anyone
- A realistic AI image passed off as a real order. If a post uses one, turn on the platform's AI label
- Music or images we have no license for`,
    }],
    practice: [],
    quiz: {
      key: 'design-9', title: 'Module 9 quiz: social media graphics', minutes: 10,
      questions: [
        { id: 'feed', q: 'The best size for an Instagram feed post?',
          choices: ['1080 x 1350 (4:5)', '500 x 500', '1920 x 1080', '1200 x 630'],
          answer: 0, article: A.social, why: '4:5 portrait takes up the most screen.' },
        { id: 'story', q: 'Stories, Reels covers and TikTok use…',
          choices: ['1080 x 1920 (9:16)', '1080 x 1080', '1200 x 630', '851 x 315'],
          answer: 0, article: A.social, why: '9:16, full screen.' },
        { id: 'safe', q: 'On a 9:16 graphic, where do you keep text?',
          choices: ['Top and bottom edges', 'Away from the top and bottom, where app buttons sit', 'Anywhere', 'Only the corners'],
          answer: 1, article: A.social, why: 'Keep text clear of the top and bottom 250 pixels.' },
        { id: 'link', q: 'A blog share image is…',
          choices: ['1200 x 630', '1080 x 1920', '300 x 300', '4000 x 4000'],
          answer: 0, article: A.social, why: 'Link previews are 1200 x 630.' },
        { id: 'video', q: 'Who makes the videos?',
          choices: ['You', 'The Content person', 'The customer', 'Nobody'],
          answer: 1, article: A.social, why: 'You make images; Content makes videos, from the same plan.' },
        { id: 'mix', q: 'Which is a good week of posts?',
          choices: ['Seven discount posts', 'Our work, how it is made, a tip and a customer review', 'Nothing but memes', 'Only reposts'],
          answer: 1, article: A.social, why: 'A mix of work, process, tips, customers and seasonal posts.' },
        { id: 'pending', q: 'A post shows Pending on the COS calendar. It is…',
          choices: ['Broken', 'Waiting for June\'s approval', 'Already posted', 'Deleted'],
          answer: 1, article: A.social, why: 'Pending posts wait for approval.' },
        { id: 'caption', q: 'A good caption is…',
          choices: ['300 words', 'Short, with one next step like "Get a free quote at jtees.net"', 'All hashtags', 'A price June has not approved'],
          answer: 1, article: A.social, why: 'Short, friendly, one next step.' },
        { id: 'kids', q: 'A photo shows a kids\' team, faces clear. You may post it…',
          choices: ['Any time', 'Only with a parent\'s or the team\'s OK', 'If you blur the shirts', 'On TikTok only'],
          answer: 1, article: A.social, why: 'Children\'s faces need a parent\'s OK.' },
        { id: 'discount', q: 'You want to post "20% off this week". You…',
          choices: ['Post it', 'Only if June approved the offer', 'Make it 10%', 'Put it in small print'],
          answer: 1, article: A.social, why: 'Only offers June has approved.' },
      ],
    },
    buffer: 6,
  },
];

/* The final exam: new questions across the whole course, 80% to pass. */
const FINAL = {
  floating: 15,
  quiz: {
    key: 'design-final', title: 'Final exam: the Design course', minutes: 25,
    questions: null, // design-core-final.js
  },
  signoffs: [
    { key: 'signoff:handoff', type: 'signoff', minutes: 0,
      title: 'Knows when to hand a customer to June', hint: 'Discounts, refunds, logos the customer does not own, angry customers. June signs this off after seeing you do it.' },
    { key: 'signoff:ready', type: 'signoff', minutes: 0,
      title: 'Ready to send proofs on their own', hint: 'The last step. Proofs and messages go straight to customers from here. June decides when to move you up from Design training.' },
  ],
};
FINAL.quiz.questions = require('./design-core-final')(A);

/* The artwork quiz the design checklist always had: same key, so a pass
   before the course existed still counts. */
MODULES.find((m) => m.key === 'd3').quiz.questions = require('./design-core-artquiz')(A);

const PAGES = require('./design-core-pages');
for (const l of MODULES.flatMap((m) => m.lessons)) {
  if (l.pages) continue; // the shared module's lessons carry their own
  l.pages = PAGES[l.id] || [{ from: null, checks: [] }];
  l.checks = l.pages.flatMap((pg) => pg.checks);
}

module.exports = { key: 'design-core', title: 'Design', track: 'design', articles: A, glossary: GLOSSARY, modules: MODULES, final: FINAL };
