"""Adds Ouroth's walkBack (E only) to the generated anim (gen-r24.py ouroth --promote output): the slither wave runs the other way
(keys reversed), the head is tucked down and the body eased back, so it reads as backing away. Run gen-r24.py --promote first
(fresh spec), then this script. Usage: ~/claudetmp/venv-rig/bin/python -I tools/assets/portrait-rig/tune-ouroth-anim.py"""
import json
from pathlib import Path

p = Path(__file__).parent / "spec" / "ouroth.anim.json"
a = json.loads(p.read_text())
a.pop("walkBack", None)
w = a["walk"]
wb = {"frames": w["frames"], "dirs": ["E"], "curves": {}}
for t, chs in w["curves"].items():
    wb["curves"][t] = {}
    for ch, v in chs.items():
        wb["curves"][t][ch] = v if ch == "bright" else [v[(4 - i) % 4] for i in range(4)]
wb["curves"]["body"] = {"dy": [0, 1, 0, 1], "dx": [-4, -4, -4, -4]}
wb["curves"]["head"] = {"rot": [10, 12, 10, 12]}
wb["curves"]["jaw"] = {"rot": [2, 3, 2, 3]}
a["walkBack"] = wb
p.write_text(json.dumps(a, indent=1) + "\n")
print("tuned", p)
