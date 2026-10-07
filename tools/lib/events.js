'use strict';

/* The selling calendar (owner, 2026-10-06: "big heads are really selling for
 * the marathon ... promote products based on events ... for the whole year.
 * These things should get priority with ads, emails and placement based on
 * the dates, sell in advance").
 *
 * Each event knows how to find its date in any year, how many days ahead to
 * start selling it (`lead`), and how many days before the event an order has
 * to be in to be made in time (`orderBy`). Everything else - the homepage
 * strip, the email, the ad text, the dashboard - reads from here, so moving a
 * date or a deadline is one edit.
 *
 * Links go only to pages that exist on jtees.net or design.jtees.net
 * (checked 2026-10-06). Products the online shop does not sell yet (mugs,
 * ornaments) are offered as "call or text us", never as a link to nothing. */

const SITE = 'https://www.jtees.net';
const DESIGN = 'https://design.jtees.net';
const LINKS = {
  bigHeads: `${SITE}/services/big-head-cutouts.html`,
  signs: `${SITE}/services/banners-signs.html`,
  decor: `${SITE}/services/event-decor.html`,
  tees: `${DESIGN}/products.php?category_id=52`,
  hoodies: `${DESIGN}/products.php?category_id=53`,
  kids: `${DESIGN}/products.php?category_id=55`,
  baby: `${DESIGN}/products.php?category_id=56`,
  totes: `${DESIGN}/products.php?category_id=58`,
  graduation: `${DESIGN}/collection.php?c=graduation`,
  reunion: `${DESIGN}/collection.php?c=family-reunion`,
  birthday: `${DESIGN}/collection.php?c=birthday`,
  sports: `${DESIGN}/collection.php?c=sports-teams`,
  church: `${DESIGN}/collection.php?c=church-groups`,
  memorial: `${DESIGN}/collection.php?c=memorial`,
  bulk: `${DESIGN}/collection.php?c=bulk-orders`,
  quote: `${SITE}/#contact`,
};
const PHONE = '(773) 849-1854';

/* ── Dates ─────────────────────────────────────────────────────────────── */

const ymd = (y, m, d) => new Date(Date.UTC(y, m - 1, d));
/** The nth weekday (0 = Sunday) of a month; n = -1 is the last. */
function nthWeekday(y, m, weekday, n) {
  if (n > 0) {
    const first = ymd(y, m, 1).getUTCDay();
    return ymd(y, m, 1 + ((weekday - first + 7) % 7) + (n - 1) * 7);
  }
  const last = ymd(y, m + 1, 0);
  return ymd(y, m, last.getUTCDate() - ((last.getUTCDay() - weekday + 7) % 7));
}
/** Western Easter Sunday (anonymous Gregorian algorithm). */
function easter(y) {
  const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4;
  const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31), day = ((h + l - 7 * m + 114) % 31) + 1;
  return ymd(y, month, day);
}
/** The Saturday on or before a date. */
const saturdayBefore = (dt) => new Date(dt.getTime() - ((dt.getUTCDay() + 1) % 7) * 86400000);

/* ── The events ────────────────────────────────────────────────────────── */

/* `when(y)` gives the date in year y. `lead`: days ahead the selling starts.
   `orderBy`: days before the date an order must be in. `email` is what goes
   to the list; `ads` is the search ad text and keywords. */
