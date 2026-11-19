"""Tests for cn-controls.py: python3 tools/assets/hud-gen/test_cn_controls.py (needs Pillow)."""
import contextlib, importlib.util, io, json, os, sys, tempfile, unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[2]


def load(path, name):
    spec = importlib.util.spec_from_file_location(name, path)
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


class T(unittest.TestCase):
    def test_build_and_validate(self):
        from PIL import Image
        cn = load(HERE / "cn-controls.py", "cn_controls")
        scratch = REPO / ".scratch" / "unittest-tmp"
        scratch.mkdir(parents=True, exist_ok=True)
        with tempfile.TemporaryDirectory(dir=scratch) as td:
            qs = cn.build(td)
            self.assertEqual(len(list(Path(td, "control").glob("icon_*.png"))), 13)
            for p in Path(td, "control").glob("*.png"):
                im = Image.open(p)
                self.assertEqual(im.size, (1024, 1024))
                self.assertGreater(im.getextrema()[1], 200, p.name)  # not blank
                self.assertEqual(im.getpixel((0, 0)), 0)
            counts = {fn: sum(len(j["seeds"]) * len(j["scales"]) for j in jobs) for fn, (_s, _n, jobs) in qs.items()}
            self.assertEqual(counts, {"queue-icons-cat-cn.json": 104, "queue-fx-cn.json": 48})
            gq = load(REPO / "tools/assets/roster24-art/gpu-queue.py", "gpuq_for_cn")
            for fn in qs:
                self.assertFalse(any(j.get("bulk") for j in json.loads((Path(td) / fn).read_text())["jobs"]))
                sys.argv = ["gpu-queue.py", str(Path(td) / fn), str(Path(td) / "work"), "--dry-run", "--no-files"]
                buf = io.StringIO()
                code = 0
                with contextlib.redirect_stdout(buf):
                    try:
                        gq.main()
                    except SystemExit as e:
                        code = e.code or 0
                self.assertEqual(code, 0, buf.getvalue())
                self.assertNotIn("ERROR", buf.getvalue())


if __name__ == "__main__":
    unittest.main()
