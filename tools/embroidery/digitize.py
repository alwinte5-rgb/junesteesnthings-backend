#!/usr/bin/env python3
"""Generate stitch paths from artwork: count them, and draw them.

    python3 tools/embroidery/digitize.py logo.png --width-cm 9 --out preview.png
    python3 tools/embroidery/digitize.py logo.png --width-cm 9 --json

WHY THIS EXISTS
---------------
A job cannot be priced without a stitch count, and a stitch count normally only
exists after a design has been digitised — which costs money and a day, and
cannot be got from the supplier as a quote either. So the shop was pricing
embroidery blind.

This lays down real stitch geometry and COUNTS it. The count is the point; the
picture is the by-product, and the by-product happens to answer the other
question a customer asks — "what will it actually look like sewn?" — which the
artwork on screen never shows, because thread cannot do gradients, hairlines or
2 pt type.

It is NOT a production digitiser. It makes no DST, and the real file should
still be digitised properly. What it gives is a defensible number BEFORE that
decision, and a picture honest enough that nobody is surprised.

HOW IT STITCHES
---------------
Per thread colour, the way a tatami fill is actually built:

  underlay   one coarse pass perpendicular to the fill, stabilising the fabric
  fill       parallel rows at ROW_MM spacing, each row cut into stitches of at
             most MAX_MM
  border     a satin edge around the region

Counts are needle penetrations, which is what a machine and an invoice count.

DETAIL THAT WILL NOT SEW
------------------------
A region narrower than MIN_FILL_MM cannot hold a fill — in thread it closes up
or disappears. Those areas are measured and reported rather than quietly
rendered, because that is the conversation worth having with a customer before
the machine runs, not after.
"""
import argparse, json, math, os, sys

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROW_MM = 0.40          # spacing between fill rows
MAX_MM = 4.00          # longest single stitch
MIN_MM = 1.00          # shortest worth making
UNDERLAY_MULT = 3.0    # underlay rows are this much further apart than fill
MIN_FILL_MM = 1.20     # narrower than this cannot hold a fill
SATIN_MM = 0.55        # spacing of border satin stitches
PPM = 4.0              # working resolution, pixels per mm

FABRIC = (232, 228, 220)

# WHAT THE SHOP WILL NOT TAKE.
# "No fine lined projects. Nothing too small or lots of letters. Not too many
# details." Encoded here so the answer is the same every time and is given
# BEFORE the work is quoted, not after it sews badly.
#
# The numbers are the published digitising minimums, not invented:
#   satin column      0.8mm absolute floor, 1.3mm before it is reliable
#   thin line         1.27mm (0.05in) minimum, 2.5mm (0.1in) to be safe
#   capital letters   6.4mm, and 7-9mm on knits and performance fabric
#   counters          0.9mm, or the hole in an 'a' fills in
MIN_SATIN_MM = 1.30
MIN_LINE_SAFE_MM = 2.50
MIN_CAP_HEIGHT_MM = 6.40
THIN_DECLINE_PCT = 15.0      # this much unstitchable detail and it is not a job
COMPLEXITY_DECLINE = 8.0     # edge length vs an equal-area circle
MIN_DESIGN_MM = 25.0


def load_mask(path):
    im = Image.open(path)
    if im.mode in ('RGBA', 'LA') or (im.mode == 'P' and 'transparency' in im.info):
        rgba = im.convert('RGBA')
        a = np.asarray(rgba)
        return a[:, :, 3] > 16, rgba
    rgb = im.convert('RGB')
    a = np.asarray(rgb).astype(np.int16)
    mx, mn = a.max(2), a.min(2)
    # near-white and near-neutral is background; anything else is artwork
    return ~((mn >= 238) & ((mx - mn) <= 10)), rgb.convert('RGBA')


