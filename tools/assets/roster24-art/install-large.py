"""Install the 12 art-director-approved roster24 Large portraits into public/assets/img/map/.

Run from the repo root:  python -I tools/assets/roster24-art/install-large.py [--record]

Sources: tools/assets/roster24-art/approved-large/<hero>Large.png (umbrel: umbrelLarge-r2.png, the file named in approval.json).
Provenance: tools/assets/roster24-art/install-large-provenance.json (source + shipped sha256, size).
Without --record the source sha256 must match the provenance (an edited approved file is refused).
Director notes applied: Zephra keeps >= 6 px transparent margin around the wing tip; Abyssor alpha below 8 is zeroed.
No rescaling: the approved files keep their own size (fit-to-box was not needed, none exceeds 420x412).
"""
import hashlib
import json
import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[3]
SRC = ROOT / "tools/assets/roster24-art/approved-large"
OUT = ROOT / "public/assets/img/map"
PROV = ROOT / "tools/assets/roster24-art/install-large-provenance.json"
HEROES = "vortigal kindrel nykra ouroth brazgor umbrel hyalia quarrak glimmaw zephra abyssor durrok".split()
MIN_MARGIN = 6


def sha(b: bytes) -> str:
    return hashlib.sha256(b).hexdigest()


def src_name(approval: dict, hero: str) -> str:
    return approval["r24-large"][hero].get("file", f"{hero}Large.png")


def process(hero: str, im: Image.Image) -> Image.Image:
    im = im.convert("RGBA")
    if hero == "abyssor":
        r, g, b, a = im.split()
        a = a.point(lambda v: 0 if v < 8 else v)
        im = Image.merge("RGBA", (r, g, b, a))
    if hero == "zephra":
        bbox = im.getchannel("A").getbbox()
        w, h = im.size
        if bbox and min(bbox[0], bbox[1], w - bbox[2], h - bbox[3]) < MIN_MARGIN:
            pad = MIN_MARGIN - min(bbox[0], bbox[1], w - bbox[2], h - bbox[3])
            canvas = Image.new("RGBA", (w + 2 * pad, h + 2 * pad), (0, 0, 0, 0))
            canvas.paste(im, (pad, pad))
            im = canvas
    return im


def main() -> int:
    record = "--record" in sys.argv
    approval = json.loads((SRC / "approval.json").read_text())
    prov = {} if record or not PROV.exists() else json.loads(PROV.read_text())
    out_prov = {}
    for hero in HEROES:
        a = approval["r24-large"][hero]
        if a["verdict"] != "APPROVE" or a["reviewer"] != "art-director":
            print(f"{hero}: not approved", file=sys.stderr)
            return 1
        raw = (SRC / src_name(approval, hero)).read_bytes()
        s = sha(raw)
        with Image.open(SRC / src_name(approval, hero)) as im0:
            size = list(im0.size)
        if not record and (prov.get(hero, {}).get("source_sha256") != s or prov[hero].get("source_size") != size):
            print(f"{hero}: source sha256/size differs from provenance (use --record to accept)", file=sys.stderr)
            return 1
        with Image.open(SRC / src_name(approval, hero)) as im0:
            out = process(hero, im0)
        dest = OUT / f"{hero}Large.png"
        out.save(dest, optimize=True)
        data = dest.read_bytes()
        out_prov[hero] = {
            "source": f"approved-large/{src_name(approval, hero)}",
            "source_sha256": s,
            "source_size": size,
            "sha256": sha(data),
            "size": list(out.size),
            "approval": {k: a[k] for k in ("verdict", "overall", "reviewer", "date")},
        }
        print(f"{hero}: {size} -> {list(out.size)} {out_prov[hero]['sha256'][:12]}")
    if record or not PROV.exists():
        PROV.write_text(json.dumps(out_prov, indent=1) + "\n")
    elif {h: v["sha256"] for h, v in prov.items()} != {h: v["sha256"] for h, v in out_prov.items()}:
        print("shipped sha256 differs from provenance (non-deterministic encode? use --record)", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