const EVENTS = [
  {
    key: 'chicago-marathon', name: 'Chicago Marathon', when: (y) => nthWeekday(y, 10, 0, 2), lead: 21, orderBy: 3,
    products: ['Big head cutouts of your runner', 'Race-day shirts with their face and name', 'Signs and banners for the course'],
    link: LINKS.bigHeads, cta: 'Order big heads',
    email: {
      subject: 'Cheer louder: big heads and race shirts for marathon Sunday',
      preview: 'Your runner, two feet tall, on the course. Order by {orderBy}.',
      headline: 'Make sure your runner sees you',
      intro: 'Marathon Sunday is {date}. Nothing gets a smile at mile 20 like their own face, two feet tall, waving at them from the crowd.',
      ps: 'Running yourself? Send us your race photo after and we will put it on a finisher shirt.',
    },
    ads: { headlines: ['Marathon Big Head Cutouts', 'Cheer Signs With Their Face', 'Chicago Race Day Shirts'],
           keywords: ['marathon big head cutout', 'chicago marathon signs', 'marathon cheer shirts', 'big head cutout chicago'] },
  },
  {
    key: 'halloween', name: 'Halloween', when: (y) => ymd(y, 10, 31), lead: 30, orderBy: 10,
    products: ['Matching family and group costume shirts', 'Kids’ Halloween tees', 'Party banners and signs'],
    link: LINKS.tees, cta: 'Design your shirts',
    email: {
      subject: 'Matching Halloween shirts for the whole crew',
      preview: 'Family, office or squad: order by {orderBy} for Halloween.',
      headline: 'One theme, everybody in it',
      intro: 'Halloween is {date}. Matching shirts are the easiest costume there is, for families, classrooms and office parties.',
      ps: 'Throwing a party? We print banners and signs too.',
    },
    ads: { headlines: ['Matching Halloween Shirts', 'Custom Group Costume Tees', 'Printed in Chicago'],
           keywords: ['matching halloween shirts', 'custom halloween shirts chicago', 'group costume shirts'] },
  },
  {
    key: 'thanksgiving', name: 'Thanksgiving & Friendsgiving', when: (y) => nthWeekday(y, 11, 4, 4), lead: 35, orderBy: 12,
    products: ['Family gathering shirts', 'Friendsgiving tees', 'Table signs and banners'],
    link: LINKS.reunion, cta: 'Make family shirts',
    email: {
      subject: 'Everyone in one picture: Thanksgiving family shirts',
      preview: 'Get the whole family matching for the photo. Order by {orderBy}.',
      headline: 'This year, the family photo matches',
      intro: 'Thanksgiving is {date}. When everyone is home, matching shirts make the picture you will keep for years.',
      ps: 'Add the year and the family name and they become a keepsake.',
    },
    ads: { headlines: ['Thanksgiving Family Shirts', 'Matching Family Tees Chicago', 'Order Before The Holiday'],
           keywords: ['thanksgiving family shirts', 'matching family shirts chicago', 'friendsgiving shirts'] },
  },
  {
    key: 'christmas', name: 'Christmas & holiday gifts', when: (y) => ymd(y, 12, 25), lead: 55, orderBy: 13,
    products: ['Matching Christmas pajama-style family shirts', 'Gifts with their photo: hoodies, totes, baby onesies', 'Holiday party shirts for the office', 'Custom mugs and ornaments (call or text us)'],
    link: LINKS.hoodies, cta: 'Make a gift',
    email: {
      subject: 'Gifts with their face on it (order by {orderBy})',
      preview: 'Photo hoodies, family Christmas shirts and office party tees.',
      headline: 'The gift nobody else can buy them',
      intro: 'Christmas is {date}. Put a photo, a name or an inside joke on a hoodie, a tote or a onesie and it is a gift made only for them.',
      ps: 'Ordering for the office party or a whole family? Ask us about group pricing.',
    },
    ads: { headlines: ['Custom Photo Gifts Chicago', 'Matching Christmas Shirts', 'Personalized Hoodies & Totes'],
           keywords: ['custom christmas shirts', 'personalized photo gifts chicago', 'matching family christmas shirts', 'custom hoodie gift'] },
  },
  {
    key: 'black-history-month', name: 'Black History Month', when: (y) => ymd(y, 2, 1), lead: 28, orderBy: 10,
    products: ['Heritage and pride tees', 'School and church program shirts', 'Event banners'],
    link: LINKS.church, cta: 'Make your shirts',
    email: {
      subject: 'Black History Month shirts for your school, church or team',
      preview: 'Programs, assemblies and celebrations: order by {orderBy}.',
      headline: 'Celebrate it together',
      intro: 'Black History Month starts {date}. Schools, churches and teams order shirts for programs, assemblies and service days, and we would be proud to print yours.',
      ps: 'June’s Tees is Black-owned and women-owned, right here in Chicago.',
    },
    ads: { headlines: ['Black History Month Shirts', 'Black-Owned Print Shop Chicago', 'School & Church Shirts'],
           keywords: ['black history month shirts', 'black history month t-shirts bulk', 'black owned custom shirts chicago'] },
  },
  {
    key: 'valentines', name: 'Valentine’s Day', when: (y) => ymd(y, 2, 14), lead: 28, orderBy: 8,
    products: ['Couples’ matching shirts', 'Photo gifts: hoodies and totes', 'Galentine’s group tees'],
    link: LINKS.hoodies, cta: 'Make a gift',
    email: {
      subject: 'A Valentine’s gift with your picture on it',
      preview: 'Couples’ shirts and photo hoodies. Order by {orderBy}.',
      headline: 'Say it on a shirt',
      intro: 'Valentine’s Day is {date}. A hoodie with your favorite photo of the two of you beats another box of chocolates.',
      ps: 'Galentine’s crew? Matching tees for the whole group.',
    },
    ads: { headlines: ['Valentine’s Photo Gifts', 'Couples Matching Shirts', 'Custom Hoodies Chicago'],
           keywords: ['valentines custom shirt', 'couples matching shirts', 'personalized valentines gift chicago'] },
  },
  {
    key: 'st-patricks', name: 'St. Patrick’s Day parade', when: (y) => saturdayBefore(ymd(y, 3, 17)), lead: 30, orderBy: 9,
    products: ['Group parade shirts', 'Bar crawl tees', 'Green team shirts'],
    link: LINKS.tees, cta: 'Design your shirts',
    email: {
      subject: 'Parade day shirts for your crew',
      preview: 'River dyeing and the parade are {date}. Order by {orderBy}.',
      headline: 'Find your group in a sea of green',
      intro: 'The river turns green and the parade steps off on {date}. Matching shirts keep your crew together and look great in every photo.',
      ps: 'Doing a bar crawl? Put the route on the back.',
    },
    ads: { headlines: ['St Patrick’s Day Group Shirts', 'Chicago Parade Tees', 'Bar Crawl Shirts'],
           keywords: ['st patricks day group shirts', 'chicago st patricks day shirts', 'bar crawl shirts custom'] },
  },
  {
    key: 'easter', name: 'Easter', when: (y) => easter(y), lead: 30, orderBy: 9,
    products: ['Family Easter shirts', 'Kids’ and baby Easter tees', 'Church group shirts'],
    link: LINKS.kids, cta: 'Make Easter shirts',
    email: {
      subject: 'Easter Sunday shirts for the little ones',
      preview: 'Kids, babies and the whole family. Order by {orderBy}.',
      headline: 'Dressed up for Easter Sunday',
      intro: 'Easter is {date}. Kids’ tees, baby onesies and family shirts with their names on them, ready for church and the egg hunt.',
      ps: 'Church groups: we print for Easter programs and choirs too.',
    },
    ads: { headlines: ['Custom Easter Shirts', 'Kids Easter Tees Chicago', 'Family Easter Shirts'],
           keywords: ['custom easter shirts', 'kids easter shirt personalized', 'family easter shirts'] },
  },
  {
    key: 'prom', name: 'Prom', when: (y) => ymd(y, 5, 1), lead: 45, orderBy: 12,
    products: ['Prom squad shirts', 'Big head cutouts for send-offs', 'Send-off banners and signs'],
    link: LINKS.graduation, cta: 'Plan the send-off',
    email: {
      subject: 'Prom send-off: big heads, banners and squad shirts',
      preview: 'Make the send-off as big as the night. Order by {orderBy}.',
      headline: 'Give them a send-off to remember',
      intro: 'Prom season peaks around {date}. Families are doing big send-offs now, with banners, big head cutouts and matching squad shirts.',
      ps: 'Send-off and graduation in the same spring? Order both now and we will schedule them together.',
    },
    ads: { headlines: ['Prom Send-Off Banners', 'Prom Big Head Cutouts', 'Prom Squad Shirts Chicago'],
           keywords: ['prom send off ideas', 'prom banner custom', 'prom big head cutout', 'prom squad shirts'] },
  },
  {
    key: 'teacher-appreciation', name: 'Teacher Appreciation Week', when: (y) => nthWeekday(y, 5, 1, 1), lead: 28, orderBy: 9,
    products: ['Staff shirts for the week', 'Thank-you totes', 'School banners'],
    link: LINKS.bulk, cta: 'Order staff shirts',
    email: {
      subject: 'Teacher Appreciation Week starts {date}',
      preview: 'Staff shirts and thank-you totes for your school. Order by {orderBy}.',
      headline: 'Say thank you they can wear',
      intro: 'Teacher Appreciation Week starts {date}. PTOs and principals order matching staff shirts and thank-you totes, and we make it easy with one design for the whole school.',
      ps: 'Tax-exempt school or PTO? Send your certificate with the order and we will take the tax off.',
    },
    ads: { headlines: ['Teacher Appreciation Shirts', 'School Staff Shirts Chicago', 'Thank You Totes Bulk'],
           keywords: ['teacher appreciation shirts', 'school staff shirts bulk', 'pto shirts chicago'] },
  },
  {
    key: 'mothers-day', name: 'Mother’s Day', when: (y) => nthWeekday(y, 5, 0, 2), lead: 28, orderBy: 9,
    products: ['Photo hoodies and tees for Mom', 'Kids’ "I love Mom" tees', 'Personalized totes'],
    link: LINKS.hoodies, cta: 'Make Mom’s gift',
    email: {
      subject: 'A Mother’s Day gift with the grandkids on it',
      preview: 'Photo hoodies, totes and kids’ tees. Order by {orderBy}.',
      headline: 'Give Mom something only you could',
      intro: 'Mother’s Day is {date}. Put the kids, the grandkids or a favorite family photo on a hoodie or a tote she will use every day.',
      ps: 'Remembering a mom this year? We make memorial shirts with care.',
    },
    ads: { headlines: ['Mother’s Day Photo Gifts', 'Custom Hoodie For Mom', 'Personalized Gifts Chicago'],
           keywords: ['mothers day custom shirt', 'mothers day photo gift', 'personalized gift for mom chicago'] },
  },
  {
    key: 'graduation', name: 'Graduation', when: (y) => ymd(y, 5, 29), lead: 60, orderBy: 14,
    products: ['Big head cutouts of the graduate', 'Graduation shirts for the whole family', 'Yard signs and banners', 'Stoles'],
    link: LINKS.graduation, cta: 'Celebrate your grad',
    email: {
      subject: 'Graduation big heads, shirts and banners: order early',
      preview: 'Ceremonies fill our calendar fast. Order by {orderBy}.',
      headline: 'They did it. Let everyone know.',
      intro: 'Graduation season is here, with most ceremonies around {date}. Big heads of the grad, family shirts and a banner for the yard make the day.',
      ps: 'Graduations book up our whole calendar. The earlier you order, the less you worry.',
    },
    ads: { headlines: ['Graduation Big Head Cutouts', 'Graduation Shirts For Family', 'Grad Banners Chicago'],
           keywords: ['graduation big head cutout', 'graduation shirts for family', 'graduation banner custom', 'graduation party chicago'] },
  },
  {
    key: 'fathers-day', name: 'Father’s Day', when: (y) => nthWeekday(y, 6, 0, 3), lead: 28, orderBy: 9,
    products: ['Photo tees and hoodies for Dad', 'Hats with his name', 'Kids’ "my dad" tees'],
    link: LINKS.tees, cta: 'Make Dad’s gift',
    email: {
      subject: 'Father’s Day: a shirt or hat made just for him',
      preview: 'Photo tees, hats and kids’ shirts. Order by {orderBy}.',
      headline: 'Better than another tie',
      intro: 'Father’s Day is {date}. A hat with his name, a tee with the kids on it, or a shirt only your family would understand.',
      ps: 'Grilling for the whole family? Matching shirts make the picture.',
    },
    ads: { headlines: ['Father’s Day Custom Shirts', 'Personalized Hats For Dad', 'Photo Gifts Chicago'],
           keywords: ['fathers day custom shirt', 'personalized hat for dad', 'fathers day photo gift'] },
  },
  {
    key: 'juneteenth', name: 'Juneteenth', when: (y) => ymd(y, 6, 19), lead: 30, orderBy: 9,
    products: ['Juneteenth tees for family and community', 'Church and block party shirts', 'Event banners'],
    link: LINKS.church, cta: 'Make your shirts',
    email: {
      subject: 'Juneteenth shirts for your family, church or block party',
      preview: 'Celebrate together on {date}. Order by {orderBy}.',
      headline: 'Freedom, celebrated together',
      intro: 'Juneteenth is {date}. Families, churches and block clubs order matching shirts and banners for their celebrations, and we would love to print yours.',
      ps: 'June’s Tees is Black-owned and women-owned, right here in Chicago.',
    },
    ads: { headlines: ['Juneteenth Shirts Chicago', 'Black-Owned Print Shop', 'Family & Church Shirts'],
           keywords: ['juneteenth shirts', 'juneteenth family shirts', 'black owned t shirt printing chicago'] },
  },
  {
    key: 'pride', name: 'Chicago Pride', when: (y) => nthWeekday(y, 6, 0, -1), lead: 30, orderBy: 9,
    products: ['Group and parade shirts', 'Business and float shirts', 'Signs for the route'],
    link: LINKS.tees, cta: 'Design your shirts',
    email: {
      subject: 'Pride Parade shirts for your group',
      preview: 'The parade is {date}. Order by {orderBy}.',
      headline: 'March together, matching',
      intro: 'Chicago’s Pride Parade is {date}. Groups, businesses and floats order shirts and signs, and we print them right here in Lakeview.',
      ps: 'Walking with your workplace? Put the company logo on the back.',
    },
    ads: { headlines: ['Pride Parade Group Shirts', 'Custom Pride Shirts Chicago', 'Printed In Lakeview'],
           keywords: ['pride parade shirts chicago', 'custom pride shirts group', 'pride float shirts'] },
  },
  {
    key: 'family-reunion', name: 'Family reunion season', when: (y) => ymd(y, 7, 11), lead: 75, orderBy: 18,
    products: ['Family reunion shirts with the family name', 'Kids’ and baby sizes', 'Banners for the picnic'],
    link: LINKS.reunion, cta: 'Make reunion shirts',
    email: {
      subject: 'Family reunion shirts: get every size in one order',
      preview: 'Babies to grandparents. Order by {orderBy} for July.',
      headline: 'Every branch of the family, one shirt',
      intro: 'Reunion season peaks in July. We print the family name, the year and the tree in every size from baby to 5XL, and we will help you collect sizes from everyone.',
      ps: 'Ordering for 50 or more? Ask about our bulk pricing.',
    },
    ads: { headlines: ['Family Reunion Shirts', 'Reunion Tees All Sizes', 'Chicago Family Reunion'],
           keywords: ['family reunion shirts', 'family reunion t shirts bulk', 'family reunion shirts chicago'] },
  },
  {
    key: 'bud-billiken', name: 'Bud Billiken Parade', when: (y) => nthWeekday(y, 8, 6, 2), lead: 35, orderBy: 10,
    products: ['Group and float shirts', 'Back-to-school shirts for kids', 'Banners for the route'],
    link: LINKS.sports, cta: 'Make parade shirts',
    email: {
      subject: 'Bud Billiken Parade shirts for your group',
      preview: 'The parade is {date}. Order by {orderBy}.',
      headline: 'Step off in style',
      intro: 'The Bud Billiken Parade is {date}. Dance teams, schools, churches and community groups order matching shirts for the route, and we would love to make yours.',
      ps: 'It is also back-to-school time: ask about first-day shirts for the kids.',
    },
    ads: { headlines: ['Bud Billiken Parade Shirts', 'Group Parade Tees Chicago', 'Dance Team Shirts'],
           keywords: ['bud billiken parade shirts', 'parade group shirts chicago', 'dance team shirts custom'] },
  },
  {
    key: 'back-to-school', name: 'Back to school', when: (y) => nthWeekday(y, 8, 1, 3), lead: 35, orderBy: 10,
    products: ['First-day shirts with their grade', 'Teacher and staff shirts', 'Spirit wear and team shirts'],
    link: LINKS.kids, cta: 'Make first-day shirts',
    email: {
      subject: 'First-day-of-school shirts (and staff shirts too)',
      preview: 'School starts around {date}. Order by {orderBy}.',
      headline: 'Their first day, in a shirt made for it',
      intro: 'School starts around {date}. First-day shirts with their name and grade, staff shirts for teachers, and spirit wear for the whole school.',
      ps: 'Schools and PTOs: send your tax-exempt certificate and we take the tax off.',
    },
    ads: { headlines: ['First Day Of School Shirts', 'School Spirit Wear Chicago', 'Teacher Staff Shirts'],
           keywords: ['first day of school shirt', 'school spirit wear custom', 'teacher shirts bulk chicago'] },
  },
  {
    key: 'homecoming', name: 'Homecoming & fall sports', when: (y) => nthWeekday(y, 9, 5, 4), lead: 35, orderBy: 10,
    products: ['Homecoming shirts', 'Team and fan shirts', 'Big heads for senior night'],
    link: LINKS.sports, cta: 'Order team shirts',
    email: {
      subject: 'Homecoming and senior night: shirts and big heads',
      preview: 'Fall sports are here. Order by {orderBy}.',
      headline: 'Pack the stands',
      intro: 'Homecoming season is around {date}. Teams, parents and fans order shirts for game day and big heads of their seniors for senior night.',
      ps: 'Booster clubs: one design, every size, one invoice.',
    },
    ads: { headlines: ['Homecoming Shirts Chicago', 'Senior Night Big Heads', 'Team Fan Shirts'],
           keywords: ['homecoming shirts custom', 'senior night big head cutout', 'team fan shirts chicago'] },
  },
  {
    key: 'breast-cancer-awareness', name: 'Breast Cancer Awareness Month', when: (y) => ymd(y, 10, 1), lead: 35, orderBy: 10,
    products: ['Pink team shirts for walks', 'Survivor and support shirts', 'Signs for the walk'],
    link: LINKS.bulk, cta: 'Order walk shirts',
    email: {
      subject: 'Walking this October? Pink team shirts',
      preview: 'Team shirts for walks and fundraisers. Order by {orderBy}.',
      headline: 'Walk together in pink',
      intro: 'Breast Cancer Awareness Month starts {date}. Walk teams, workplaces and families order matching pink shirts with their team name or their loved one’s.',
      ps: 'Raising money? Ask us about pricing for fundraisers.',
    },
    ads: { headlines: ['Breast Cancer Walk Shirts', 'Pink Team Shirts Chicago', 'Fundraiser Shirts'],
           keywords: ['breast cancer walk team shirts', 'pink team shirts', 'fundraiser shirts chicago'] },
  },
];

