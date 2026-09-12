#!/usr/bin/env python3
"""Read a Tajima DST and report what is actually in it.

    python3 tools/embroidery/read_dst.py design.DST

No dependency: DST is a 512-byte ASCII header followed by 3-byte records, and
a reader is shorter than the argument about adding a library for it.

Record decoding is the standard Tajima ternary encoding — each byte carries
signed contributions of 1, 3, 9, 27 and 81 units, and a unit is 0.1mm. The
flag byte separates a stitch from a jump, a colour change and the end.

The header's own ST: field is read too and compared with the records counted.
A file whose header disagrees with its body is a file to distrust, and that is
worth knowing before it is used to price anything.
"""
import os, re, sys

U = 0.1  # one coordinate unit, in mm


def _delta(b0, b1, b2):
    x = y = 0
    if b0 & 0x01: y += 1
    if b0 & 0x02: y -= 1
    if b0 & 0x04: y += 9
    if b0 & 0x08: y -= 9
    if b0 & 0x10: x += 9
    if b0 & 0x20: x -= 9
    if b0 & 0x40: x += 1
    if b0 & 0x80: x -= 1
    if b1 & 0x01: y += 3
    if b1 & 0x02: y -= 3
    if b1 & 0x04: y += 27
    if b1 & 0x08: y -= 27
    if b1 & 0x10: x += 27
    if b1 & 0x20: x -= 27
    if b1 & 0x40: x += 3
    if b1 & 0x80: x -= 3
    if b2 & 0x04: y += 81
    if b2 & 0x08: y -= 81
    if b2 & 0x10: x += 81
    if b2 & 0x20: x -= 81
    return x, y


def read(path):
    raw = open(path, 'rb').read()
    head = raw[:512].decode('latin-1', 'replace')
    hdr = dict(re.findall(r'([A-Z+\-]{2}):\s*([^\r\n\x1a]*)', head))

    x = y = 0
    xs, ys = [], []
    stitches = jumps = colours = 0
    lens = []
    body = raw[512:]
    for i in range(0, len(body) - 2, 3):
        b0, b1, b2 = body[i], body[i + 1], body[i + 2]
        if (b2 & 0xF3) == 0xF3:
            break
        dx, dy = _delta(b0, b1, b2)
        x += dx; y += dy
        if (b2 & 0xC3) == 0xC3:
            colours += 1
            continue
        if (b2 & 0x83) == 0x83:
            jumps += 1
            continue
        stitches += 1
        xs.append(x); ys.append(y)
        lens.append((dx * dx + dy * dy) ** 0.5 * U)

    w = (max(xs) - min(xs)) * U if xs else 0
    h = (max(ys) - min(ys)) * U if ys else 0
    declared = None
    if 'ST' in hdr:
        try: declared = int(re.sub(r'\D', '', hdr['ST']) or 0)
        except ValueError: declared = None
    body_len = [l for l in lens if l > 0]
    return {
        'file': os.path.basename(path),
        'name': (hdr.get('LA') or '').strip(),
        'stitches': stitches,
        'declared_stitches': declared,
        'jumps': jumps,
        'colour_changes': colours,
        'width_mm': round(w, 1), 'height_mm': round(h, 1),
        'width_in': round(w / 25.4, 2), 'height_in': round(h / 25.4, 2),
        'avg_stitch_mm': round(sum(body_len) / len(body_len), 2) if body_len else 0,
    }


def main():
    if len(sys.argv) < 2:
        sys.exit('usage: read_dst.py <file.DST>')
    r = read(sys.argv[1])
    print(f"\n  {r['file']}   {r['name']}")
    print(f"  {r['width_mm']}mm x {r['height_mm']}mm   ({r['width_in']}in x {r['height_in']}in)\n")
    print(f"    stitches          {r['stitches']:,}")
    if r['declared_stitches'] is not None:
        ok = 'matches header' if abs(r['declared_stitches'] - r['stitches']) <= 2 \
            else f"HEADER DISAGREES (says {r['declared_stitches']:,})"
        print(f"    header ST:        {r['declared_stitches']:,}  — {ok}")
    print(f"    jumps             {r['jumps']:,}")
    print(f"    colour changes    {r['colour_changes']}")
    print(f"    avg stitch        {r['avg_stitch_mm']}mm")
    area_in2 = (r['width_in'] * r['height_in']) or 1
    print(f"\n    density           {int(r['stitches']/area_in2):,} stitches per sq in of bounding box")


if __name__ == '__main__':
    main()
