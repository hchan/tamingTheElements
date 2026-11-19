"""Tests for body_plans/common.py, fk.py and the registry (pure Python): python3 -m unittest discover -s tools/assets/portrait-rig -p 'test_plan_*.py'."""
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from body_plans import HERO_PLAN, KINDS, PlanError, build  # noqa: E402
from body_plans import common, fk  # noqa: E402


class Common(unittest.TestCase):
    def test_loop_is_integer_and_wraps(self):
        self.assertEqual(common.loop(10), [0, 10, 0, -10])
        self.assertEqual(common.loop(10, 1), [-10, 0, 10, 0])
        self.assertEqual(common.loop(7, 4), common.loop(7, 0))

    def test_curves_check_key_counts(self):
        c = common.Curves()
        c.put("hurt", "body", "dx", [1, 2])
        with self.assertRaises(AssertionError):
            c.put("hurt", "body", "dx", [1, 2, 3])

    def test_start_errors_name_the_field(self):
        base = {"plan": "quadruped", "source": "a.png", "canvas": [400, 312], "feet": [196, 300], "res": 2}
        self.assertEqual(common.start(base, "quadruped")[1], [20, 68, 200, 156])
        for patch, word in (({"plan": "fish"}, "plan"), ({"source": 3}, "source"), ({"canvas": [401, 312]}, "divide"), ({"canvas": [900, 312]}, "fit"),
                            ({"feet": [500, 300]}, "feet"), ({"res": 3}, "res")):
            with self.assertRaisesRegex(PlanError, word):
                common.start({**base, **patch}, "quadruped")

    def test_capsule_is_a_quad_around_the_bone(self):
        p = common.capsule([0, 0], [0, 100], 10)
        xs = [a[0] for a in p]
        self.assertEqual((min(xs), max(xs)), (-10, 10))

    def test_licence_names_the_model_and_licence(self):
        self.assertIn("Stable Diffusion XL", common.LICENSE)
        self.assertIn("Open RAIL++-M", common.LICENSE)

    def test_catmull_rom_sub_frames(self):
        v = [0, 100, 0, -100]
        e = fk.expand_curve(v, 2, True, False)
        self.assertEqual(len(e), 8)
        self.assertEqual(e[::2], v)
        self.assertEqual(sum(fk.sub_weights(1, 2)), 16384)


class Registry(unittest.TestCase):
    def test_twelve_heroes_once_each(self):
        self.assertEqual(len(HERO_PLAN), 12)
        self.assertTrue(set(HERO_PLAN.values()) <= set(KINDS))
        self.assertEqual(sorted(h for h, k in HERO_PLAN.items() if k == "quadruped"), ["brazgor", "durrok", "kindrel", "nykra", "quarrak", "zephra"])

    def test_unknown_plan(self):
        with self.assertRaisesRegex(PlanError, "unknown"):
            build({"plan": "dragon"})


if __name__ == "__main__":
    unittest.main()
