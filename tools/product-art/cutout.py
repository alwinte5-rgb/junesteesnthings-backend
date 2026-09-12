"""Turn an S&S product photo into a Lumise stage image.

The photo is shot on white. The background has to go, but a plain
"white pixels are background" rule eats the white parts of a white garment and
the highlights on every other one. So the background is found by flooding IN
from the border: only white that is CONNECTED to the edge is background, which
leaves an interior white panel or a specular highlight alone.
"""
import sys
from collections import deque
import numpy as np
from PIL import Image, ImageFilter


def cutout(path, out, white=238, feather=1.0, pad=0.02):
    im = Image.open(path).convert('RGB')
    a = np.asarray(im).astype(np.int16)
    h, w, _ = a.shape

    # Near-white AND near-neutral: a pale garment colour is not background.
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
