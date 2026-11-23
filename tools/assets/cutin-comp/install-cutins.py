"""Install the 12 art-director-approved roster24 super cut-in composites (1344x768) as public/assets/img/cutin/<hero>.png.

Run: python3 -I tools/assets/cutin-comp/install-cutins.py <r24-cutin-comp-dir> [out-dir] [--pin]
Copies the chosen cutin_comp_*.png byte for byte (no resize or re-encode), checks each is a 1344x768 PNG and, unless --pin,
that its sha256 equals provenance/pins.json. --pin rewrites pins.json from the sources (use only after a new approval).
"""
import hashlib
import json
import struct
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
PINS = HERE / "provenance" / "pins.json"
# hero: source file (round suffix per art-director approval.json round 3)
SOURCES = {
    "abyssor": "cutin_comp_abyssor.png", "brazgor": "cutin_comp_brazgor_r2.png", "durrok": "cutin_comp_durrok_r2.png",
    "glimmaw": "cutin_comp_glimmaw.png", "hyalia": "cutin_comp_hyalia.png", "kindrel": "cutin_comp_kindrel.png",
    "nykra": "cutin_comp_nykra_r3.png", "ouroth": "cutin_comp_ouroth_r2.png", "quarrak": "cutin_comp_quarrak.png",
    "umbrel": "cutin_comp_umbrel_r2.png", "vortigal": "cutin_comp_vortigal.png", "zephra": "cutin_comp_zephra_r2.png",
}


def main(argv: list[str]) -> None:
    args = [a for a in argv[1:] if a != "--pin"]
    if not args:
        raise SystemExit(__doc__)
    src_dir = Path(args[0])
    out_dir = Path(args[1]) if len(args) > 1 else Path("public/assets/img/cutin")
    pin = "--pin" in argv
    pins = {} if pin else json.loads(PINS.read_text())
    out_dir.mkdir(parents=True, exist_ok=True)
    new = {}
    for hero, name in sorted(SOURCES.items()):
        data = (src_dir / name).read_bytes()
        if data[1:4] != b"PNG" or struct.unpack(">II", data[16:24]) != (1344, 768):
            raise SystemExit(f"{name}: not a 1344x768 PNG")
        digest = hashlib.sha256(data).hexdigest()
        if not pin and pins.get(hero, {}).get("sha256") != digest:
            raise SystemExit(f"{name}: sha256 {digest} != pin")
        (out_dir / f"{hero}.png").write_bytes(data)
        new[hero] = {"source": name, "sha256": digest}
        print(f"{hero}: {name} {digest[:12]}")
    if pin:
        PINS.write_text(json.dumps(new, indent=1) + "\n")


if __name__ == "__main__":
    main(sys.argv)
