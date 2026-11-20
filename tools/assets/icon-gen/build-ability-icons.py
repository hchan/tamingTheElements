"""Builds the six ability-icon candidates (4 per slot) into <free-art>/trackA and a contact sheet.
Run: python3 -I tools/assets/icon-gen/build-ability-icons.py <free-art dir>. Approved picks are installed by install-ability-icons.py."""
import os, sys, importlib.util
from PIL import Image, ImageDraw, ImageFont
FA = sys.argv[1]
spec = importlib.util.spec_from_file_location("adapt", os.path.join(os.path.dirname(os.path.abspath(__file__)), "adapt.py")); A = importlib.util.module_from_spec(spec); spec.loader.exec_module(A)
SLOTS = {
 "hurl_rock": ["part2/rock-plain-3","part2/rock-orange-3","part3/explosion-orange-3","part4/air-burst-sky-3"],
 "lure_orb": ["part1/enchant-orange-3","part1/evil-eye-red-3","part4/light-eerie-3","part3/runes-orange-3"],
 "skitter": ["part2/haste-sky-3","part2/haste-royal-3","part4/wind-grasp-sky-3","part3/wild-jade-3"],
 "slow": ["part4/fog-sky-3","part4/link-eerie-3","part4/needles-sky-3","part4/fog-water-air-3"],
 "hoof_crash": ["part3/explosion-orange-3","part2/rock-acid-3","part4/rip-sky-3","part3/wild-orange-3"],
 "talon_rake": ["part4/rip-sky-3","part4/slice-orange-3","part4/needles-fire-3","part4/wind-grasp-eerie-3"],
}
sheet = Image.open(A.SHEET).convert("RGB"); bronze = A.border_colour(sheet)
def load(rel):
    part, n = rel.split("/"); p = os.path.join(A.SRC, part, n + ".png")
    if not os.path.exists(p): p = os.path.join(A.SRC, part, "painterly-spell-icons-4", n + ".png")
    return Image.open(p)
out = os.path.join(FA, "trackA"); font = ImageFont.load_default()
ref = Image.open(os.path.join(FA, "candidates", "regrade", "fire.png")).convert("RGB")
cell, pad, lab, S = 128, 8, 14, 59
W = pad + 5*(cell+pad) + 5*(S+4) + pad + 4
rows = []
H = pad + len(SLOTS)*(cell+lab+pad) + 0
img = Image.new("RGB", (W, H), (18,17,16)); d = ImageDraw.Draw(img)
for r, (slot, cands) in enumerate(SLOTS.items()):
    y = pad + r*(cell+lab+pad)
    tiles = []
    for i, rel in enumerate(cands, 1):
        t = A.regrade(load(rel), slot, 700+r*10+i, bronze)
        t.save(os.path.join(out, f"{slot}-c{i}-{rel.split('/')[1]}.png")); tiles.append((rel.split('/')[1], t))
    d.text((pad, y), f"{slot} | 128px c1-c4 | fire (approved generic) | 59px c1-c4 + fire", fill=(220,215,200), font=font)
    x = pad
    for n, t in tiles + [("fire (approved)", ref)]:
        img.paste(t.resize((cell,cell), Image.LANCZOS), (x, y+lab)); d.text((x+2, y+lab+cell-12), n[:20], fill=(255,255,255), font=font); x += cell+pad
    x += 4
    for n, t in tiles + [("fire", ref)]:
        img.paste(t.resize((S,S), Image.LANCZOS), (x, y+lab)); x += S+4
img.save(os.path.join(out, "sheet.png")); print(img.size, bronze)
