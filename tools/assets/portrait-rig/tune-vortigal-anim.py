"""Hand-tunes the generated Vortigal anim (gen-r24.py vortigal --promote output) so every action row reads differently: the two wing
chains (ear00 = far-left wing, ear10 = right wing; positive rot raises the left tip and lowers the right one, so "wings up" is
+A / -A) beat slowly in idle, fast and wide in walk, sweep back and thrust in cast, flare in hurt, and fold in ko (the baked ko
frames come from r24-ko-keys.py, which tilts and drops the idle frame for this hero). Run gen-r24.py --promote first, then this script.
Usage: ~/claudetmp/venv-rig/bin/python -I tools/assets/portrait-rig/tune-vortigal-anim.py"""
import json
from pathlib import Path

p = Path(__file__).parent / "spec" / "vortigal.anim.json"
a = json.loads(p.read_text())


def wings(act, left, right=None):
    """Sets the two wing curves; right defaults to the mirror of left (both wings up/down together)."""
    c = a[act]["curves"]
    c["ear00"] = {"rot": left}
    c["ear10"] = {"rot": right if right is not None else [-v for v in left]}


def put(act, target, ch, vals):
    a[act]["curves"].setdefault(target, {})[ch] = vals


# idle: hovering glide, slow wing beat, body bobs, tail trims
wings("idle", [9, 0, -9, 0])
put("idle", "body", "dy", [0, -3, 0, 3])
put("idle", "head", "rot", [-3, 0, 3, 0])
put("idle", "tail1", "rot", [-4, 0, 4, 0])
put("idle", "tail2", "rot", [-8, 0, 8, 0])

# walk (the moving flight loop): fast wide wing beat, legs tucked and trailing, body surging
wings("walk", [24, 0, -20, 0])
put("walk", "body", "dy", [0, -5, 0, -5])
put("walk", "body", "rot", [-2, 0, 2, 0])
put("walk", "head", "rot", [-4, 2, 4, -2])
for t in ("legFN0", "legHN0"):
    put("walk", t, "rot", [6, 12, 6, 12])
for t in ("legFN1", "legHN1"):
    put("walk", t, "rot", [10, 18, 10, 18])
put("walk", "tail1", "rot", [-8, 0, 8, 0])

# cast: wings sweep up and back (wind-up), thrust down and forward (strike), body lunges, talons extend
wings("cast", [28, 40, -22, -6])
put("cast", "body", "dx", [-8, -12, 20, 4])
put("cast", "body", "dy", [-3, -6, 4, 0])
put("cast", "body", "rot", [-4, -8, 6, 0])
put("cast", "head", "rot", [-6, -10, 6, 0])
put("cast", "legFN0", "rot", [10, 16, -14, 0])
put("cast", "legHN0", "rot", [10, 16, -14, 0])

# hurt: hard recoil back and up, wings flared, head snapped back
wings("hurt", [34, 18])
put("hurt", "body", "dx", [-12, -6])
put("hurt", "body", "dy", [-5, -2])
put("hurt", "body", "rot", [-9, -4])
put("hurt", "head", "rot", [-16, -8])
put("hurt", "legFN0", "rot", [14, 6])
put("hurt", "legHN0", "rot", [14, 6])

# guard: wings drawn forward over the body, crouched
wings("guard", [-26, -30])
put("guard", "body", "dy", [3, 3])

# dash: wings swept back and streamlined, strong lunge, legs trailing
wings("dash", [-14, 30, 6])
put("dash", "body", "dx", [-6, 14, 0])

# ko: wings fold limp, head droops, body tips and sinks (the shipped frames are r24-ko-keys.py's tilt-and-drop of the idle frame)
wings("ko", [14, -10, -30, -34])
put("ko", "body", "rot", [0, 14, 30, 38])
put("ko", "body", "dy", [0, 6, 14, 18])
put("ko", "head", "rot", [0, 12, 22, 26])

# victory: triumphant wing spread and rise
wings("victory", [0, 26, 38, 26])
put("victory", "body", "dy", [0, -6, -10, -6])

# tagIn: drops in with wings up and settles
wings("tagIn", [30, 18, 4, 0])

p.write_text(json.dumps(a, indent=1) + "\n")
print("tuned", p)
