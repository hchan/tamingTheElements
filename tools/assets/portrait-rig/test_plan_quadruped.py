"""Tests for body_plans/quadruped.py on synthetic landmarks (pure Python, no numpy): schema, determinism, forward-kinematics checks over keys
and Catmull-Rom sub-frames, loops, ko hold, seam mode and negative cases."""
import copy
import json
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from body_plans import PlanError, build  # noqa: E402
from body_plans import fk  # noqa: E402
from body_plans.common import FRAMES, LOOPING  # noqa: E402

LM = {
    "plan": "quadruped", "hero": "t", "source": "x.png", "canvas": [400, 312], "feet": [196, 300], "res": 2,
    "joints": {"spine": [[130, 170], [270, 165]], "neck": [[290, 140]], "head": [330, 95], "jaw": [345, 118],
               "tail": [[118, 150], [90, 120], [66, 92], [52, 62], [46, 30]],
               "legs": {"FN": [[272, 200], [276, 250], [278, 298]], "FF": [[255, 200], [259, 250], [261, 298]],
                        "HN": [[145, 200], [140, 250], [142, 298]], "HF": [[160, 200], [155, 250], [157, 298]]}},
    "extras": {"trunk": [[335, 110], [350, 150], [345, 190]], "ears": [[[318, 90], [310, 60]]]},
    "fx": {"element": "fire", "zones": [[330, 95, 30]]}, "glows": [{"id": "eye", "at": [345, 92], "r": 6, "color": [255, 150, 40]}],
}
RANGE = {"rot": 360, "dx": 240, "dy": 240, "sx": 400, "sy": 400, "alpha": 256, "bright": 512}


def mirrored(lm):
    m = copy.deepcopy(lm)
    w = m["canvas"][0]

    def f(v):
        return [w - v[0], v[1]] if isinstance(v[0], int) else [f(p) for p in v]
    m["joints"] = {k: ({n: f(p) for n, p in v.items()} if k == "legs" else f(v)) for k, v in m["joints"].items()}
    m["feet"] = f(m["feet"])
    return m