def threads(rgba, mask, n):
    """Quantise to n thread colours. Thread is discrete — no gradients.

    The background is flattened to the MEAN artwork colour first. Quantising the
    image as-is let the transparent background (black once flattened) claim a
    palette slot of its own, so asking for 3 threads returned 2 and a whole
    garment colour — a green bar — was merged into the navy. A missing thread is
    a missing colour change, and a colour change is money.
    """
    a = np.asarray(rgba.convert('RGB'))
    px = a[mask]
    if px.size == 0:
        return []
    # Palette from the ARTWORK PIXELS ALONE. Flattening the background to one
    # colour and quantising the whole frame still skewed median-cut — that block
    # outweighs the design, and the red hairlines were merged into a dark teal.
    strip = Image.fromarray(px.reshape(1, -1, 3).astype(np.uint8))
    pal = np.asarray(strip.quantize(colors=n, method=Image.MEDIANCUT,
                                    dither=Image.NONE).getpalette()[: n * 3]).reshape(-1, 3)
    pal = np.unique(pal, axis=0)
    # nearest palette entry for every artwork pixel
    d2 = ((a[:, :, None, :].astype(np.int32) - pal[None, None, :, :]) ** 2).sum(3)
    idx = d2.argmin(2)
    out = []
    for i in range(len(pal)):
        m = (idx == i) & mask
        if m.sum() < 4:
            continue
        out.append((tuple(int(c) for c in pal[i]), m))
    # sew the largest area first, as a digitiser would
    out.sort(key=lambda t: -t[1].sum())
    return out


def _morph(m, r, filt):
    """Erode or dilate by radius r. Padded, so a shape touching the frame edge
    erodes there too — without the pad a full-bleed shape reported no border at
    all, because its outline sat exactly on the boundary."""
    k = min(max(1, int(round(r)) * 2 + 1), 9)
    pad = int(k)
    a = np.pad(m, pad, constant_values=(filt is ImageFilter.MaxFilter))
    im = Image.fromarray((a * 255).astype(np.uint8)).filter(filt(k))
    return np.asarray(im)[pad:-pad, pad:-pad] > 127


def erode(m, r):
    return _morph(m, r, ImageFilter.MinFilter)


def dilate(m, r):
    return _morph(m, r, ImageFilter.MaxFilter)


def scan(m, angle_deg, row_px, ppm):
    """Stitch runs across a mask along `angle_deg`, rows `row_px` apart.

    Returns a list of ((x0,y0),(x1,y1)) stitches. Rather than rotating the
    image, sample along rotated axes: u runs with the stitch, v across the rows.
    """
    h, w = m.shape
    t = math.radians(angle_deg)
    ct, st = math.cos(t), math.sin(t)
    corners = [(0, 0), (w, 0), (0, h), (w, h)]
    us = [x * ct + y * st for x, y in corners]
    vs = [-x * st + y * ct for x, y in corners]
    u0, u1, v0, v1 = min(us), max(us), min(vs), max(vs)

    max_px = MAX_MM * ppm
    out = []
    v = v0
    while v <= v1:
        # walk this row, collecting contiguous inside-runs
        n = int((u1 - u0))
        if n <= 0:
            break
        uu = np.linspace(u0, u1, n)
        xs = (uu * ct - v * st).astype(np.int32)
        ys = (uu * st + v * ct).astype(np.int32)
        ok = (xs >= 0) & (xs < w) & (ys >= 0) & (ys < h)
        inside = np.zeros(n, bool)
        inside[ok] = m[ys[ok], xs[ok]]
        if inside.any():
            d = np.diff(inside.astype(np.int8))
            starts = list(np.where(d == 1)[0] + 1)
            ends = list(np.where(d == -1)[0] + 1)
            if inside[0]:
                starts = [0] + starts
            if inside[-1]:
                ends = ends + [n - 1]
            for s, e in zip(starts, ends):
                a_u, b_u = uu[s], uu[e]
                length = b_u - a_u
                if length < MIN_MM * ppm:
                    continue
                steps = max(1, int(math.ceil(length / max_px)))
                for k in range(steps):
                    p = a_u + length * k / steps
                    q = a_u + length * (k + 1) / steps
                    out.append(((p * ct - v * st, p * st + v * ct),
                                (q * ct - v * st, q * st + v * ct)))
        v += row_px
    return out


