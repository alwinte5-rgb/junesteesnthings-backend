#!/usr/bin/env python3
"""Estimate an embroidery stitch count from artwork, and price it.

    python3 tools/embroidery/estimate.py logo.png --width-in 3.5
    python3 tools/embroidery/estimate.py logo.png --width-cm 10 --json

WHY THIS EXISTS
---------------
The shop cannot quote embroidery without a stitch count, and a stitch count
only exists after a design is digitised — which costs money and a day. So the
choice was quote-only (and lose the sale) or guess (and eat the difference).
This estimates the count from the artwork itself, before anybody digitises it.

WHAT IT IS AND IS NOT
---------------------
It is an ESTIMATE, and it is deliberately reported as a RANGE. Stitch count
tracks fill area and density, not size: the same 10 cm logo is ~6k stitches as
an outline and ~25k as a solid fill. The range is the honest answer, and the
upper bound is the one to quote from.

It is not a digitiser. It never produces a DST — see README.md for that path.

THE ARITHMETIC
--------------
Industry practice, which is area times a density factor plus the border:

    stitches = filled_area_in2 * fill_density      (a solid fill)
             + outline_inches  * satin_density     (the border)
             + underlay                            (a fraction of the fill)

Published fill densities sit between about 800 and 2,000 stitches per square
inch depending on how solid the design is; satin borders run about 150-200 per
linear inch. Those spreads are exactly why this returns a range rather than
pretending to a single number.
"""
import argparse, json, math, os, sys
from collections import deque

import numpy as np
from PIL import Image, ImageFilter

# Stitches per square inch of SOLID fill. The low end is an open/light fill,
# the high end a dense one. A design that is mostly outline lands below both,
# which is why the outline term is counted separately rather than folded in.
FILL_LO, FILL_HI = 800.0, 2000.0
# Stitches per LINEAR inch of satin border.
SATIN_LO, SATIN_HI = 150.0, 200.0
# Underlay stitches, as a fraction of the fill. Every fill is stitched twice:
# once loosely to stabilise the fabric, once for the surface.
UNDERLAY = 0.25


def alpha_mask(path, white=238):
    """Which pixels are artwork.

    Uses the alpha channel when the file has one. Otherwise the background is
    found by flooding IN from the border, the same rule tools/product-art
    cutout.py uses: only white CONNECTED to the edge is background, so a white
    counter inside a letter 'O' stays part of the design.
    """
    im = Image.open(path)
    if im.mode in ('RGBA', 'LA') or (im.mode == 'P' and 'transparency' in im.info):
        a = np.asarray(im.convert('RGBA'))[:, :, 3]
        return a > 16, im.size

    a = np.asarray(im.convert('RGB')).astype(np.int16)
    h, w, _ = a.shape
    mx, mn = a.max(2), a.min(2)
    whiteish = (mn >= white) & ((mx - mn) <= 10)
    bg = np.zeros((h, w), bool)
    q = deque()
    for x in range(w):
        for y in (0, h - 1):
            if whiteish[y, x] and not bg[y, x]:
                bg[y, x] = True; q.append((y, x))
    for y in range(h):
        for x in (0, w - 1):
            if whiteish[y, x] and not bg[y, x]:
                bg[y, x] = True; q.append((y, x))
    while q:
        y, x = q.popleft()
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            ny, nx = y + dy, x + dx
            if 0 <= ny < h and 0 <= nx < w and whiteish[ny, nx] and not bg[ny, nx]:
                bg[ny, nx] = True; q.append((ny, nx))
    return ~bg, im.size


def outline_pixels(mask):
    """Edge length in pixels: filled pixels with at least one empty neighbour."""
    m = mask.astype(np.uint8)
    pad = np.pad(m, 1)
    nb = (pad[:-2, 1:-1] + pad[2:, 1:-1] + pad[1:-1, :-2] + pad[1:-1, 2:])
    return int(((m == 1) & (nb < 4)).sum())


def colours_used(path, mask, limit=16):
    """Distinct thread colours, as a quantised count. Each is a thread change."""
    im = Image.open(path).convert('RGB')
    a = np.asarray(im)
    px = a[mask]
    if px.size == 0:
        return 0
    q = (px // 48) * 48                                   # ~5 levels per channel
    return min(len({tuple(p) for p in q}), limit)


def estimate(path, width_in):
    mask, (pw, ph) = alpha_mask(path)
    filled = int(mask.sum())
    if not filled:
        raise SystemExit('no artwork found in ' + path + ' (all background?)')

    height_in = width_in * ph / pw
    in_per_px = width_in / pw
    area_in2 = filled * in_per_px * in_per_px
    outline_in = outline_pixels(mask) * in_per_px

    lo = area_in2 * FILL_LO * (1 + UNDERLAY) + outline_in * SATIN_LO
    hi = area_in2 * FILL_HI * (1 + UNDERLAY) + outline_in * SATIN_HI
    return {
        'file': os.path.basename(path),
        'width_in': round(width_in, 2), 'height_in': round(height_in, 2),
        'width_cm': round(width_in * 2.54, 1), 'height_cm': round(height_in * 2.54, 1),
        'coverage_pct': round(100.0 * filled / (pw * ph), 1),
        'filled_area_in2': round(area_in2, 2),
        'outline_in': round(outline_in, 1),
        'colours': colours_used(path, mask),
        'stitches_low': int(round(lo, -2)),
        'stitches_high': int(round(hi, -2)),
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('image')
    g = ap.add_mutually_exclusive_group()
    g.add_argument('--width-in', type=float)
    g.add_argument('--width-cm', type=float)
    ap.add_argument('--json', action='store_true')
    a = ap.parse_args()

    if a.width_cm:
        width_in = a.width_cm / 2.54
    elif a.width_in:
        width_in = a.width_in
    else:
        width_in = 3.5                                    # a typical left chest

    r = estimate(a.image, width_in)
    if a.json:
        print(json.dumps(r, indent=1)); return

    print(f"\n  {r['file']}")
    print(f"  at {r['width_in']}in x {r['height_in']}in  ({r['width_cm']}cm x {r['height_cm']}cm)\n")
    print(f"    ink covers        {r['coverage_pct']}% of the frame")
    print(f"    filled area       {r['filled_area_in2']} sq in")
    print(f"    outline           {r['outline_in']} linear in")
    print(f"    thread colours    ~{r['colours']}")
    print(f"\n    STITCHES          {r['stitches_low']:,} - {r['stitches_high']:,}")
    print('\n    An estimate, not a digitised count. Quote from the upper figure.')


if __name__ == '__main__':
    main()