/* ── When to sell what ─────────────────────────────────────────────────── */

const DAY = 86400000;
const iso = (d) => d.toISOString().slice(0, 10);
const nice = (d) => d.toLocaleDateString('en-US', { timeZone: 'UTC', weekday: 'long', month: 'long', day: 'numeric' });

/** Every event's next date on or after `today` (UTC midnight), with when its
 *  selling starts and its order-by day. Soonest first. */
function upcoming(today = new Date()) {
  const t0 = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  return EVENTS.map((e) => {
    let date = e.when(today.getUTCFullYear());
    if (date.getTime() < t0) date = e.when(today.getUTCFullYear() + 1);
    const start = new Date(date.getTime() - e.lead * DAY);
    const orderBy = new Date(date.getTime() - e.orderBy * DAY);
    const daysTo = Math.round((date.getTime() - t0) / DAY);
    const phase = t0 < start.getTime() ? 'later' : t0 <= orderBy.getTime() ? 'selling' : 'last-call';
    return { ...e, date, start, orderByDate: orderBy, daysTo, phase };
  }).sort((a, b) => a.date - b.date);
}

/** The events to push right now, loudest first: still able to make the date. */
function sellingNow(today = new Date()) {
  return upcoming(today).filter((e) => e.phase === 'selling');
}

