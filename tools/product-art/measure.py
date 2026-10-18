"""Measure a cut-out garment photo, so print placements can be set ON it.

    python3 tools/product-art/measure.py <dir-or-webp> [...]   ->  JSON on stdout

For every `*-front.webp` / `*-back.webp` it reports, in the image's own pixels:

    W, H        image size (the canvas draws the photo at this aspect)
    bbox        the garment's opaque bounding box
    cx          the garment's centre line
    torso       the body width, measured as the opaque run through the centre
                near the hem — below the arms on a tee, beside the hanging
                sleeves on a long sleeve or hoodie
    shoulder    the first row (from the top) as wide as most of the torso:
                the shoulder line on a tee, below the hood on a hoodie, the
                armpit on a tank

tools/lib/placements.js turns these into Lumise edit zones. Measuring is kept
here, in Python, because the cut-outs are made here (cutout.py) with PIL; the
placement RULES are in JavaScript beside the rest of the catalogue logic, so
there is one copy of them.
"""
import glob
import json
import os
import sys

from PIL import Image

ALPHA = 128  # cutout.py's edges are feathered; half opacity is "garment"


def runs(row):
    """[(start, end)] spans of opaque pixels in one row of alpha values."""
    out, start = [], None
    for x, a in enumerate(row):
        if a >= ALPHA and start is None:
            start = x
        elif a < ALPHA and start is not None:
            out.append((start, x - 1))
            start = None
    if start is not None:
        out.append((start, len(row) - 1))
    return out


def measure(path, ratio_hint=None):
    im = Image.open(path).convert('RGBA')
    W, H = im.size
    a = im.getchannel('A')
    bbox = a.getbbox()
    if not bbox:
        return {'W': W, 'H': H, 'error': 'no opaque pixels'}
    x0, y0, x1, y1 = bbox
    px = a.load()
    row = lambda y: [px[x, y] for x in range(W)]
    cx = (x0 + x1) / 2.0

    # Torso: the run through the centre, averaged over a band near the hem
    # (80-90% of the garment's height), where a tee has no sleeves and a long
    # sleeve's cuffs hang apart from the body.
    widths, centres = [], []
    for f in (0.80, 0.83, 0.86, 0.89):
        y = int(y0 + f * (y1 - y0))
        for s, e in runs(row(y)):
            if s <= cx <= e:
                widths.append(e - s + 1)
                centres.append((s + e) / 2.0)
                break
    torso = sorted(widths)[len(widths) // 2] if widths else (x1 - x0)
    merged = torso > 0.86 * (x1 - x0)  # sleeves touching the body: not separable
    if centres:
        cx = sorted(centres)[len(centres) // 2]

    # Shoulder line: first row, from the top, whose centre run reaches 85% of
    # the torso width. A hood or a collar stand is narrower than that.
    def shoulder_for(t):
        for y in range(y0, y1):
            hit = [e - s + 1 for s, e in runs(row(y)) if s <= cx <= e]
            if hit and hit[0] >= 0.85 * t:
                return y
        return y0
    shoulder = shoulder_for(torso)

    out = {'W': W, 'H': H, 'bbox': [x0, y0, x1, y1], 'cx': round(cx, 1),
           'torso': int(torso), 'merged': merged, 'shoulder': int(shoulder)}
    # Sleeves hanging against the body make the hem band arms + body, so the
    # torso reads ~the whole span and the shoulder search lands at the pocket
    # (17 of the 2026-10-18 streetwear batch: boxes oversized and too low).
    # Estimate the body instead: the other side's body/span ratio when that
    # photo separates, else the typical 0.60. Stored apart from `torso` —
    # on a tank merged is normal, and only placements.js knows the set.
    if merged:
        t = (ratio_hint or 0.60) * (x1 - x0)
        out['torso_sep'] = int(t)
        out['shoulder_sep'] = int(shoulder_for(t))
    return out


def main(args):
    files = []
    for a in args:
        if os.path.isdir(a):
            files += sorted(glob.glob(os.path.join(a, '*-front.webp')) + glob.glob(os.path.join(a, '*-back.webp')))
        else:
            files.append(a)
    out = {os.path.basename(f): measure(f) for f in files}
    # A merged side borrows its body/span ratio from the same colour's other
    # side when that one separates (same garment, same photo set).
    for f in files:
        n = os.path.basename(f)
        m = out[n]
        if not m.get('merged'):
            continue
        twin = n.replace('-front.', '-back.') if '-front.' in n else n.replace('-back.', '-front.')
        o = out.get(twin)
        if o and not o.get('error') and not o.get('merged'):
            ox0, _, ox1, _ = o['bbox']
            out[n] = measure(f, o['torso'] / float(ox1 - ox0))
    print(json.dumps(out, indent=1))


if __name__ == '__main__':
    main(sys.argv[1:])
