"""Installs the art-director-approved AI-generated ability icons into public/assets/img/hud/ability-icons-ai/.
Run: python3 -I tools/assets/icon-gen/install-ai-ability-icons.py <approval.json> [<approval.json> ...] [--check]
Each approval.json maps slot (hyphens or underscores; slots not in SLOTS are skipped) -> {approved: <png path relative to that json>, reviewer, date, beats_shipped} (the SDXL batch fetch layout).
Fails closed: reviewer must be art-director, beats_shipped true, source a 512x512 PNG. Resizes to 128x128 (Lanczos) with Pillow,
writes <slot>.png, index.json (sha256 per file), CREDITS.txt, and merges the approvals into tools/assets/icon-gen/provenance/ai-approval.json.
--check is a dry run (prints the plan). Own AI-generated work (SDXL on the project GPU box), no third-party licence.
"""
import hashlib, io, json, os, sys
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "..", "..", "..", "public", "assets", "img", "hud", "ability-icons-ai")
APPROVAL_REL = "tools/assets/icon-gen/provenance/ai-approval.json"
SLOTS = ["ember_bite", "gale_talon", "tide_surge", "hurl_rock", "lure_orb",
         "mycelium_mend", "stinging_filament", "stoop", "forge_gore", "tusk_gore", "boulder_roll"]
SIDE = 128


def load(paths):
    approvals, jobs = {}, []
    for p in paths:
        base = os.path.dirname(os.path.abspath(p))
        for name, a in json.load(open(p)).items():
            slot = name.replace("-", "_")  # approvals name abilities with hyphens
            if slot not in SLOTS:
                print(f"skip {name}: not an installable slot (no ability icon wired)", file=sys.stderr)
                continue
            if slot in approvals:
                raise SystemExit(f"{slot}: approved twice")
            if not a.get("approved"):
                raise SystemExit(f"{slot}: approval has no approved file")
            if a.get("reviewer") != "art-director" or a.get("beats_shipped") is not True or not a.get("date"):
                raise SystemExit(f"{slot}: not approved by the art-director (reviewer/beats_shipped/date)")
            src = os.path.normpath(os.path.join(a.get("dir") or base, a["approved"]))  # optional "dir" (absolute) as in the batch fetch layout
            im = Image.open(src)
            if im.format != "PNG" or im.size != (512, 512):
                raise SystemExit(f"{slot}: {src} is not a 512x512 PNG")
            buf = io.BytesIO()
            im.convert("RGBA").resize((SIDE, SIDE), Image.LANCZOS).save(buf, "PNG", optimize=True)
            approvals[slot] = {"approved": os.path.basename(src), "reviewer": a["reviewer"], "date": a["date"], "beats_shipped": True}
            jobs.append((slot, buf.getvalue()))
    missing = [s for s in SLOTS if s not in approvals]
    if missing:
        raise SystemExit(f"missing approvals for {missing}")
    return approvals, sorted(jobs)


def main():
    args = [x for x in sys.argv[1:] if not x.startswith("--")]
    if not args or any(x.startswith("--") and x != "--check" for x in sys.argv[1:]):
        raise SystemExit(__doc__)
    approvals, jobs = load(args)
    index = {slot: {"url": f"img/hud/ability-icons-ai/{slot}.png", "w": SIDE, "h": SIDE, "sha256": hashlib.sha256(data).hexdigest(),
                    "source": approvals[slot]["approved"], "approval": {**approvals[slot], "file": APPROVAL_REL}} for slot, data in jobs}
    if "--check" in sys.argv:
        print(json.dumps(index, indent=2))
        return
    os.makedirs(OUT, exist_ok=True)
    for slot, data in jobs:
        open(os.path.join(OUT, f"{slot}.png"), "wb").write(data)
    os.makedirs(os.path.join(HERE, "provenance"), exist_ok=True)
    with open(os.path.join(HERE, "provenance", "ai-approval.json"), "w") as f:
        json.dump({s: approvals[s] for s in SLOTS}, f, indent=2)
        f.write("\n")
    open(os.path.join(OUT, "index.json"), "w").write(json.dumps({"licence": "own work (AI-generated, SDXL on the project GPU box)", "icons": index}, indent=2) + "\n")
    open(os.path.join(OUT, "CREDITS.txt"), "w").write(
        "Ability icons: AI-generated (SDXL, own work, no third-party art), resized to 128 px by tools/assets/icon-gen/install-ai-ability-icons.py.\n"
        "Approved by the art-director agent, see tools/assets/icon-gen/provenance/ai-approval.json. No attribution required.\n")
    print(f"installed {len(jobs)} icons to {os.path.normpath(OUT)}")


if __name__ == "__main__":
    main()
