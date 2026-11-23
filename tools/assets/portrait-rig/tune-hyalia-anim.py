"""Hand-tunes the Hyalia anim (spec/hyalia.anim.json): a visible breathing idle (body bob, wing and neck sway), a bobbing diagonal-pair
walk, a cast with a rearing wind-up and a bright eye glow, a hard hurt recoil with an eye flash, and a KO that sinks with limp neck
and wing (the baked KO frames come from r24-ko-keys.py's tilt-and-drop of the idle frame). Wings are ear00/ear10.
Usage: ~/claudetmp/venv-rig/bin/python -I tools/assets/portrait-rig/tune-hyalia-anim.py   (then r24-ko-keys.py hyalia, pnpm assets:bake)"""
import json
from pathlib import Path

p = Path(__file__).parent / "spec" / "hyalia.anim.json"
a = json.loads(p.read_text())


def put(act, target, ch, vals):
    a[act]["curves"].setdefault(target, {})[ch] = vals


# idle: slow breath (body rises and settles), wing lift, neck and head sway
put("idle", "body", "dy", [0, -2, -3, -1])
put("idle", "body", "sy", [100, 101, 102, 101])
put("idle", "neck0", "rot", [-2, 0, 2, 0])
put("idle", "head", "rot", [-3, 0, 3, 0])
put("idle", "ear00", "rot", [0, 4, 6, 3])
put("idle", "ear10", "rot", [0, 4, 6, 3])

# walk: 4 px body bob on the step beats (foot drift cap is 3 px), wing flap, head nod
put("walk", "body", "dy", [3, -1, 3, -1])
put("walk", "body", "rot", [-1, 0, 1, 0])
put("walk", "head", "rot", [-4, 2, 4, -2])
put("walk", "neck0", "rot", [-3, 0, 3, 0])
put("walk", "ear00", "rot", [-4, 4, 8, 2])
put("walk", "ear10", "rot", [-4, 4, 8, 2])

# cast: f0 rears back and crouches, f1-f2 neck and head thrust forward and up with the wings spread and the eye blazing, f3 settle
put("cast", "body", "dy", [4, -1, -3, 0])
put("cast", "ear00", "rot", [-6, 8, 14, 4])
put("cast", "ear10", "rot", [-6, 8, 14, 4])
put("cast", "neck0", "rot", [8, -8, -12, -2])
put("cast", "head", "rot", [10, -12, -16, -3])
put("cast", "eye", "bright", [256, 420, 512, 320])

# hurt: f0 shoved back and tilted, head snapped up, wings flared, eye flash; f1 partial recovery in a slight squash
a["hurt"]["curves"] = {
    "body": {"dx": [-4, -1], "dy": [2, 3], "rot": [-5, 0], "sx": [100, 103], "sy": [100, 97]},
    "neck0": {"rot": [-8, 4]},
    "head": {"rot": [-14, 6]},
    "jaw": {"rot": [12, 5]},
    "ear00": {"rot": [10, 3]},
    "ear10": {"rot": [10, 3]},
    "tail0": {"rot": [-6, -2]},
    "tail1": {"rot": [-6, -2]},
    "tail2": {"rot": [-6, -2]},
    "eye": {"bright": [512, 300]},
}

# ko: head and neck drooping, wings falling limp, eye going dark (the frame itself comes from r24-ko-keys.py)
put("ko", "neck0", "rot", [0, 6, 12, 14])
put("ko", "ear00", "rot", [0, -6, -12, -14])
put("ko", "ear10", "rot", [0, -6, -12, -14])
put("ko", "eye", "bright", [256, 180, 90, 40])

p.write_text(json.dumps(a, indent=1) + "\n")
print("tuned", p)