class Quadruped(unittest.TestCase):
    def setUp(self):
        self.spec, self.anim = build(LM)

    def test_schema(self):
        ids = [b["id"] for b in self.spec["bones"]]
        self.assertEqual(len(ids), len(set(ids)))
        self.assertEqual(ids[0], "root")
        self.assertNotIn("poly", self.spec["bones"][0])
        seen = set()
        for b in self.spec["bones"]:
            self.assertTrue("parent" not in b or b["parent"] in seen, b["id"])
            seen.add(b["id"])
        targets = set(ids) | {g["id"] for g in self.spec["glows"]} | {"body", "shadow"}
        self.assertEqual(list(self.anim), list(FRAMES))
        for a, act in self.anim.items():
            self.assertEqual(act["frames"], FRAMES[a])
            self.assertIn(act.get("sub", 1), (1, 2, 3, 4))
            for t, ch in act["curves"].items():
                self.assertIn(t, targets)
                for name, v in ch.items():
                    self.assertEqual(len(v), FRAMES[a], f"{a}.{t}.{name}")
                    lo = 0 if name in ("alpha", "bright") else -RANGE[name]
                    self.assertTrue(all(isinstance(x, int) and lo <= x <= RANGE[name] for x in v), f"{a}.{t}.{name}")
            self.assertTrue(set(act.get("deform", {})) <= {"body"})

    def test_box_feet_licence(self):
        s = self.spec
        self.assertEqual(s["box"], [20, 68, 200, 156])
        self.assertEqual(s["box"][0] * 2 + s["box"][2] * 2 <= 480, True)
        self.assertIn("Open RAIL++-M", s["license"])
        self.assertIn("Stable Diffusion XL", s["license"])
        self.assertIn("polys", s["deformMask"])
        self.assertNotIn("skin", s)

    def test_deterministic(self):
        a = json.dumps(build(LM), sort_keys=True)
        self.assertEqual(a, json.dumps(build(copy.deepcopy(LM)), sort_keys=True))

    def run_fk(self, spec, anim, action):
        n = anim[action]["frames"] * anim[action].get("sub", 1)
        return [fk.pose(spec, anim, action, f) for f in range(n)]

    def test_frame_margin_everywhere(self):
        for lm in (LM, mirrored(LM)):
            spec, anim = build(lm)
            for a in FRAMES:
                for f, p in enumerate(self.run_fk(spec, anim, a)):
                    for i, seg in p.items():
                        for pt in seg:
                            x, y = fk.to_frame(spec, pt)
                            self.assertTrue(4 <= x <= 236 and 4 <= y <= 236, f"{a} f{f} {i} {x:.1f},{y:.1f}")

    def test_walk_feet_steady_and_grounded(self):
        for lm in (LM, mirrored(LM)):
            spec, anim = build(lm)
            k = anim["walk"].get("sub", 1)
            paws = {b["id"]: pts for b, pts in ((b, None) for b in spec["bones"]) if b["id"].startswith("leg") and b["id"].endswith("1")}
            ground = max(h[1] for h in (lm["joints"]["legs"][n][-1] for n in lm["joints"]["legs"]))
            lows = []
            for f, p in enumerate(self.run_fk(spec, anim, "walk")):
                ys = [p[i][1][1] for i in paws]
                lows.append(max(ys))
                tol = 1.2 * spec["res"] if f % k == 0 else 2.2 * spec["res"]
                self.assertGreaterEqual(sum(1 for y in ys if y >= ground - tol), 2, f"walk f{f}: {ys}")
            self.assertLessEqual(max(lows) - min(lows), 3 * spec["res"])

    def test_head_ahead_of_root_and_rot_limits(self):
        spec, anim = build(LM)
        self.assertGreater([b for b in spec["bones"] if b["id"] == "head"][0]["head"][0], spec["bones"][0]["head"][0])
        for a, act in anim.items():
            for t, ch in act["curves"].items():
                if "rot" in ch and t != "body":
                    self.assertLessEqual(max(abs(v) for v in ch["rot"]), 40 if a == "walk" else 25, f"{a}.{t}")
            tails = [ch["rot"] for t, ch in act["curves"].items() if t.startswith("tail") and "rot" in ch]
            for k in range(act["frames"]):
                self.assertLessEqual(abs(sum(r[k] for r in tails)), 60, a)

    def test_loops_wrap_and_ko_holds(self):
        for a in LOOPING:
            for t, ch in self.anim[a]["curves"].items():
                for name, v in ch.items():
                    if name != "bright":
                        self.assertLessEqual(max(abs(v[(i + 1) % len(v)] - v[i]) for i in range(len(v))), 40, f"{a}.{t}.{name}")
        for t, ch in self.anim["ko"]["curves"].items():
            for name, v in ch.items():
                if name != "bright":
                    self.assertEqual(v[-1], v[-2], f"ko.{t}.{name} must hold")

    def test_seam_mode(self):
        spec, anim = build({**LM, "skin": "seam"})
        self.assertEqual(spec["skin"], {"mesh": "seam", "step": 12, "weights": "geodesic"})
        by = {b["id"]: b for b in spec["bones"]}
        self.assertEqual([b["id"] for b in spec["bones"] if "poly" in b], ["jaw"])
        self.assertTrue(by["legFN1"]["front"] and by["legHN1"]["front"])
        self.assertNotIn("front", by["legFF1"])
        self.assertEqual(by["tail4" if "tail4" in by else "tail3"]["tip"], LM["joints"]["tail"][-1])
        self.assertEqual(anim, build(LM)[1])

    def test_two_legs_and_one_segment_legs(self):
        lm = copy.deepcopy(LM)
        lm["joints"]["legs"] = {"FN": [[272, 200], [278, 298]], "HN": [[145, 200], [142, 298]]}
        spec, anim = build(lm)
        self.assertTrue(all(b["id"] != "legFN1" for b in spec["bones"]))
        self.assertIn("legFN0", anim["walk"]["curves"])

    def test_negative_cases_name_the_joint(self):
        def err(mut, word):
            lm = copy.deepcopy(LM)
            mut(lm)
            with self.assertRaisesRegex(PlanError, word):
                build(lm)
        err(lambda m: m["joints"]["legs"].__setitem__("HF", [[1, 2]]), r"quadruped: joints\.legs\.HF needs 2-3")
        err(lambda m: m["joints"].pop("head"), r"joints\.head")
        err(lambda m: m["joints"].pop("tail"), r"joints\.tail")
        err(lambda m: m["joints"].__setitem__("legs", {"FN": [[1, 2], [3, 4]]}), "at least two")
        err(lambda m: m.__setitem__("tune", {"swing": 99}), "swing")
        err(lambda m: m.__setitem__("canvas", [401, 312]), "divide")
        err(lambda m: m.__setitem__("skin", "mesh"), "skin")
        err(lambda m: m["glows"][0].__setitem__("bone", "nope"), "unknown bone")
        err(lambda m: m["fx"].__setitem__("element", "plasma"), "element")


if __name__ == "__main__":
    unittest.main()
