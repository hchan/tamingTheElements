"""Hand-tunes the generated Glimmaw anim (gen-r24.py glimmaw --promote output): a heavy grounded turtle plod, a neck-stretch lure
cast, a shell-first recoil hurt. The shell rim is the tail root, so tail curves stay tiny. Run gen-r24.py --promote first (fresh
spec), then this script. Usage: ~/claudetmp/venv-rig/bin/python -I tools/assets/portrait-rig/tune-glimmaw-anim.py"""
import json
from pathlib import Path

p = Path(__file__).parent / "spec" / "glimmaw.anim.json"
a = json.loads(p.read_text())

i = a["idle"]["curves"]  # slow breathing (about 2% scale) and a small head bob, no leg motion
i["body"] = {"dy": [0, -3, -4, -1], "sx": [100, 99, 98, 99], "sy": [100, 101, 102, 101]}
i["head"] = {"rot": [-3, 2, 4, -2]}
i["neck0"] = {"rot": [-2, 2, 3, -1]}
i["tail0"] = {"rot": [0, 1, 0, -1]}

wk = a["walk"]["curves"]  # weighty trot: diagonal pairs (FN+HF, FF+HN) swing in opposition, 7 px bob (test caps foot drift at 3 frame px), shell rock, head sway
wk["body"]["dy"] = [5, -2, 3, -2]
wk["body"]["rot"] = [-3, 0, 3, 0]
for k in ("legFN0", "legHF0"):  # f2 swing eased (16 -> 8): at full swing the near front leg overlapped the far one into a doubled smear
    wk[k] = {"rot": [-16, 0, 8, 0]}
for k in ("legFF0", "legHN0"):
    wk[k] = {"rot": [16, 0, -8, 0]}
wk["head"] = {"rot": [-8, 4, 8, -4]}
wk["neck0"] = {"rot": [-5, 2, 5, -2]}
wk["tail0"] = {"rot": [0, 1, 0, -1]}

# cast: f0 crouch (sink, neck drawn back), f1-f2 lunge head/neck forward and up with the shell rim glowing, f3 settle
a["cast"]["curves"] = {
    "body": {"dx": [-6, 4, 10, 3], "dy": [9, 0, -3, 1]},
    "neck0": {"rot": [10, -12, -16, -3]},
    "head": {"rot": [14, -16, -20, -4]},
    "legFN0": {"rot": [-6, 4, 6, 0]},
    "legFF0": {"rot": [-6, 4, 6, 0]},
}

# hurt: f0 shell pushed back and tilted away, head snaps up, flash; f1 partial recovery
a["hurt"]["curves"] = {
    "body": {"dx": [0, 0], "dy": [3, 4], "rot": [-8, 0], "sx": [100, 103], "sy": [100, 97]},  # f1: ~3% squash crouch, not an idle copy
    "neck0": {"rot": [-10, 6]},
    "head": {"rot": [-16, 8]},
}

# glows: the shell rim lights only in the cast lunge, the white-red flash only on the first hurt frame
for act, n in (("idle", 4), ("walk", 4), ("cast", 4), ("hurt", 2), ("guard", 2), ("dash", 3), ("ko", 4), ("victory", 4), ("tagIn", 4)):
    cv = a[act]["curves"]
    cv["rim"] = {"bright": [0] * n, "alpha": [0] * n}  # alpha 0 too: a zero-bright additive glow still leaves a faint halo
    cv["flash"] = {"bright": [0] * n, "alpha": [0] * n}
a["cast"]["curves"]["rim"] = {"bright": [0, 480, 512, 180], "alpha": [0, 256, 256, 144]}
a["hurt"]["curves"]["flash"] = {"bright": [456, 120], "alpha": [180, 108]}
p.write_text(json.dumps(a, indent=1) + "\n")
print("tuned", p)
