#!/usr/bin/env python3
"""Find photos on the site that show the same picture or the same design.

The owner kept finding repeats (2026-10-17): the same job saved under two
names, re-cropped, or shot twice. A file-name check misses all of those, so
this compares what the photos show: a 64-bit difference hash (dHash) of each
photo, plus the same hash of its centre crop, so a tight re-crop of a wider
shot still matches.

    python3 tools/photo-dupes.py            write public/assets/data/photo-hashes.json
    python3 tools/photo-dupes.py --report   also list near-matches across ALL photos
    python3 tools/photo-dupes.py --designer ~/lumise-designer   include its media/collections

tests/photo-dupes.test.js reads the hash file and fails if two photos shown on
the site are near-matches, or if a shown photo has no current hash.
Needs Pillow (a dev tool only, not a runtime dependency).
"""
import hashlib, json, os, sys
from PIL import Image, ImageOps

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
PUBLIC = os.path.join(ROOT, 'public')
OUT = os.path.join(PUBLIC, 'assets', 'data', 'photo-hashes.json')
DIRS = ['assets/images/work', 'assets/images/occasions']


def dhash(img, size=8):
    g = img.convert('L').resize((size + 1, size), Image.LANCZOS)
    px = list(g.getdata())
    bits = 0
    for r in range(size):
        for c in range(size):
            bits = (bits << 1) | (px[r * (size + 1) + c] > px[r * (size + 1) + c + 1])
    return '%016x' % bits


def hashes(path):
    im = ImageOps.exif_transpose(Image.open(path))
    w, h = im.size
    centre = im.crop((w // 6, h // 6, w - w // 6, h - h // 6))
    return [dhash(im), dhash(centre)]


def dist(a, b):
    return bin(int(a, 16) ^ int(b, 16)).count('1')


def near(ha, hb):
    """Same picture: whole photos and centres both close (sum <= 20), or one
    photo's centre matching the other whole (a re-crop, <= 6). A single close
    whole-photo hash alone was too loose: two dark tees scored 8."""
    return dist(ha[0], hb[0]) + dist(ha[1], hb[1]) <= 20 or min(dist(ha[0], hb[1]), dist(ha[1], hb[0])) <= 6


def score(ha, hb):
    return dist(ha[0], hb[0]) + dist(ha[1], hb[1])


def main():
    out = {}
    for d in DIRS:
        full = os.path.join(PUBLIC, d)
        if not os.path.isdir(full):
            continue
        for f in sorted(os.listdir(full)):
            if f.lower().endswith(('.jpg', '.jpeg', '.png', '.webp')):
                p = os.path.join(full, f)
                out['/' + d + '/' + f] = {'sha1': hashlib.sha1(open(p, 'rb').read()).hexdigest(), 'h': hashes(p)}
    extra = {}
    if '--designer' in sys.argv:
        base = os.path.expanduser(sys.argv[sys.argv.index('--designer') + 1])
        col = os.path.join(base, 'media', 'collections')
        for slug in sorted(os.listdir(col)):
            for f in sorted(os.listdir(os.path.join(col, slug))):
                if f.lower().endswith(('.jpg', '.jpeg', '.png', '.webp')):
                    extra['designer:' + slug + '/' + f] = {'h': hashes(os.path.join(col, slug, f))}
    with open(OUT, 'w') as fh:
        json.dump({'_about': 'dHash of every site photo (tools/photo-dupes.py). Regenerate after adding or replacing a photo.', 'photos': out}, fh, indent=1, sort_keys=True)
        fh.write('\n')
    if '--report' in sys.argv:
        allp = {**{k: v['h'] for k, v in out.items()}, **{k: v['h'] for k, v in extra.items()}}
        keys = sorted(allp)
        for i, a in enumerate(keys):
            for b in keys[i + 1:]:
                if near(allp[a], allp[b]):
                    print('%2d  %s  ~  %s' % (score(allp[a], allp[b]), a, b))


if __name__ == '__main__':
    main()
