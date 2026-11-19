#!/usr/bin/env python3
"""Pre-renders anti-aliased glyph atlases (DejaVu Sans/Serif, free license) and the logo for gui.js. Run on a dev machine; output is committed.
usage: python3 mkfonts.py  ->  fonts.json.gz, logo-*.raw"""
import glob, gzip, json, base64, sys
from PIL import Image, ImageDraw, ImageFont
def find(n): return glob.glob('/usr/share/fonts/**/' + n, recursive=True)[0]
FACES = {'sans': 'DejaVuSans.ttf', 'bold': 'DejaVuSans-Bold.ttf', 'serif': 'DejaVuSerif.ttf'}
SIZES = {'s': [12, 14, 16, 20], 'bold': [12, 14, 16, 20], 'serif': [20, 26, 34, 52]}
out = {}
for scale in (1, 1.5, 2):
    for face, fn in FACES.items():
        for sz in SIZES[{'sans': 's', 'bold': 'bold', 'serif': 'serif'}[face] if False else ('s' if face == 'sans' else face)]:
            px = round(sz * scale); f = ImageFont.truetype(find(fn), px); asc, desc = f.getmetrics(); g = {}
            for c in list(range(32, 127)) + [0xb7, 0xb0, 0x2193, 0x2191, 0x2022]:
                ch = chr(c); adv = f.getlength(ch); im = Image.new('L', (px * 2, asc + desc + 4), 0); ImageDraw.Draw(im).text((0, 0), ch, font=f, fill=255); bb = im.getbbox()
                if not bb: g[c] = [round(adv, 2), 0, 0, 0, 0, '']; continue
                cr = im.crop(bb); g[c] = [round(adv, 2), cr.width, cr.height, bb[0], bb[1], base64.b64encode(cr.tobytes()).decode()]
            out['%s%d@%s' % (face, sz, scale)] = {'h': asc + desc, 'asc': asc, 'g': g}
with gzip.open('fonts.json.gz', 'wt') as fh: json.dump(out, fh, separators=(',', ':'))
# logo (butter block) from the real logo.svg, transparent background
from playwright.sync_api import sync_playwright
svg = open('../web/logo.svg').read()
with sync_playwright() as p:
    b = p.chromium.launch()
    for n in (32, 48, 64, 96):
        pg = b.new_page(viewport={'width': n, 'height': n}); pg.set_content('<body style="margin:0;background:transparent"><div style="width:%dpx;height:%dpx">%s</div><style>svg{width:100%%;height:100%%}</style>' % (n, n, svg)); pg.screenshot(path='/tmp/lg.png', omit_background=True)
        im = Image.open('/tmp/lg.png').convert('RGBA'); open('logo-%d.raw' % n, 'wb').write(im.tobytes())
