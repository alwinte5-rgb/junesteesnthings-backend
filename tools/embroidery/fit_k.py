#!/usr/bin/env python3
"""Fit the stitch-count model against real digitised files.

    python3 tools/embroidery/fit_k.py <file.DST> [more.DST ...]
    find ... -iname '*.dst' | python3 tools/embroidery/fit_k.py -

WHY THIS WORKS WITHOUT ARTWORK
------------------------------
Fitting wanted pairs of artwork and its finished DST, and only DSTs were to
hand. But a DST contains the stitch paths, so it can be RENDERED back to the
shape it sews — and the shape is what the complexity measure reads. The render
stands in for the artwork, which is fair: it is what the digitiser actually
produced from it.

THE MODELS
----------
    area      stitches = a * area_in2                   the trade rule of thumb
    linear    stitches = a * width_in                   what same-design scaling showed
    physical  stitches = a * area_in2 + b * outline_in  fill plus border

`physical` is the one worth fitting, because it is how embroidery is actually
built and it is the formula estimate.py already uses — so a and b fitted here
replace the published averages with this shop's own numbers.

R2 is reported per model. A model that does not beat the others is said so.
"""
import math, os, sys

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from read_dst import _delta, U

PPM = 3.0          # render resolution, px per mm
THREAD_MM = 0.45   # drawn width of one stitch


def stitch_paths(path):
    raw = open(path, 'rb').read()
    x = y = 0
    runs, cur = [], []
    colours = 0
    body = raw[512:]
    for i in range(0, len(body) - 2, 3):
        b0, b1, b2 = body[i], body[i + 1], body[i + 2]
        if (b2 & 0xF3) == 0xF3:
            break
        dx, dy = _delta(b0, b1, b2)
        x += dx; y += dy
        if (b2 & 0xC3) == 0xC3:
            colours += 1
            if cur: runs.append(cur); cur = []
            continue
        if (b2 & 0x83) == 0x83:
            if cur: runs.append(cur); cur = []
            continue
        cur.append((x, y))
    if cur: runs.append(cur)
    n = sum(len(r) for r in runs)
    return runs, n, colours


def measure(path):
    runs, n, colours = stitch_paths(path)
    pts = [p for r in runs for p in r]
    if len(pts) < 50:
        return None
    xs = [p[0] for p in pts]; ys = [p[1] for p in pts]
    w_mm = (max(xs) - min(xs)) * U
    h_mm = (max(ys) - min(ys)) * U
    if w_mm < 5 or h_mm < 5:
        return None

    W = max(16, int(w_mm * PPM)); H = max(16, int(h_mm * PPM))
    im = Image.new('L', (W + 4, H + 4), 0)
    d = ImageDraw.Draw(im)
    sx, sy = min(xs), min(ys)
    lw = max(1, int(round(THREAD_MM * PPM)))
    for r in runs:
        if len(r) < 2:
            continue
        d.line([(2 + (px - sx) * U * PPM, 2 + (py - sy) * U * PPM) for px, py in r],
               fill=255, width=lw, joint='curve')
    # close pinholes between adjacent fill rows so a filled region reads as solid
    im = im.filter(ImageFilter.MaxFilter(3)).filter(ImageFilter.MinFilter(3))
    m = np.asarray(im) > 127

    px_mm2 = (1.0 / PPM) ** 2
    area_mm2 = float(m.sum()) * px_mm2
    e = m & ~(np.asarray(Image.fromarray((m * 255).astype(np.uint8))
                         .filter(ImageFilter.MinFilter(3))) > 127)
    outline_mm = float(e.sum()) / PPM
    equal_circle = 2.0 * math.sqrt(math.pi * max(area_mm2, 1.0))
    return {
        'file': os.path.basename(path),
        'stitches': n, 'threads': colours + 1,
        'w_in': w_mm / 25.4, 'h_in': h_mm / 25.4,
        'area_in2': area_mm2 / 645.16,
        'outline_in': outline_mm / 25.4,
        'complexity': outline_mm / equal_circle if equal_circle else 0.0,
        'coverage': area_mm2 / max(w_mm * h_mm, 1.0),
    }


def r2(y, yh):
    y = np.asarray(y, float); yh = np.asarray(yh, float)
    ss = ((y - y.mean()) ** 2).sum()
    return 1.0 - ((y - yh) ** 2).sum() / ss if ss else 0.0


