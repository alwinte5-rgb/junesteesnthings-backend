'use strict';

/* Every image the public site shows must come from somewhere we control.

   The homepage's "Our Work" gallery, hero fallback and an about-slider photo
   pointed at previews.digitalvisionstudios.net — a site builder's preview host
   that later became an unrelated store and started answering 404. Nine images
   went blank and nothing noticed until a customer-facing screenshot. This fails
   on any image from an unlisted host, and on any local image path that has no
   file behind it. */

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const PUBLIC = path.join(__dirname, '..', 'public');
const ALLOWED_HOSTS = new Set(['res.cloudinary.com', 'www.jtees.net', 'jtees.net', 'design.jtees.net']);

function htmlFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return e.name === 'assets' ? [] : htmlFiles(p);
    return e.name.endsWith('.html') ? [p] : [];
  });
}

function imageRefs(html) {
  const refs = [];
  for (const m of html.matchAll(/<img\b[^>]*\bsrc="([^"]+)"/gi)) refs.push(m[1]);
  for (const m of html.matchAll(/url\(\s*['"]?([^'")]+\.(?:jpe?g|png|gif|webp|avif|svg))['"]?\s*\)/gi)) refs.push(m[1]);
  for (const m of html.matchAll(/<meta\s+(?:property|name)="(?:og:image|twitter:image)"\s+content="([^"]+)"/gi)) refs.push(m[1]);
  return refs.filter((r) => !r.startsWith('data:') && !r.includes('${'));
}

test('site images come only from hosts we control, and local ones exist', () => {
  const problems = [];
  for (const file of htmlFiles(PUBLIC)) {
    const rel = path.relative(PUBLIC, file);
    for (const ref of imageRefs(fs.readFileSync(file, 'utf8'))) {
      if (/^https?:\/\//i.test(ref)) {
        const host = new URL(ref).hostname;
        if (!ALLOWED_HOSTS.has(host)) { problems.push(`${rel}: image from unlisted host ${host} — ${ref}`); continue; }
        if (host.endsWith('jtees.net') && host !== 'design.jtees.net') {
          const local = path.join(PUBLIC, decodeURIComponent(new URL(ref).pathname));
          if (!fs.existsSync(local)) problems.push(`${rel}: ${ref} has no file in public/`);
        }
      } else if (ref.startsWith('/')) {
        const local = path.join(PUBLIC, decodeURIComponent(ref.split('?')[0]));
        if (!fs.existsSync(local)) problems.push(`${rel}: ${ref} has no file in public/`);
      }
    }
  }
  assert.deepStrictEqual(problems, []);
});
