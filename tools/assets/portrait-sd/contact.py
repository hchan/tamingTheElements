"""Contact sheet: original portrait | one or more SD variants per hero (e.g. orig | old SD | new SD).

Usage: python tools/assets/portrait-sd/contact.py OUT.png DIR[:label] [DIR[:label] ...]
Accepts both naming schemes in DIR: <hero>-sd.png (SD0 masters) and <hero>Large-sd.png (old set). Heroes = those in the last DIR.
The original is composited on mid grey so its transparency is visible.
"""
import os
import sys

from PIL import Image, ImageDraw

SRC = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "../../../public/assets/img/map"))
T = 320


def find(d, n):
    for suf in ("-sd.png", "Large-sd.png"):
        p = os.path.join(d, n + suf)
        if os.path.exists(p):
            return p
    return None


def main():
    out, dirs = sys.argv[1], [(a.split(":") + [a])[:2] for a in sys.argv[2:]]
    last = dirs[-1][0]
    names = sorted({f.split("-sd.png")[0].removesuffix("Large") for f in os.listdir(last) if f.endswith("-sd.png")})
    sheet = Image.new("RGB", (80 + T * (1 + len(dirs)), 18 + T * len(names)), (12, 12, 12))
    d = ImageDraw.Draw(sheet)
    d.text((84, 2), "orig", fill="white")
    for c, (_, label) in enumerate(dirs):
        d.text((84 + T * (c + 1), 2), label, fill="white")
    for r, n in enumerate(names):
        y = 18 + r * T
        d.text((4, y + T // 2), n, fill="white")
        old = Image.open(os.path.join(SRC, f"{n}Large.png")).convert("RGBA").resize((T, T), Image.LANCZOS)
        bg = Image.new("RGBA", (T, T), (110, 110, 110, 255))
        bg.alpha_composite(old)
        sheet.paste(bg.convert("RGB"), (80, y))
        for c, (dd, _) in enumerate(dirs):
            p = find(dd, n)
            if p:
                sheet.paste(Image.open(p).convert("RGB").resize((T, T), Image.LANCZOS), (80 + T * (c + 1), y))
    sheet.save(out)


if __name__ == "__main__":
    main()
