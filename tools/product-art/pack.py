#!/usr/bin/env python3
"""Fetch a style's colourway photos and pack them for the design canvas.

Step 2 of the pipeline in README.md. Takes the JSON that colours.js emits:

    python3 tools/product-art/pack.py colours.json <outdir> [--max 800] [--q 90]

Writes <outdir>/manifest.json for upload.js to push to Cloudinary.

WebP rather than PNG: these are photographs, and PNG stores them about six
times over. At 800px/q90 a colourway lands around 120KB with its alpha intact;
the same image as an optimised PNG is ~700KB, which across the catalogue is the
difference between 85MB and 400MB.
"""
import argparse, json, os, re, sys, urllib.request
from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from cutout import cutout

# The CDN refuses urllib's default agent with a 403.
UA = {'User-Agent': 'Mozilla/5.0 (Macintosh) jtees-product-art/1.0'}


def fetch(url, dest):
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=60) as r, open(dest, 'wb') as f:
        f.write(r.read())


def slug(s):
    return re.sub(r'[^a-z0-9]+', '-', s.lower()).strip('-')


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('colours'); ap.add_argument('outdir')
    ap.add_argument('--max', type=int, default=800)
    ap.add_argument('--q', type=int, default=90)
    ap.add_argument('--sides', default='front,back')
    a = ap.parse_args()

    os.makedirs(a.outdir, exist_ok=True)
    cols = json.load(open(a.colours))
    sides = [s for s in a.sides.split(',') if s]
    man, total = [], 0

    for c in cols:
        rec = {'name': c['name'], 'slug': slug(c['name'])}
        for side in sides:
            path = c.get(side) or ''
            if not path:
                print(f"  {rec['slug']}-{side}: no image at S&S — skipped")
                continue
            # _fl is the 1000px original; _fm is half that and too soft to crop.
            url = 'https://cdn.ssactivewear.com/' + path.replace('_fm.jpg', '_fl.jpg')
            raw = os.path.join(a.outdir, f"{rec['slug']}-{side}.jpg")
            png = os.path.join(a.outdir, f"{rec['slug']}-{side}.png")
            web = os.path.join(a.outdir, f"{rec['slug']}-{side}.webp")
            fetch(url, raw)
            cutout(raw, png)
            im = Image.open(png).convert('RGBA')
            im.thumbnail((a.max, a.max), Image.LANCZOS)
            im.save(web, 'WEBP', quality=a.q, method=6)
            os.remove(raw); os.remove(png)
            rec[side + '_web'] = web
            total += os.path.getsize(web)
        man.append(rec)

    json.dump(man, open(os.path.join(a.outdir, 'manifest.json'), 'w'), indent=1)
    n = sum(1 for r in man for s in sides if s + '_web' in r)
    print(f'\n{len(man)} colourways, {n} images, {total/1e6:.1f}MB')


if __name__ == '__main__':
    main()
