# Prints size, opaque share and mean luminance of every ability sprite (feeds docs/ABILITY-AUDIT.md).
# Run from the repo root: python3 -I tools/assets/ability-sprite-stats.py
from PIL import Image

NAMES = (
    "capture:capture.png windCone:fx/windCone.png tornado:map/tornado.png stick:stick.png "
    "fireBlast:fx/fireBlast.png icicles:fx/icicles.png hurlRock:fx/hurlRock.png sonarBlast:fx/sonarBlast.png "
    "fireball:fx/fireball.png crimsonFire:fx/crimsonFire.png rockPellet:fx/rockPellet.png "
    "slimeBlast:fx/slimeBlast.png shardsOfIce:fx/shardsOfIce.png circusOfSlimeIcon:circusOfSlimeIcon.png "
    "chaosBolt:fx/chaosBolt.png chaosOrb:fx/chaosOrb.png fireCone:map/fireCone.png "
    "groundShock:fx/groundShock.png adrenaline:adrenaline.png translucentFlame:map/translucentFlame.png "
    "iceBlast:fx/iceBlast.png stealHealth:fx/stealHealth.png fireHeal:fx/fireHeal.png iceShock:fx/iceShock.png "
    "rockArmour:fx/rockArmour.png hurricane:fx/hurricane.png fade:fade.png fireDance:fx/fireDance.png "
    "stranglingBranches:fx/stranglingBranches.png entanglingVines:fx/entanglingVines.png "
    "entanglingVinesLong:fx/entanglingVinesLong.png"
).split()

for entry in NAMES:
    key, path = entry.split(":")
    im = Image.open("public/assets/img/" + path).convert("RGBA")
    px = list(im.getdata())
    opaque = [p for p in px if p[3] > 32]
    lum = sum(0.2126 * p[0] + 0.7152 * p[1] + 0.0722 * p[2] for p in opaque) / max(1, len(opaque))
    print(key, im.size, "opaque %.0f%%" % (100 * len(opaque) / len(px)), "lum %.0f" % lum)