def border(m, ppm):
    """A satin edge: short stitches straddling the region outline."""
    e = m & ~erode(m, 1)
    ys, xs = np.nonzero(e)
    if len(xs) == 0:
        return []
    step = max(1, int(round(SATIN_MM * ppm)))
    pts = list(zip(xs[::step], ys[::step]))
    w = 0.8 * ppm
    out = []
    for x, y in pts:
        out.append(((float(x) - w, float(y) - w), (float(x) + w, float(y) + w)))
    return out


def review(width_mm, height_mm, area_mm2, outline_mm, thin_pct, threads_n):
    """Accept, review by hand, or decline — with the reason in plain words.

    Complexity is the outline length against that of a circle of the same area.
    A solid blob is 1; lots of small elements, letters and fine work push it up.
    It is a cheap stand-in for "how many separate things is the machine asked to
    sew", which is what actually makes a design fail and makes it expensive.
    """
    flags = []                      # (severity, reason)
    equal_circle = 2.0 * math.sqrt(math.pi * max(area_mm2, 1.0))
    complexity = outline_mm / equal_circle if equal_circle else 0.0

    if min(width_mm, height_mm) < MIN_DESIGN_MM:
        flags.append(('decline', f'smaller than {MIN_DESIGN_MM:.0f}mm across — too small to sew cleanly'))

    # Graded, because "some fine detail" and "the whole thing is hairlines" are
    # different conversations. Half the decline threshold is worth a look by a
    # human; the threshold itself is not a job this shop takes.
    if thin_pct >= THIN_DECLINE_PCT:
        flags.append(('decline', f'{thin_pct:.0f}% of it is finer than {MIN_SATIN_MM}mm — '
                      'those lines close up or disappear in thread'))
    elif thin_pct >= THIN_DECLINE_PCT / 2:
        flags.append(('review', f'{thin_pct:.0f}% is finer than {MIN_SATIN_MM}mm — '
                      'check what is lost before quoting'))

    if complexity >= COMPLEXITY_DECLINE:
        flags.append(('decline', f'complexity {complexity:.1f}x a plain shape — small elements, '
                      'lettering or fine detail; the kind of job that sews badly'))
    elif complexity >= COMPLEXITY_DECLINE / 1.6:
        flags.append(('review', f'complexity {complexity:.1f}x a plain shape — detailed enough '
                      'to be worth eyeballing the preview'))

    if threads_n > 6:
        flags.append(('decline', f'{threads_n} thread colours — every change is a stop and a trim'))
    elif threads_n > 4:
        flags.append(('review', f'{threads_n} thread colours'))

    if any(sev == 'decline' for sev, _ in flags):
        verdict = 'DECLINE'
    elif flags:
        verdict = 'REVIEW'
    else:
        verdict = 'ACCEPT'
    reasons = [r for _, r in flags]
    return {'verdict': verdict, 'complexity': round(complexity, 1), 'reasons': reasons}