def main():
    args = sys.argv[1:]
    if args == ['-']:
        args = [l.strip() for l in sys.stdin if l.strip()]
    rows = []
    for p in args:
        try:
            r = measure(p)
        except Exception as ex:
            print(f'  skip {os.path.basename(p)[:40]}: {type(ex).__name__}', file=sys.stderr); continue
        if r: rows.append(r)
    # The same design is often stored several times over (size folders, format
    # bundles, backups). Counting a duplicate twice silently weights whatever
    # happens to be copied most, so identity is (stitches, area), not filename.
    seen, uniq = set(), []
    for r in rows:
        key = (r['stitches'], round(r['area_in2'], 2))
        if key in seen:
            continue
        seen.add(key); uniq.append(r)
    dupes = len(rows) - len(uniq)
    rows = uniq
    if len(rows) < 3:
        sys.exit(f'need at least 3 readable files, got {len(rows)}')

    y = np.array([r['stitches'] for r in rows], float)
    A = np.array([r['area_in2'] for r in rows], float)
    Wd = np.array([r['w_in'] for r in rows], float)
    O = np.array([r['outline_in'] for r in rows], float)

    fits = {}
    a, *_ = np.linalg.lstsq(A[:, None], y, rcond=None); fits['area'] = (r2(y, A * a[0]), {'per_in2': a[0]})
    a, *_ = np.linalg.lstsq(Wd[:, None], y, rcond=None); fits['linear'] = (r2(y, Wd * a[0]), {'per_in_width': a[0]})
    M = np.column_stack([A, O])
    c, *_ = np.linalg.lstsq(M, y, rcond=None); fits['physical'] = (r2(y, M @ c), {'fill_per_in2': c[0], 'satin_per_in': c[1]})

    # k as a FUNCTION of the design, not a constant: density per square inch
    # varies with how detailed the design is and how many threads it carries.
    # This is the model the estimator wants, if it earns its extra parameters.
    C = np.array([r['complexity'] for r in rows], float)
    T = np.array([r['threads'] for r in rows], float)
    V = np.array([r['coverage'] for r in rows], float)
    M2 = np.column_stack([A, A * C, A * T, A * V])
    c2, *_ = np.linalg.lstsq(M2, y, rcond=None)
    fits['k(design)'] = (r2(y, M2 @ c2), {'base': c2[0], 'per_cplx': c2[1],
                                          'per_thread': c2[2], 'per_cov': c2[3]})
    globals()['_M2'], globals()['_c2'] = M2, c2

    print(f'\n  {len(rows)} distinct designs fitted'
          + (f'  ({dupes} duplicate copies collapsed)' if dupes else '') + '\n')
    print(f"  {'design':38} {'in':>5} {'sts':>7} {'cplx':>5} {'cov':>5} {'thr':>4}")
    for r in sorted(rows, key=lambda r: -r['stitches'])[:14]:
        print(f"  {r['file'][:38]:38} {r['w_in']:5.2f} {r['stitches']:7,} "
              f"{r['complexity']:5.1f} {r['coverage']:5.2f} {r['threads']:4d}")
    if len(rows) > 14:
        print(f"  ... and {len(rows)-14} more")

    print('\n  MODEL FITS')
    for name, (score, coef) in sorted(fits.items(), key=lambda kv: -kv[1][0]):
        cs = '  '.join(f'{k}={v:,.0f}' for k, v in coef.items())
        print(f"    {name:9} R2={score:6.3f}   {cs}")

    # How wrong is the usable model on a typical design? That spread is the
    # quote range, and it is the honest one — it is measured, not assumed.
    best_name = max(fits.items(), key=lambda kv: kv[1][0])[0]
    pred = (_M2 @ _c2) if best_name == 'k(design)' else A * fits['area'][1]['per_in2']
    err = np.abs(pred - y) / y
    print(f"\n  ERROR of the best model ({best_name}) on these designs")
    for q in (50, 75, 90):
        print(f"    {q}th percentile   {np.percentile(err, q)*100:5.1f}%")
    print(f"    worst            {err.max()*100:5.1f}%")

    # The number that decides whether this can price a job: not R2, not average
    # error, but how often it picks the right rung of the actual price ladder.
    # Bands are wide, so an estimate can be wrong and the PRICE still right.
    BANDS = [8000, 10000, 14000, 22000, 25000]
    def band(n):
        for i, b in enumerate(BANDS):
            if n <= b: return i
        return len(BANDS)
    tb = [band(v) for v in y]
    pb = [band(v) for v in pred]
    exact = sum(1 for a_, b_ in zip(tb, pb) if a_ == b_)
    under = sum(1 for a_, b_ in zip(tb, pb) if b_ < a_)
    over = sum(1 for a_, b_ in zip(tb, pb) if b_ > a_)
    n_ = len(tb)
    print(f"\n  PRICE BAND accuracy against the live ladder")
    print(f"    right band        {exact*100//n_}%  ({exact}/{n_})")
    print(f"    UNDER-priced      {under*100//n_}%  ({under}) — the ones that cost money")
    print(f"    over-priced       {over*100//n_}%  ({over})")
    # and if the estimate is deliberately rounded up one band when close
    pb2 = [band(v * 1.25) for v in pred]
    u2 = sum(1 for a_, b_ in zip(tb, pb2) if b_ < a_)
    print(f"    under-priced if quoted +25%:  {u2*100//n_}%  ({u2})")

    best = max(fits.items(), key=lambda kv: kv[1][0])
    print(f"\n  best: {best[0]}  (R2 {best[1][0]:.3f})")
    if best[1][0] < 0.75:
        print('  NOT GOOD ENOUGH TO PRICE FROM — size and shape alone do not')
        print('  explain these counts; density and detail vary too much between designs.')


if __name__ == '__main__':
    main()
