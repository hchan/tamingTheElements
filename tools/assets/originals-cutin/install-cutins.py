"""Install the 9 art-director-approved original-hero super cut-in composites (1344x768) as public/assets/img/cutin/<hero>.png.

Run: python3 -I tools/assets/originals-cutin/install-cutins.py <originals-cutin-dir> [out-dir] [--pin]
Per hero it refuses unless the approval file names exactly that source file with reviewer art-director, verdict APPROVE and
approved true; it checks a 1344x768 PNG (no resize or re-encode, bytes copied as is) and, unless --pin, the full sha256 in
provenance/pins.json. --pin rewrites pins.json from the sources (only after a new approval). Cyclonius and Fiara are rejected and
Echo is pending, so they are not listed: those heroes keep the generic band.
"""
import hashlib
import json
import struct
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
PROV = HERE / "provenance"
PINS = PROV / "pins.json"
# hero: (source file, approval file that approves it)
SOURCES = {
    "lavax": ("comp_lavax_B.png", "approval.json"),
    "sindarosa": ("comp_sindarosa.png", "approval.json"),
    "curomo": ("comp_curomo.png", "approval.json"),
    "ishimi": ("comp_ishimi.png", "approval.json"),
    "pax": ("comp_pax.png", "approval.json"),
    "rokcore": ("comp_rokcore.png", "approval.json"),
    "morblass": ("comp_morblass_B.png", "approval.json"),
    "treenoc": ("comp_treenoc_v2.png", "approval-v2.json"),
    "wispera": ("comp_wispera_v2.png", "approval-v2.json"),
}


def check_approval(hero: str, name: str, approval_file: str) -> None:
    entry = json.loads((PROV / approval_file).read_text()).get(hero, {})
    if (entry.get("file") != name or entry.get("reviewer") != "art-director" or entry.get("verdict") != "APPROVE"
            or entry.get("approved") is not True or entry.get("overall", 0) < 4):
        raise SystemExit(f"{hero}: {approval_file} does not approve {name} (art-director APPROVE, overall >= 4)")


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
    for hero, (name, approval_file) in sorted(SOURCES.items()):
        check_approval(hero, name, approval_file)
        data = (src_dir / name).read_bytes()
        if data[1:4] != b"PNG" or struct.unpack(">II", data[16:24]) != (1344, 768):
            raise SystemExit(f"{name}: not a 1344x768 PNG")
        digest = hashlib.sha256(data).hexdigest()
        if not pin and pins.get(hero, {}).get("sha256") != digest:
            raise SystemExit(f"{name}: sha256 {digest} != pin")
        (out_dir / f"{hero}.png").write_bytes(data)
        new[hero] = {"source": name, "approval": approval_file, "sha256": digest, "bytes": len(data)}
        print(f"{hero}: {name} {digest[:12]}")
    if pin:
        PINS.write_text(json.dumps(new, indent=1) + "\n")


if __name__ == "__main__":
    main(sys.argv)