def run(path, width_cm, colours, out_png):
    mask, rgba = load_mask(path)
    ph, pw = mask.shape
    width_mm = width_cm * 10.0
    ppm = PPM
    tw, th = int(width_mm * ppm), int(width_mm * ppm * ph / pw)
    rgba = rgba.resize((tw, th), Image.LANCZOS)
    m = np.asarray(Image.fromarray((mask * 255).astype(np.uint8)).resize((tw, th), Image.NEAREST)) > 127

    layers = threads(rgba, m, colours)
    row_px = ROW_MM * ppm

    canvas = Image.new('RGB', (tw, th), FABRIC)
    d = ImageDraw.Draw(canvas)

    total = 0
    per = []
    thin_px = 0
    angle = 45.0
    for i, (col, lm) in enumerate(layers):
        r = max(1, int(round(MIN_FILL_MM * ppm / 2)))
        fillable = erode(lm, r)
        # An opening: erode, then grow back. Subtracting the eroded mask alone
        # counted the whole boundary band of every solid shape as "at risk",
        # which is wrong — that band is exactly what the satin border covers.
        # What genuinely will not sew is what the core cannot reach.
        opened = dilate(fillable, r)
        thin_px += int((lm & ~opened).sum())

        a = angle + i * 15.0                       # vary angle per colour, as a digitiser does
        under = scan(fillable, a + 90, row_px * UNDERLAY_MULT, ppm)
        fill = scan(fillable, a, row_px, ppm)
        edge = border(lm, ppm)

        dark = tuple(max(0, c - 38) for c in col)
        for (p, q) in under:
            d.line([p, q], fill=dark, width=1)
        for (p, q) in fill:
            d.line([p, q], fill=col, width=max(1, int(ROW_MM * ppm)))
        for (p, q) in edge:
            d.line([p, q], fill=col, width=max(1, int(ROW_MM * ppm * 1.4)))

        n = len(under) + len(fill) + len(edge)
        total += n
        per.append({'thread': '#%02x%02x%02x' % col, 'stitches': n,
                    'fill': len(fill), 'underlay': len(under), 'border': len(edge)})

    # a little thread sheen so it reads as stitching rather than vector art
    canvas = Image.blend(canvas, canvas.filter(ImageFilter.GaussianBlur(0.6)), 0.35)
    if out_png:
        canvas.save(out_png)

    area_px = int(m.sum())
    mm_per_px = 1.0 / ppm
    area_mm2 = area_px * mm_per_px * mm_per_px
    edge_px = int((m & ~erode(m, 1)).sum())
    outline_mm = edge_px * mm_per_px
    thin_pct = round(100.0 * thin_px / max(1, area_px), 1)
    gate = review(width_mm, width_mm * ph / pw, area_mm2, outline_mm, thin_pct, len(layers))
    return {
        'file': os.path.basename(path),
        'width_cm': round(width_cm, 1), 'height_cm': round(width_cm * ph / pw, 1),
        'threads': len(layers), 'colour_changes': max(0, len(layers) - 1),
        'stitches': total,
        'stitches_low': int(total * 0.85), 'stitches_high': int(total * 1.15),
        'per_thread': per,
        'detail_at_risk_pct': thin_pct,
        'complexity': gate['complexity'],
        'verdict': gate['verdict'],
        'reasons': gate['reasons'],
        'preview': out_png,
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('image')
    ap.add_argument('--width-cm', type=float, default=9.0)
    ap.add_argument('--colours', type=int, default=4)
    ap.add_argument('--out', default=None)
    ap.add_argument('--json', action='store_true')
    a = ap.parse_args()

    r = run(a.image, a.width_cm, a.colours, a.out)
    if a.json:
        print(json.dumps(r, indent=1)); return
    print(f"\n  {r['file']}  ·  {r['width_cm']}cm x {r['height_cm']}cm")
    print(f"  {r['threads']} thread colours, {r['colour_changes']} colour changes\n")
    for t in r['per_thread']:
        print(f"    {t['thread']}   {t['stitches']:>6,}   "
              f"(fill {t['fill']:,} · underlay {t['underlay']:,} · border {t['border']:,})")
    print(f"\n    TOTAL {r['stitches']:,} stitches   (±15%: {r['stitches_low']:,}-{r['stitches_high']:,})")
    print(f"\n    detail at risk    {r['detail_at_risk_pct']}%")
    print(f"    complexity        {r['complexity']}x a plain shape")
    print(f"\n    {r['verdict']}")
    for why in r['reasons']:
        print(f"      - {why}")
    if r['preview']:
        print(f"\n    preview: {r['preview']}")


if __name__ == '__main__':
    main()
