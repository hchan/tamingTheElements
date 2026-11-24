"""Tests for grey-key.py (synthetic images).
Run: ~/claudetmp/venv/bin/python -I -m unittest discover -s tools/assets/roster24-art -p 'test_grey_key.py'"""
import importlib.util, sys, unittest
from pathlib import Path
try:
    import numpy as np
    spec = importlib.util.spec_from_file_location("grey_key", Path(__file__).resolve().parent / "grey-key.py")
    gk = importlib.util.module_from_spec(spec); spec.loader.exec_module(gk)
except ImportError:  # pragma: no cover
    np = None


@unittest.skipIf(np is None, "numpy/Pillow not installed")
class GreyKeyTests(unittest.TestCase):
    def plate(self):
        a = np.full((100, 100, 3), 128, np.uint8)
        a[30:70, 30:70] = (200, 40, 40)          # body
        a[45:55, 45:55] = (128, 128, 128)        # enclosed grey inside the body (silver belly): must stay opaque
        return a

    def test_background_transparent_body_opaque(self):
        o = gk.key_rgb(self.plate())
        self.assertEqual(o[0, 0, 3], 0)
        self.assertEqual(o[50, 35, 3], 255)
        self.assertEqual(o[50, 50, 3], 255)      # small enclosed grey kept

    def test_halo_removed(self):
        a = self.plate()
        a[30:70, 29] = (146, 106, 106)           # 25% body, 75% grey blend of body and grey on the edge column
        o = gk.key_rgb(a)
        col = o[50, 29]
        self.assertTrue(0 < col[3] < 255)
        self.assertGreater(col[0] - col[1], 60)  # despilled towards the red body, not grey

    def test_border_touching_creature_ok(self):
        a = self.plate(); a[48:52, 0:30] = (200, 40, 40)
        o = gk.key_rgb(a)
        self.assertEqual(o[50, 0, 3], 255)


if __name__ == "__main__":
    unittest.main()
