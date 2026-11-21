"""Hand-tunes the generated Umbrel anim (gen-r24.py --promote output) after the template: a lumbering fungal plod,
a true backing-away walkBack, a crouch-and-lunge cast, a recoil hurt, a collapsing ko. Run gen-r24.py --promote first (fresh
spec), then this script. Usage: ~/claudetmp/venv-rig/bin/python -I tools/assets/portrait-rig/tune-umbrel-anim.py"""
import json
from pathlib import Path

p = Path(__file__).parent / "spec" / "umbrel.anim.json"
a = json.loads(p.read_text())
a.pop("walkBack", None)

# --- walkBack: the walk cycle run backwards and half a cycle out of phase, head tucked, body eased back
w = a["walk"]
wb = {"frames": w["frames"], "dirs": ["E"], "curves": {}}
for t, chs in w["curves"].items():
    wb["curves"][t] = {}
    for ch, v in chs.items():
        wb["curves"][t][ch] = v if ch == "bright" else [v[(2 - i) % 4] for i in range(4)]
for t in ("legFF0", "legFN0", "legHF0", "legHN0", "legFF1", "legFN1", "legHF1", "legHN1"):
    wb["curves"][t]["rot"] = [round(-0.7 * x) for x in wb["curves"][t]["rot"]]
for t in ("tail0", "tail1"):
    wb["curves"][t] = {"rot": [-10, -12, -10, -12]}
wb["curves"]["body"] = {"dy": [0, 0, 4, 0], "dx": [-5, -5, -5, -5]}
wb["curves"]["head"] = {"rot": [26, 22, 26, 30]}
wb["curves"]["neck0"] = {"rot": [20, 16, 20, 22]}
wb["curves"]["body"]["rot"] = [3, 0, -3, 0]
a["walkBack"] = wb

# --- idle/walk: more life (breathing bob, head sway, cap rock, heavier stomp)
i = a["idle"]["curves"]
i["body"] = {"dy": [0, -3, -6, -2]}
i["head"] = {"rot": [-12, 7, 13, -5]}
i["neck0"] = {"rot": [-6, 6, 9, -3]}
i["tail0"] = {"rot": [-8, 4, 8, -4]}
i["tail1"] = {"rot": [-10, 6, 10, -6]}
wk = w["curves"]
wk["body"]["rot"] = [-4, 0, 4, 0]
wk["body"]["dy"] = [1, 0, 1, 0]
wk["head"] = {"rot": [-9, 4, 9, -4]}
wk["neck0"] = {"rot": [-5, 3, 5, -3]}

# --- cast: crouch (chest lowered), coil, forward lunge with head and tail raised, release pose
a["cast"]["curves"] = {
    "body": {"dx": [-8, -12, 22, 22], "dy": [-4, -6, 2, 2], "rot": [-4, -5, 3, 3]},
    "spine1": {"rot": [-3, -4, 3, 0]},
    "neck0": {"rot": [-6, -10, 0, -2]},
    "head": {"rot": [-6, -12, 2, 0]},
    "tail0": {"rot": [-4, -6, 5, 6]},
    "tail1": {"rot": [-4, -6, 0, 0]},
    "legFF0": {"rot": [-10, -14, 6, 0]},
    "legFN0": {"rot": [-10, -14, 6, 0]},
    "legHF0": {"rot": [-4, -6, 8, 2]},
    "legHN0": {"rot": [-4, -6, 8, 2]},
}

# --- victory: rear up, head high, then stomp and hold
a["victory"]["curves"] = {
    "body": {"dy": [-8, -18, -8, 6], "rot": [-5, -11, -5, 3]},
    "spine1": {"rot": [-4, -8, -4, 2]},
    "neck0": {"rot": [-8, -16, -8, 2]},
    "head": {"rot": [-10, -20, -10, 4]},
    "tail0": {"rot": [-6, -10, -6, 4]},
    "tail1": {"rot": [-6, -10, -6, 4]},
    "legFF0": {"rot": [-6, -10, -5, 4]},
    "legFN0": {"rot": [-6, -10, -5, 4]},
}

# --- hurt (2 frames): shove back, head up, ears flat, eye dimmed; then settle
a["hurt"]["curves"] = {
    "body": {"dx": [-18, -8], "dy": [3, 1], "sy": [94, 98], "rot": [-3, -1]},
    "spine1": {"rot": [-6, -2]},
    "neck0": {"rot": [-14, -5]},
    "head": {"rot": [-22, -8]},
    "tail0": {"rot": [8, 3]},
    "tail1": {"rot": [8, 3]},
}

# --- ko: buckle, collapse to the ground, lie tilted with the head down and the tail slack; the last frame holds
a["ko"]["curves"] = {
    "body": {"rot": [5, 14, 24, 24], "dy": [8, 18, 22, 22], "dx": [-4, -8, -12, -12], "sy": [92, 84, 80, 80], "sx": [96, 90, 86, 86]},
    "spine1": {"rot": [3, 6, 8, 8]},
    "neck0": {"rot": [6, 12, 16, 16]},
    "head": {"rot": [8, 16, 22, 22]},
    "tail0": {"rot": [-8, -24, -50, -50]},
    "tail1": {"rot": [-4, -14, -30, -30]},
    "legFF0": {"rot": [20, 40, 55, 55]},
    "legFF1": {"rot": [20, 50, 75, 75]},
    "legFN0": {"rot": [-14, -34, -50, -50]},
    "legFN1": {"rot": [20, 50, 75, 75]},
    "legHF0": {"rot": [-20, -40, -55, -55]},
    "legHF1": {"rot": [-20, -50, -75, -75]},
    "legHN0": {"rot": [14, 34, 50, 50]},
    "legHN1": {"rot": [-20, -50, -75, -75]},
}
p.write_text(json.dumps(a, indent=1) + "\n")
print("tuned", p)
