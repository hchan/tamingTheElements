"""Writes spec/<hero>.json and spec/<hero>.anim.json for the owner's original painted heroes (ORIG-2): rokcore, lavax, ishimi,
morblass, echo, wispera, cyclonius. Pax, Sindarosa and Curomo specs are hand written. Run `python -I gen-specs.py`, then prep.py,
`pnpm assets:bake`, `pnpm assets:sheets`, map-strips.py. The painting is never redrawn: bones are feathered weight polygons over
the 400 px portrait (see README.md).
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from specs_lib import *  # noqa: E402,F401
from specs_lib import HERE, ANIMS, SPECS, R, FULL, DIRS, bone, glow, biped, blobby, arm_curves, write_specs  # noqa: E402

biped("rokcore", [200, 394], [200, 80], [228, 106], [120, 150, 255], [255, 236, 200], R(150, 0, 300, 120),
      ([100, 190], R(0, 100, 110, 400)), ([300, 200], R(290, 100, 400, 340)), (140, 200), (200, 290))
biped("lavax", [200, 392], [262, 130], [268, 152], [90, 130, 255], [255, 190, 120], R(220, 0, 340, 190),
      ([110, 200], R(0, 160, 160, 400)), ([330, 210], R(300, 160, 400, 340)), (170, 260), (260, 330))

# Ishimi: a jelly mound; whole-body sway and wave.
blobby("ishimi", [200, 380], [glow("eyeL", "torso", [193, 90], 7, [190, 255, 90]), glow("eyeR", "torso", [305, 88], 7, [190, 255, 90])],
       [200, 255, 255], (3, 150), R(0, 20, 400, 360), [bone("root", None, [200, 380]), bone("torso", "root", [200, 330], FULL, 24)])
# Morblass: water wraith, arms swing.
blobby("morblass", [190, 388], [], [220, 240, 255], (2, 150), R(0, 140, 400, 400),
       [bone("root", None, [190, 388]), bone("torso", "root", [190, 300], FULL, 24), bone("head", "torso", [186, 90], R(120, 0, 260, 130), 10),
        bone("armB", "torso", [80, 150], R(0, 90, 120, 400), 14), bone("armF", "torso", [300, 150], R(280, 90, 400, 400), 14)])
arm_curves("morblass", {"idle": ([0, 1, 2, 1], [0, -1, -1, 0]), "walk": ([-4, 0, 4, 0], [4, 0, -4, 0]), "cast": ([8, -16, -10, -2], [0, 4, 3, 0]),
                        "hurt": ([6, 3], [-4, -2]), "guard": ([-10, -12], [-6, -6]), "victory": ([-3, -8, -10, -8], [1, 3, 4, 3])})
# Echo: pale tornado with two glowing points.
blobby("echo", [210, 392], [glow("eyeL", "torso", [233, 135], 6, [120, 200, 255]), glow("eyeR", "torso", [305, 135], 6, [120, 200, 255])],
       [230, 245, 255], (4, 120), R(0, 60, 400, 330),
       [bone("root", None, [210, 392]), bone("torso", "root", [210, 330], FULL, 24), bone("top", "torso", [210, 140], R(0, 0, 400, 200), 20)])
# Cyclonius: whirlwind wraith with an arm and red eyes.
blobby("cyclonius", [150, 392], [glow("eyeL", "torso", [195, 65], 5, [255, 50, 40]), glow("eyeR", "torso", [220, 68], 5, [255, 50, 40])],
       [220, 235, 255], (4, 110), R(0, 60, 400, 400),
       [bone("root", None, [150, 392]), bone("torso", "root", [170, 330], FULL, 24), bone("head", "torso", [210, 70], R(100, 0, 340, 130), 10),
        bone("armF", "torso", [295, 140], R(270, 100, 400, 220), 12)])
ANIMS["echo"]["dash"]["curves"] = {"body": {"dx": [2, 4, 3], "sx": [100, 101, 100]}, "torso": {"rot": [4, 5, 4]}, "eyeL": {"bright": [360, 400, 360]}, "eyeR": {"bright": [360, 400, 360]}}
for act_, c in {"idle": [0, 1, 2, 1], "walk": [-3, 0, 3, 0], "cast": [8, -14, -8, -2], "hurt": [5, 2], "guard": [-6, -8], "victory": [-8, -22, -26, -22]}.items():
    ANIMS["cyclonius"][act_]["curves"]["armF"] = {"rot": c}
# Wispera: a pulsing blue starburst; scale and brighten.
blobby("wispera", [200, 300], [glow("core", "torso", [190, 225], 14, [120, 170, 255], 1.0, 0.7)], [140, 190, 255], None, None,
       [bone("root", None, [200, 300]), bone("torso", "root", [190, 225], FULL, 24)])
SPECS["wispera"]["rim"]["strength"] = 0.0
# The painting is the owner-picked "Refined 2" (tools/assets/wispera-art, WISPERA-R2), no longer the legacy portrait.
SPECS["wispera"]["license"] = (
    "Rig parts for wispera: derived from the redrawn portrait `map/wisperaLarge.png` (owner-picked \"Refined 2\", 2026-11-16, WISPERA-R2), which\n"
    "replaces the legacy portrait (tag legacy-crafty-1.0). Made by tools/assets/wispera-art: SDXL-Turbo img2img (strength 0.6, seed 4511) of\n"
    "imgWorkArea/portrait-src/wispera/e_8.png -> r60_3.png, then refine_cut.py (cut + procedural cloud, seed 8; numpy/PIL). Cut, matted,\n"
    "inpainted and animated by tools/assets/portrait-rig (prep.py, spec/wispera.json, spec/wispera.anim.json).\n"
    "Licence: same as the repository's own art (still to be decided in README.md; owner to confirm, including SDXL-Turbo output terms).\n"
)
# The new painting is opaque out to its bolt tips (about 146 portrait px below the core), so the legacy 100->106 % pulse about the core
# moved the feet-row 4.4 frame px (the test allows 3): a gentler pulse keeps it near 2.2 px.
for act_ in ("idle", "walk"):
    ANIMS["wispera"][act_]["curves"]["torso"] = {"sx": [100, 102, 103, 102], "sy": [100, 102, 103, 102]}

write_specs()
print(sorted(SPECS))
