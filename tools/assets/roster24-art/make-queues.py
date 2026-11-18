#!/usr/bin/env python3
"""Build the gpu-queue.py queue files.  Usage: make-queues.py CONCEPT_GEN_PY OUTDIR

CONCEPT_GEN_PY is the original concept script whose H = {...} dict holds the 12 hero prompts
(~/claudetmp/concepts-new12/gen.py). Writes OUTDIR/queue-glimmaw-cn.json (small, any time) and
OUTDIR/queue-night.json (bulk, 23:00-07:00 only).
"""
import json, re, sys

CTRL = "/mnt/c/Users/hchan/glimmaw-control.png"  # scp'd control image on the PC
style = ", floating, no base, no plinth, plain dark background, dark fantasy painted concept art, full body, side view facing right"
neg = ("sculpture, statue, plinth, pedestal, base, stand, bowl, desk, table, ground, floor, frame, border, text, watermark, "
       "cartoon, chibi, cute, 3d render, human, person, multiple creatures, two heads, collage, blurry, facing left, toy")
glim = ("a deep blue and teal translucent water anglerfish creature, see-through glassy body with bubbles, open mouth with "
        "sharp white fangs, a long stalk with a bright glowing yellow lure bulb, fins of waves")
first = {"style": style, "neg": neg + ", orange, red, pink, scales, opaque fish skin", "jobs": [
    {"name": "glimmaw_cn", "kind": "cn", "prompt": glim, "control": CTRL, "seeds": [7001, 7002, 7003, 7004],
     "scales": [0.5, 0.7, 0.9], "cfg": 6.5}]}
json.dump(first, open(sys.argv[2] + "/queue-glimmaw-cn.json", "w"), indent=1)

H = dict(re.findall(r'^"(\w+)":"([^"]+)",?$', open(sys.argv[1]).read(), re.M))
pst = (", elemental creature, full body, side view facing right, grimdark medieval fantasy oil painting, rich textured "
       "brushwork, luminous elemental glow, plain flat near-black background, one single creature, exactly one head")
night = {"style": pst, "neg": ("cartoon, chibi, cute, anime, cel shading, vector art, flat colours, 3d render, plastic, toy, "
         "human, person, humanoid, rider, text, watermark, border, cropped, multiple creatures, blurry, facing left, "
         "plinth, pedestal, ground, floor"), "jobs": []}
night["jobs"].append({"name": "glimmaw_cn2", "kind": "cn", "bulk": True, "prompt": glim, "control": CTRL,
                      "seeds": list(range(7101, 7109)), "scales": [0.6, 0.8], "cfg": 6.5, "neg_extra": "orange, red, pink"})
for h, p in H.items():
    night["jobs"].append({"name": h + "_p", "kind": "t2i", "bulk": True, "prompt": p,
                          "seeds": [9000 + i * 37 + len(h) for i in range(8)], "cfg": 6.5})
json.dump(night, open(sys.argv[2] + "/queue-night.json", "w"), indent=1)
print(len(H), "heroes;", sum(len(j["seeds"]) * len(j.get("scales") or [1]) for j in night["jobs"]), "night images")
