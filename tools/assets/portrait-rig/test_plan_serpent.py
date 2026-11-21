"""Tests for body_plans/serpent.py on the committed ouroth landmarks: schema, determinism, 4-key loops, one wave channel per segment, negatives."""
import copy
import json
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from body_plans import PlanError, build  # noqa: E402
from body_plans.common import FRAMES  # noqa: E402

with open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "r24", "ouroth.landmarks.json")) as f:
    LM = json.load(f)


class SerpentPlan(unittest.TestCase):
    def test_deterministic(self):
        self.assertEqual(json.dumps(build(copy.deepcopy(LM))), json.dumps(build(copy.deepcopy(LM))))

    def test_bones_chain_and_frames(self):
        spec, anim = build(copy.deepcopy(LM))
        ids = [b["id"] for b in spec["bones"]]
        self.assertEqual(ids[:2], ["root", "spine0"])
        self.assertEqual(ids[-2:], ["head", "jaw"])
        self.assertEqual(len([i for i in ids if i.startswith("seg")]), len(LM["joints"]["chain"]) - 2)
        for a, k in FRAMES.items():
            self.assertEqual(anim[a]["frames"], k)
        for a in ("idle", "walk"):
            self.assertNotIn("sub", anim[a])  # sheets need exactly 4 frames

    def test_walk_wave_reaches_every_segment(self):
        _, anim = build(copy.deepcopy(LM))
        segs = [b for b in anim["walk"]["curves"] if b.startswith("seg")]
        self.assertEqual(len(segs), len(LM["joints"]["chain"]) - 2)
        for s in segs:
            self.assertEqual(len(anim["walk"]["curves"][s]["rot"]), 4)

    def test_negatives(self):
        bad = copy.deepcopy(LM)
        bad["joints"]["chain"] = bad["joints"]["chain"][:2]
        with self.assertRaises(PlanError):
            build(bad)
        bad = copy.deepcopy(LM)
        bad["tune"]["wave"] = 99
        with self.assertRaises(PlanError):
            build(bad)


if __name__ == "__main__":
    unittest.main()
