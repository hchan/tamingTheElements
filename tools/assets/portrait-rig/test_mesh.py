"""Tests for mesh.py on synthetic RGBA (needs numpy + Pillow): python3 -m unittest discover -s tools/assets/portrait-rig."""
import json
import os
import sys
import tempfile
import unittest

try:
    import numpy as np
    import PIL  # noqa: F401
except ImportError:  # the vitest wrapper skips when these are missing
    np = None

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))


def canvas(size, rects):
    a = np.zeros((size, size, 4), np.uint8)
    for x0, y0, x1, y1 in rects:
        a[y0:y1, x0:x1] = (200, 120, 60, 255)
    return a


def bones(*heads):
    out = []
    for k, h in enumerate(heads):
        b = {"id": f"b{k}", "head": list(h), "tip": list(h)}  # point bones (a tip equal to the head)
        if k:
            b["parent"] = "b0"
        out.append(b)
    return out


def seam_positions(sk):
    v = sk["verts"]
    seen, dup = {}, {}
    for k in range(len(v) // 2):
        seen.setdefault((v[2 * k], v[2 * k + 1]), []).append(k)
    for p, ks in seen.items():
        if len(ks) > 1:
            dup[p] = ks
    return dup


@unittest.skipIf(np is None, "numpy/Pillow missing")
class MeshTest(unittest.TestCase):
    def setUp(self):
        import mesh
        self.mesh = mesh

    def test_two_blobs_split_one_blob_does_not(self):
        two = canvas(48, [(4, 12, 20, 36), (26, 12, 42, 36)])  # 6 px gap, step 12 windows see both
        sk, _ = self.mesh.build_skin(two, bones((12, 24), (34, 24)), 12)
        self.assertTrue(seam_positions(sk))
        one = canvas(48, [(4, 12, 42, 36)])
        sk1, _ = self.mesh.build_skin(one, bones((12, 24), (34, 24)), 12)
        self.assertFalse(seam_positions(sk1))

    def test_u_shape_arms_weigh_differently(self):
        u = canvas(64, [(8, 8, 18, 56), (24, 8, 34, 56), (8, 48, 34, 56)])  # U: arms 6 px apart, joined at the bottom
        sk, _ = self.mesh.build_skin(u, bones((13, 12), (29, 12)), 12)
        nb = len(sk["bones"])
        dup = seam_positions(sk)
        self.assertTrue(dup)
        found = False
        for p, ks in dup.items():
            doms = {int(np.argmax(sk["w"][k * nb:(k + 1) * nb])) for k in ks}
            if p[1] < 40 and len(doms) > 1:
                found = True
        self.assertTrue(found, "no seam copy pair with different dominant bones")

    def test_q8_and_structure(self):
        u = canvas(64, [(8, 8, 18, 56), (24, 8, 34, 56), (8, 48, 34, 56)])
        sk, _ = self.mesh.build_skin(u, bones((13, 12), (29, 12), (20, 52), (13, 50)), 12)
        nb, nv = len(sk["bones"]), len(sk["verts"]) // 2
        self.assertEqual(len(sk["w"]), nv * nb)
        for k in range(nv):
            w = sk["w"][k * nb:(k + 1) * nb]
            self.assertEqual(sum(w), 256)
            self.assertLessEqual(sum(1 for x in w if x), 3)
        self.assertEqual(len(sk["tris"]) % 3, 0)
        self.assertLess(max(sk["tris"]), nv)
        self.assertEqual(sorted(set(sk["tris"])), list(range(nv)))  # every copy is used
        self.assertNotIn("grid", sk)

    def test_deterministic_json(self):
        u = canvas(64, [(8, 8, 18, 56), (24, 8, 34, 56), (8, 48, 34, 56)])
        dw = np.full((64, 64), 0.5, np.float32)
        a = json.dumps(self.mesh.build_skin(u, bones((13, 12), (29, 12)), 12, None, dw)[0])
        b = json.dumps(self.mesh.build_skin(u, bones((13, 12), (29, 12)), 12, None, dw)[0])
        self.assertEqual(a, b)
        self.assertIn('"dw"', a)

    def test_front_bone_draws_last(self):
        u = canvas(48, [(4, 12, 42, 36)])
        bs = bones((8, 24), (36, 24))
        bs[1]["front"] = True
        sk, _ = self.mesh.build_skin(u, bs, 12)
        t, nb = sk["tris"], 2
        lead = [int(np.argmax(sum(np.array(sk["w"][t[a + k] * nb:(t[a + k] + 1) * nb]) for k in range(3)))) for a in range(0, len(t), 3)]
        self.assertEqual(lead, sorted(lead))
        self.assertIn(1, lead)

    def test_debug_images(self):
        u = canvas(48, [(4, 12, 20, 36), (26, 12, 42, 36)])
        sk, info = self.mesh.build_skin(u, bones((12, 24), (34, 24)), 12)
        with tempfile.TemporaryDirectory() as d:
            self.mesh.debug_images(u, sk, info, d)
            self.assertEqual(sorted(os.listdir(d)), ["mesh.png", "weights.png"])


if __name__ == "__main__":
    unittest.main()