/** An event's words with its dates filled in. */
function fill(text, ev) {
  return String(text).replace(/\{date\}/g, nice(ev.date)).replace(/\{orderBy\}/g, nice(ev.orderByDate));
}

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** The email for an event: {subject, preview, html}. The send function adds
 *  the shop's address and the unsubscribe link (marketing mail). */
function emailFor(ev) {
  const e = ev.email;
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;max-width:600px;margin:0 auto;color:#12203c">
  <div style="display:none;max-height:0;overflow:hidden">${esc(fill(e.preview, ev))}</div>
  <div style="background:#12203c;color:#fff;padding:18px 24px;border-radius:12px 12px 0 0">
    <div style="font-size:13px;letter-spacing:.08em;text-transform:uppercase;opacity:.8">June’s Tees &amp; Things</div>
    <div style="font-size:26px;font-weight:700;margin-top:6px">${esc(e.headline)}</div>
  </div>
  <div style="border:1px solid #e3e8f2;border-top:0;border-radius:0 0 12px 12px;padding:22px 24px;line-height:1.55;font-size:16px">
    <p style="margin:0 0 14px">${esc(fill(e.intro, ev))}</p>
    <ul style="margin:0 0 16px;padding-left:20px">${ev.products.map((p) => `<li style="margin:4px 0">${esc(p)}</li>`).join('')}</ul>
    <p style="margin:0 0 18px;padding:10px 14px;background:#fff7e6;border-radius:8px"><b>Order by ${esc(nice(ev.orderByDate))}</b> to have it in hand for ${esc(ev.name)}.</p>
    <p style="margin:0 0 18px"><a href="${esc(ev.link)}" style="display:inline-block;background:#1848B8;color:#fff;text-decoration:none;padding:12px 22px;border-radius:8px;font-weight:700">${esc(ev.cta)}</a></p>
    <p style="margin:0 0 6px">Questions, or want us to design it? Call or text ${PHONE}. Free pickup in Lakeview.</p>
    <p style="margin:16px 0 0;color:#4b5563"><b>P.S.</b> ${esc(fill(e.ps, ev))}</p>
  </div></div>`;
  return { subject: fill(e.subject, ev), preview: fill(e.preview, ev), html };
}

module.exports = { EVENTS, LINKS, upcoming, sellingNow, emailFor, fill, nice, iso, nthWeekday, easter };
