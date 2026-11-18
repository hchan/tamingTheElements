#!/usr/bin/env python3
"""Draw a Canny-style control image for Glimmaw (anglerfish facing right, lure on a stalk).

SDXL text2img never produced the lure (0 of 30+ tries), so the silhouette is given to a
Canny ControlNet instead. White lines on black, 1024x1024. Usage:
  python3 make-glimmaw-control.py OUT.png
"""
import sys
from PIL import Image, ImageDraw

W = 1024
im = Image.new("L", (W, W), 0)
d = ImageDraw.Draw(im)
T = 5  # line width

# body (facing right): big rounded head on the right, tapering tail to the left
d.ellipse((330, 430, 830, 800), outline=255, width=T)
d.polygon([(340, 560), (130, 470), (190, 620), (130, 760), (350, 690)], outline=255, width=T)  # tail fan
d.arc((170, 540, 340, 700), 90, 270, fill=255, width=T)
# dorsal and ventral fins
d.polygon([(480, 440), (540, 340), (640, 330), (650, 445)], outline=255, width=T)
d.polygon([(520, 790), (470, 890), (610, 860), (650, 795)], outline=255, width=T)
# pectoral fin
d.polygon([(560, 640), (470, 720), (590, 740), (650, 660)], outline=255, width=T)
# open jaws with teeth (right side)
d.line([(830, 610), (700, 640)], fill=255, width=T)
d.line([(830, 610), (940, 560), (900, 520)], fill=255, width=T)  # upper jaw
d.line([(830, 640), (930, 720), (880, 770), (740, 760)], fill=255, width=T)  # lower jaw
for i in range(5):
    x = 725 + i * 35
    d.polygon([(x, 640 - i * 2), (x + 10, 690), (x + 20, 636 - i * 2)], outline=255, width=3)  # lower teeth
for i in range(4):
    x = 845 + i * 25
    d.polygon([(x, 590 - i * 12), (x + 8, 640 - i * 6), (x + 18, 585 - i * 12)], outline=255, width=3)  # upper teeth
# eye
d.ellipse((690, 500, 750, 560), outline=255, width=T)
d.ellipse((710, 520, 732, 542), fill=255)
# stalk (illicium) arching up and forward, lure bulb at the end
d.arc((560, 120, 900, 520), 180, 300, fill=255, width=T + 3)
d.line([(730, 135), (800, 160)], fill=255, width=T + 3)
d.ellipse((780, 150, 880, 250), outline=255, width=T)
d.ellipse((805, 175, 855, 225), outline=255, width=3)
im.save(sys.argv[1])
print("wrote", sys.argv[1])
