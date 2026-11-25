"""Tests for key.py and prefilter.py --alpha (synthetic images, no GPU).

Run (needs numpy + Pillow; no pytest in the art venv):
  ~/claudetmp/venv/bin/python -I -m unittest discover -s tools/assets/roster24-art -p 'test_key.py'
"""
import os, subprocess, sys, tempfile, unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
try:
    import numpy as np
    from PIL import Image
    import key
except ImportError:  # pragma: no cover
    np = None

N = 128


def ring_plate(bg, ring=(230, 110, 20)):
    """Orange ring (radius 0.30-0.40) on a flat bg-coloured plate."""
    a = np.zeros((N, N, 3), np.uint8) + np.array(bg, np.uint8)
    r = key.radius_map(a.shape)
    m = (r > 0.30) & (r < 0.40)
    a[m] = ring
    return a


@unittest.skipIf(np is None, "numpy/Pillow not installed")
class KeyTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.d = Path(self.tmp.name)

    def alpha_of(self, method, bg, ring=(230, 110, 20)):
        src = self.d / "in.png"
        Image.fromarray(ring_plate(bg, ring)).save(src)
        out = self.d / "out.png"
        key.key_file(method, str(src), str(out))
        im = Image.open(out)
        self.assertEqual(im.mode, "RGBA")
        return np.asarray(im)[..., 3]

    def test_radial_keeps_ring_clears_centre_and_corners(self):
        a = self.alpha_of("radial", (60, 60, 60))
        self.assertGreater(a[N // 2, int(N * 0.85)], 240)
        self.assertEqual(a[N // 2, N // 2], 0)
        self.assertEqual(a[0, 0], 0)

    def test_burn_haste_snag_make_dark_plate_transparent(self):
        for m in ("burn", "haste", "snag"):
            a = self.alpha_of(m, (8, 8, 10))
            self.assertEqual(a[0, 0], 0, m)
            self.assertEqual(a[N // 2, N // 2], 0, m)
            self.assertGreater(a[N // 2, int(N * 0.85)], 128, m)

    def test_heal_hue_key_keeps_green(self):
        arr = np.zeros((N, N, 3), np.uint8) + 50
        arr[N // 2 - 10:N // 2 + 10, int(N * 0.65):int(N * 0.9)] = (60, 170, 40)
        src = self.d / "g.png"
        Image.fromarray(arr).save(src)
        out = self.d / "g_out.png"
        key.key_file("hue", str(src), str(out))
        a = np.asarray(Image.open(out))[..., 3]
        self.assertGreater(a[N // 2, int(N * 0.75)], 240)
        self.assertEqual(a[2, 2], 0)

    def test_relluma_keys_ring_on_grey_ground(self):
        for m in ("relluma", "freeze", "daze", "tide"):
            a = self.alpha_of(m, (90, 90, 90), (240, 240, 225))
            self.assertGreater(a[N // 2, int(N * 0.85)], 0.8 * 255, m)
            self.assertEqual(a[0, 0], 0, m)
            self.assertEqual(a[0, N - 1], 0, m)
            r = key.radius_map((N, N, 3))
            self.assertEqual(int(a[r > 0.5].max()), 0, m)

    def test_cli_refuses_to_overwrite_source(self):
        src = self.d / "in.png"
        Image.fromarray(ring_plate((0, 0, 0))).save(src)
        before = src.read_bytes()
        r = subprocess.run([sys.executable, "-I", str(HERE / "key.py"), "radial", str(src), str(src)],
                           capture_output=True, text=True)
        self.assertEqual(r.returncode, 2)
        self.assertEqual(src.read_bytes(), before)

    def test_prefilter_alpha_passes_keyed_and_fails_raw_grey(self):
        raw = self.d / "raw"; keyed = self.d / "keyed"
        raw.mkdir(); keyed.mkdir()
        Image.fromarray(ring_plate((90, 90, 90))).save(raw / "a.png")
        key.key_file("radial", str(raw / "a.png"), str(keyed / "a.png"))
        pf = str(HERE / "prefilter.py")
        ok = subprocess.run([sys.executable, "-I", pf, "fx", str(keyed), "--alpha"], capture_output=True, text=True)
        self.assertIn("PASS a.png", ok.stdout)
        bad = subprocess.run([sys.executable, "-I", pf, "fx", str(raw)], capture_output=True, text=True)
        self.assertIn("FAIL a.png", bad.stdout)


if __name__ == "__main__":
    unittest.main()
