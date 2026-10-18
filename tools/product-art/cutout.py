"""Turn an S&S product photo into a Lumise stage image.

The photo is shot on white. The background has to go, but a plain
"white pixels are background" rule eats the white parts of a white garment and
the highlights on every other one. So the background is found by flooding IN
from the border: only white that is CONNECTED to the edge is background, which
leaves an interior white panel or a specular highlight alone.

WHITE GARMENTS (2026-10-18). A fixed "238 or brighter is background" cut ate
white shirts: their fabric is 240-250, touches the backdrop at the outline, and
the flood ran straight through it — #130's white tee kept 20% of itself, #131's
4%, and 41 products' White colour lost its outline. S&S's backdrop is one flat
shade (almost always 255; a few studios shoot on light grey), so background is
now "within a few steps of the backdrop's own shade", read from the photo's
border. Fabric shading sits further from it than that. Whatever near-white edge
survives is invisible: the design canvas behind a photo is white (app.js
stage_fill).
"""
import sys
from collections import deque
import numpy as np
from PIL import Image, ImageFilter


def backdrop_level(mn):
    """The backdrop's shade: the median darkest-channel value of the border."""
    border = np.concatenate([mn[0, :], mn[-1, :], mn[:, 0], mn[:, -1]])
    return int(np.median(border))


def cutout(path, out, tolerance=4, floor=200, feather=1.0, pad=0.02):
    im = Image.open(path).convert('RGB')
    a = np.asarray(im).astype(np.int16)
    h, w, _ = a.shape

    # Near the backdrop's own shade AND near-neutral: a pale garment colour,
    # and white fabric's shading, are not background.
    mx, mn = a.max(2), a.min(2)
    white = max(floor, backdrop_level(mn) - tolerance)
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

    alpha = np.where(bg, 0, 255).astype(np.uint8)
    am = Image.fromarray(alpha)
    if feather:
        am = am.filter(ImageFilter.GaussianBlur(feather))

    rgba = im.convert('RGBA')
    rgba.putalpha(am)

    box = rgba.getbbox()
    if box:
        px, py = int((box[2] - box[0]) * pad), int((box[3] - box[1]) * pad)
        box = (max(0, box[0] - px), max(0, box[1] - py),
               min(w, box[2] + px), min(h, box[3] + py))
        rgba = rgba.crop(box)
    rgba.save(out)
    cov = float((np.asarray(rgba)[:, :, 3] > 16).mean())
    print(f'  {out.split("/")[-1]:34} {rgba.size[0]}x{rgba.size[1]}  garment covers {cov*100:.0f}% of frame')
    return rgba


if __name__ == '__main__':
    cutout(sys.argv[1], sys.argv[2])
