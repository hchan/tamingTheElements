"""Installs the art-director-approved ability icons into public/assets/img/hud/ability-icons/.
Run: python3 -I tools/assets/icon-gen/install-ability-icons.py <src dir with <slot>-cN-<name>.png> <approval.json> [--check]
Fails closed: every slot needs reviewer art-director, beats_shipped true and a candidate file named after the approved pick.
--check is a dry run (prints the plan). Also copies the approval to tools/assets/icon-gen/provenance/approval.json.
Writes <slot>.png (64x64, as built by build-ability-icons.py: copied byte for byte), index.json (sha256 per file) and CREDITS.txt.
"""
import hashlib, json, os, re, sys

SLOTS = ["hurl_rock", "lure_orb", "skitter", "slow", "hoof_crash", "talon_rake"]
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "..", "..", "..", "public", "assets", "img", "hud", "ability-icons")
APPROVAL_REL = "tools/assets/icon-gen/provenance/approval.json"
CREDIT = "J. W. Bjerk (eleazzaar) -- www.jwbjerk.com/art -- find this and other open art at: http://opengameart.org"


def png_size(b):
    return int.from_bytes(b[16:20], "big"), int.from_bytes(b[20:24], "big")


def plan(src, approval):
    jobs = []
    for slot in SLOTS:
        a = approval.get(slot)
        if not a or a.get("reviewer") != "art-director" or a.get("beats_shipped") is not True:
            raise SystemExit(f"{slot}: not approved by the art-director (reviewer/beats_shipped)")
        if not isinstance(a.get("approved"), str) or not a["approved"] or not isinstance(a.get("date"), str) or not a["date"]:
            raise SystemExit(f"{slot}: approval needs non-empty approved and date")
        hits = [f for f in os.listdir(src) if re.fullmatch(re.escape(slot) + r"-c\d-" + re.escape(a["approved"]) + r"\.png", f)]
        if len(hits) != 1:
            raise SystemExit(f"{slot}: expected exactly one candidate for {a['approved']}, found {hits}")
        data = open(os.path.join(src, hits[0]), "rb").read()
        if data[:8] != b"\x89PNG\r\n\x1a\n" or png_size(data) != (64, 64):
            raise SystemExit(f"{slot}: {hits[0]} is not a 64x64 PNG")
        jobs.append((slot, a, hits[0], data))
    return jobs


def main():
    args = [x for x in sys.argv[1:] if not x.startswith("--")]
    if len(args) != 2 or any(x.startswith("--") and x != "--check" for x in sys.argv[1:]):
        raise SystemExit(__doc__)
    jobs = plan(args[0], json.load(open(args[1])))
    index = {}
    for slot, a, name, data in jobs:
        index[slot] = {"url": f"img/hud/ability-icons/{slot}.png", "w": 64, "h": 64, "sha256": hashlib.sha256(data).hexdigest(),
                       "pack_icon": a["approved"], "approval": {"reviewer": a["reviewer"], "date": a["date"], "beats_shipped": True, "file": APPROVAL_REL}}
    if "--check" in sys.argv:  # dry run: prints the plan, writes nothing
        print(json.dumps(index, indent=2))
        return
    os.makedirs(OUT, exist_ok=True)
    for slot, a, name, data in jobs:
        open(os.path.join(OUT, f"{slot}.png"), "wb").write(data)
    os.makedirs(os.path.join(HERE, "provenance"), exist_ok=True)
    with open(os.path.join(HERE, "provenance", "approval.json"), "w") as f:
        json.dump(json.load(open(args[1])), f, indent=2)
        f.write("\n")
    open(os.path.join(OUT, "index.json"), "w").write(json.dumps({"licence": "CC-BY 3.0", "icons": index}, indent=2) + "\n")
    open(os.path.join(OUT, "CREDITS.txt"), "w").write(
        "Ability icons: adapted (regraded to the action-bar look, 64 px, bronze border) from OpenGameArt \"Painterly Spell Icons\" parts 1-4.\n"
        f"{CREDIT}\nPack pages: https://opengameart.org/content/painterly-spell-icons-part-1 (parts 1-4)\nLicence: CC-BY 3.0 (http://creativecommons.org/licenses/by/3.0/). Changes were made.\nSee tools/assets/icon-gen/README.md.\n")
    print(f"installed {len(jobs)} icons to {os.path.normpath(OUT)}")


if __name__ == "__main__":
    main()
