#!/usr/bin/env python3
"""Tests for make-control.py: 12 heroes, one head, facing right, margin >= 6%, no ground line. Run: python3 test_make_control.py"""
import importlib.util, unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location("make_control", HERE / "make-control.py")
mc = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mc)

SDXL = {(1024, 1024), (1152, 896), (896, 1152), (1344, 768), (768, 1344)}

class ControlTests(unittest.TestCase):
    def test_twelve_heroes(self):
        self.assertEqual(sorted(mc.HEROES), sorted("kindrel brazgor ouroth nykra glimmaw abyssor quarrak durrok umbrel hyalia zephra vortigal".split()))

    def test_each_hero(self):
        for name in mc.HEROES:
            with self.subTest(hero=name):
                im, head = mc.render(name)
                w, h = im.size
                self.assertIn(im.size, SDXL)
                self.assertEqual(im.mode, "L")
                x0, y0, x1, y1 = im.getbbox()
                self.assertGreaterEqual(x0, MARGIN_PX(w)); self.assertGreaterEqual(y0, MARGIN_PX(h))
                self.assertLessEqual(x1, w - MARGIN_PX(w)); self.assertLessEqual(y1, h - MARGIN_PX(h))
                # exactly one head box, on the right of the silhouette centre (facing right)
                self.assertEqual(len(head), 4)
                self.assertGreater((head[0] + head[2]) / 2 * w, (x0 + x1) / 2)
                # no ground line: the bottom 2% rows are sparse lines, never a long horizontal stroke
                for y in range(int(y1) - 6, int(y1)):
                    row = sum(1 for x in range(w) if im.getpixel((x, y)) > 128)
                    self.assertLess(row, 0.35 * w)

def MARGIN_PX(n):
    return int(mc.MARGIN * n)

if __name__ == "__main__":
    unittest.main()
