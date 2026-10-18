"""Contact sheets: each product's photo with every print placement drawn on it.

    python3 tools/product-art/placement-sheet.py <plan.json> <out-prefix> [--per=12]

<plan.json> is a list of {title, files: {front, back}, boxes: [{side, label,
cx, cy, w, h}]} in PHOTO pixels — what tools/lib/placements.js boxesFor()
returns, written by wire.js --sheet or tools/product-art/placements-check.js.
Every product is drawn front and back, side by side, boxes outlined and
labelled, so a person can see at a glance whether a chest logo sits on the
chest and clear of a zipper. Writes <out-prefix>-01.png, -02.png, ...
"""
import json
import sys

from PIL import Image, ImageDraw

COL = {'front': (230, 30, 30), 'back': (30, 90, 230), 'left_chest': (0, 160, 60),
       'right_chest': (200, 120, 0)}


def tile(item, T):
    """One product: front and back panels with its boxes, plus a title strip."""
    panels = []
    for side in ('front', 'back'):
        f = item['files'].get(side)
        if not f:
            continue
        im = Image.open(f).convert('RGBA')
        bg = Image.new('RGBA', im.size, (238, 238, 238, 255))
        bg.alpha_composite(im)
        d = ImageDraw.Draw(bg)
        W, H = im.size
        for b in item['boxes']:
            if b['side'] != side:
                continue
            c = COL.get(b['key'], (230, 30, 30))
            if 'ez' in b:
                # A stored Lumise edit zone, drawn as app.js draws it: centre =
                # image centre + (left, top) * u, size * u, u = W / product_width.
                u = W / float(b.get('pw') or 400)
                ez = b['ez']
                bw, bh = ez['width'] * u, ez['height'] * u
                x0, y0 = W / 2 + ez['left'] * u - bw / 2, H / 2 + ez['top'] * u - bh / 2
            else:
                bw, bh = b['w'], b['h']
                x0, y0 = b['cx'] - bw / 2, b['cy'] - bh / 2
            d.rectangle([x0, y0, x0 + bw, y0 + bh], outline=c + (255,), width=max(2, W // 160))
            d.text((x0 + 3, y0 + 2), b['label'], fill=c + (255,))
        bg.thumbnail((T, T))
        panels.append(bg.convert('RGB'))
    w = sum(p.size[0] for p in panels) + 6 * len(panels)
    out = Image.new('RGB', (max(w, T), T + 18), 'white')
    x = 0
    for p in panels:
        out.paste(p, (x, 18)); x += p.size[0] + 6
    ImageDraw.Draw(out).text((2, 2), item['title'][:70], fill='black')
    return out


def main():
    plan = json.load(open(sys.argv[1]))
    prefix = sys.argv[2]
    per = int(next((a.split('=')[1] for a in sys.argv[3:] if a.startswith('--per=')), 12))
    T, cols = 300, 3
    n = 0
    for i in range(0, len(plan), per):
        tiles = [tile(it, T) for it in plan[i:i + per]]
        cw = max(t.size[0] for t in tiles)
        rows = (len(tiles) + cols - 1) // cols
        sheet = Image.new('RGB', (cw * cols, (T + 24) * rows), 'white')
        for j, t in enumerate(tiles):
            sheet.paste(t, ((j % cols) * cw, (j // cols) * (T + 24)))
        n += 1
        sheet.save('%s-%02d.png' % (prefix, n))
    print('%d sheet(s), %d products' % (n, len(plan)))


if __name__ == '__main__':
    main()
