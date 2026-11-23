"""Hand-tunes the generated Glimmaw anim (gen-r24.py glimmaw --promote output): a heavy grounded turtle plod, a neck-stretch lure
cast, a shell-first recoil hurt. The shell rim is the tail root, so tail curves stay tiny. Run gen-r24.py --promote first (fresh
spec), then this script. Usage: ~/claudetmp/venv-rig/bin/python -I tools/assets/portrait-rig/tune-glimmaw-anim.py"""
import json
from pathlib import Path

p = Path(__file__).parent / "spec" / "glimmaw.anim.json"
a = json.loads(p.read_text())

i = a["idle"]["curves"]  # slow breathing, head sway
i["body"] = {"dy": [0, -2, -3, -1]}
i["head"] = {"rot": [-4, 2, 5, -2]}
i["neck0"] = {"rot": [-2, 2, 3, -1]}
i["tail0"] = {"rot": [0, 1, 0, -1]}

wk = a["walk"]["curves"]  # weighty stomp: bob and a shell rock
wk["body"]["dy"] = [2, 0, 2, 0]
wk["body"]["rot"] = [-2, 0, 2, 0]
wk["head"] = {"rot": [-4, 2, 4, -2]}
wk["neck0"] = {"rot": [-3, 1, 3, -1]}
wk["tail0"] = {"rot": [0, 1, 0, -1]}

# cast: sink, draw the neck back, then thrust head and neck forward (the lure swings out), settle
a["cast"]["curves"] = {
    "body": {"dx": [-4, -6, 8, 4], "dy": [2, 3, -1, 0]},
    "neck0": {"rot": [8, 14, -10, -2]},
    "head": {"rot": [10, 18, -14, -3]},
    "legFN0": {"rot": [-4, -6, 3, 0]},
    "legFF0": {"rot": [-4, -6, 3, 0]},
}

# hurt: shell pushed back, head snaps up, then settles
a["hurt"]["curves"] = {
    "body": {"dx": [-9, -4], "dy": [2, 1], "rot": [-2, -1]},
    "neck0": {"rot": [-8, -3]},
    "head": {"rot": [-12, -5]},
}
p.write_text(json.dumps(a, indent=1) + "\n")
print("tuned", p)
