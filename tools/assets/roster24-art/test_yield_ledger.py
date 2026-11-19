import importlib.util
import json
import os
import subprocess
import sys
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
SCRIPT = os.path.join(HERE, "yield-ledger.py")
spec = importlib.util.spec_from_file_location("yield_ledger", SCRIPT)
yl = importlib.util.module_from_spec(spec)
spec.loader.exec_module(yl)

# synthetic files live under the worktree's gitignored .scratch/
SCRATCH = os.path.realpath(os.path.join(HERE, "..", "..", "..", ".scratch", "yield-ledger-test"))


def w(base, rel, obj):
    p = os.path.join(base, rel)
    os.makedirs(os.path.dirname(p), exist_ok=True)
    with open(p, "w") as f:
        json.dump(obj, f)


class T(unittest.TestCase):
    def setUp(self):
        self.base = os.path.join(SCRATCH, self._testMethodName)
        w(self.base, "a/approval.json", {"fx_rock": {"approved": None, "verdict": "REJECT", "note": "too flat"},
                                         "ok": {"approved": "x.png"}})
        w(self.base, "b/approval.json", {"fx2_rock": {"approved": None, "verdict": "REVISE", "note": "too flat"},
                                         "ok": {"approved": ["y.png"]}})
        w(self.base, "c/approval-1.json", {"rock2": {"approved": None}})
        w(self.base, "d/approval.json", {"date": "x", "verdict": "none approved", "slots": {}})
        w(self.base, "e/approval.json", {})

    def test_tally(self):
        slots, n = yl.scan([self.base])
        self.assertEqual(n, 5)
        r = slots["rock"]
        self.assertEqual((r["rounds"], r["REJECT"], r["REVISE"], r["APPROVED"]), (3, 2, 1, 0))
        self.assertTrue(yl.is_stuck(r))
        self.assertEqual(r["reasons"]["too flat"], 2)
        self.assertFalse(yl.is_stuck(slots["ok"]))
        self.assertEqual(slots["d"]["REJECT"], 1)

    def test_render(self):
        slots, n = yl.scan([self.base])
        text = yl.render(slots, n)
        self.assertIn("| rock | 3 |", text)
        self.assertIn("Stuck slots (2+ failed rounds, never approved): rock", text)
        self.assertIn("i2i/ControlNet", text)  # 3 failed rounds -> rung 2

    def test_out_refused(self):
        for bad in ("src/x.md", "public/x.md", "tools/x.md"):
            with self.assertRaises(SystemExit):
                yl.check_out(os.path.join(self.base, bad))
        r = subprocess.run([sys.executable, "-I", SCRIPT, self.base, "--out", os.path.join(self.base, "tools", "o.md")],
                           capture_output=True, text=True)
        self.assertNotEqual(r.returncode, 0)

    def test_out_written(self):
        out = os.path.join(self.base, "ledger.md")
        r = subprocess.run([sys.executable, "-I", SCRIPT, self.base, "--out", out], capture_output=True, text=True)
        self.assertEqual(r.returncode, 0, r.stderr)
        with open(out) as f:
            self.assertIn("rock", f.read())


if __name__ == "__main__":
    unittest.main()
