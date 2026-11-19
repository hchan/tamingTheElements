"""unittest for ctl.py with a fake pueue, fake nvidia-smi and fake gpu-queue.py. No network, no GPU, no real pueue.
Run: python3 -m unittest discover -s tools/gpu-queue"""
import io, json, os, shutil, sys, tarfile, tempfile, time, unittest
from contextlib import redirect_stdout, redirect_stderr
from unittest import mock

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import ctl  # noqa: E402

TD = os.path.join(HERE, "testdata")
FAKE_GQ = """import os, sys
if "--dry-run" in sys.argv:
    print("eta 1h")
    sys.exit(int(os.environ.get("FAKE_DRY_RC", "0")))
sys.exit(int(os.environ.get("FAKE_GQ_RC", "0")))
"""


def tar_bytes(files):
    b = io.BytesIO()
    with tarfile.open(fileobj=b, mode="w") as tf:
        for n, data in files.items():
            ti = tarfile.TarInfo(n)
            ti.size = len(data)
            tf.addfile(ti, io.BytesIO(data))
    return b.getvalue()


def wr(path, text):
    with open(path, "w") as f:
        f.write(text)


class Base(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp(prefix="ctltest-")
        self.addCleanup(shutil.rmtree, self.tmp, True)
        self.home = os.path.join(self.tmp, "home")
        os.makedirs(os.path.join(self.home, "bin"))
        for n, v in (("token", "tok"), ("admin.token", "adm")):
            wr(os.path.join(self.home, n), v)
        shutil.copy(os.path.join(TD, "fake_pueue.py"), os.path.join(self.tmp, "pueue"))
        shutil.copy(os.path.join(TD, "fake_pueued.py"), os.path.join(self.tmp, "pueued"))
        wr(os.path.join(self.home, "bin", "gpu-queue.py"), FAKE_GQ)
        self.proc = os.path.join(self.tmp, "proc")
        os.makedirs(self.proc)
        self.setproc(avail_kb=16 * 1024 * 1024)
        self.state = os.path.join(self.tmp, "pueue-state.json")
        env = {"TTE_JOBS_HOME": self.home, "TTE_JOBS_PUEUE": os.path.join(self.tmp, "pueue"),
               "TTE_JOBS_PUEUED": os.path.join(self.tmp, "pueued"), "FAKE_PUEUE_STATE": self.state,
               "TTE_JOBS_NVSMI": os.path.join(TD, "fake_nvidia_smi.sh"), "TTE_JOBS_PROC": self.proc,
               "TTE_JOBS_PY": sys.executable, "TTE_JOBS_NO_WATCHDOG": "1", "TTE_JOBS_FAKE_FREE_GB": "100",
               "TTE_JOBS_NOW": "2026-11-18T12:00:00", "TTE_JOBS_GRACE": "0", "FAKE_TEMP": "50"}
        p = mock.patch.dict(os.environ, env)
        p.start()
        self.addCleanup(p.stop)

    def setproc(self, avail_kb):
        wr(os.path.join(self.proc, "meminfo"), f"MemTotal: 33554432 kB\nMemAvailable: {avail_kb} kB\n")
        wr(os.path.join(self.proc, "loadavg"), "0.50 0.40 0.30 1/200 999\n")

    def call(self, argv, stdin=b"tok\n"):
        out, err = io.StringIO(), io.StringIO()
        with redirect_stdout(out), redirect_stderr(err):
            rc = ctl.main(argv, io.BytesIO(stdin))
        lines = [l for l in out.getvalue().splitlines() if l.startswith("{")]
        return rc, (json.loads(lines[-1]) if lines else {}), err.getvalue()

    def submit(self, owner="a", queue=None, now=False, tok=b"tok\n"):
        q = json.dumps(queue or {"jobs": [{"bulk": False}]}).encode()
        argv = ["submit", "--owner", owner] + (["--now"] if now else [])
        return self.call(argv, tok + tar_bytes({"queue.json": q}))

    def pstate(self):
        with open(self.state) as f:
            return json.load(f)

    def save_pstate(self, s):
        wr(self.state, json.dumps(s))

    def set_status(self, tid, status):
        s = self.pstate()
        s["tasks"][str(tid)]["status"] = status
        self.save_pstate(s)


class Clock(unittest.TestCase):
    def test_window(self):
        from datetime import datetime as D
        for h, want in ((22, False), (23, True), (3, True), (6, True), (7, False), (12, False)):
            self.assertEqual(ctl.window_open(D(2026, 11, 18, h, 30)), want, h)

    def test_next_window(self):
        from datetime import datetime as D
        self.assertEqual(ctl.next_window_start(D(2026, 11, 18, 12, 5)), D(2026, 11, 18, 23, 0))
        self.assertEqual(ctl.next_window_start(D(2026, 11, 18, 2, 5)), D(2026, 11, 18, 2, 5))


class Auth(Base):
    def test_bad_token(self):
        self.assertEqual(self.call(["status"], b"nope\n")[0], 77)

    def test_no_server_token(self):
        os.remove(os.path.join(self.home, "token"))
        self.assertEqual(self.call(["status"])[0], 97)

    def test_admin_verbs_need_admin_token(self):
        self.assertEqual(self.call(["pause"])[0], 77)
        self.assertEqual(self.call(["pause"], b"tok wrong\n")[0], 77)
        self.assertEqual(self.call(["pause"], b"tok adm\n")[0], 0)

    def test_version_needs_no_token(self):
        rc, o, _ = self.call(["version"], b"")
        self.assertEqual((rc, o["proto"]), (0, ctl.PROTO))


class Init(Base):
    def test_init_creates_tokens_once(self):
        shutil.rmtree(self.home)
        rc, o, _ = self.call(["init"], b"")
        self.assertEqual((rc, o["initialized"]), (0, True))
        self.assertNotEqual(o["token"], o["admin"])
        self.assertEqual(os.stat(os.path.join(self.home, "token")).st_mode & 0o777, 0o600)
        with open(os.path.join(self.home, "pueue.yml")) as f:
            self.assertIn("unix_socket_path", f.read())
        self.assertFalse(self.call(["init"], b"")[1]["initialized"])
        rc, o2, _ = self.call(["init", "--rotate"], b"")
        self.assertNotEqual(o2["token"], o["token"])
        self.assertEqual(self.call(["status"], f"{o2['token']}\n".encode())[0], 0)
        self.assertEqual(self.call(["status"], f"{o['token']}\n".encode())[0], 77)


class Submit(Base):
    def test_queues_and_reports_place(self):
        rc, o, _ = self.submit("a")
        self.assertEqual((rc, o["place"], o["ahead"]), (0, 1, 0))
        rc, o2, _ = self.submit("b")
        self.assertEqual(o2["place"], 2)
        t = self.pstate()["tasks"][str(o["tid"])]
        self.assertEqual((t["group"], t["label"]), ("gpu", "a"))
        self.assertIn("run-gpu " + o["id"], t["command"])
        self.assertNotIn("delay", t)

    def test_groups_created(self):
        self.submit()
        self.assertTrue({"gpu", "cpu-short", "cpu-full"} <= set(self.pstate()["groups"]))

    def test_disk_low_refused(self):
        os.environ["TTE_JOBS_FAKE_FREE_GB"] = "9.9"
        rc, _, err = self.submit()
        self.assertEqual(rc, 97)
        self.assertIn("disk low", err)
        self.assertEqual(os.listdir(ctl.jobs_dir()), [])

    def test_bulk_outside_window_delayed_to_2300(self):
        rc, o, _ = self.submit(queue={"jobs": [{"bulk": True}]})
        self.assertEqual(o["start"], "2026-11-18 23:00:00")
        self.assertEqual(self.pstate()["tasks"][str(o["tid"])]["delay"], "2026-11-18 23:00:00")

    def test_bulk_inside_window_not_delayed(self):
        os.environ["TTE_JOBS_NOW"] = "2026-11-18T01:00:00"
        rc, o, _ = self.submit(queue={"jobs": [{"bulk": True}]})
        self.assertEqual(o["start"], "now")

    def test_now_needs_admin(self):
        self.assertEqual(self.submit(now=True)[0], 77)
        rc, o, _ = self.submit(queue={"jobs": [{"bulk": True}]}, now=True, tok=b"tok adm\n")
        self.assertEqual((rc, o["start"]), (0, "now"))

    def test_invalid_queue_exit_6_and_cleanup(self):
        os.environ["FAKE_DRY_RC"] = "6"
        self.addCleanup(os.environ.pop, "FAKE_DRY_RC", None)
        self.assertEqual(self.submit()[0], 6)
        self.assertEqual(os.listdir(ctl.jobs_dir()), [])

    def test_missing_queue_json(self):
        rc, _, _ = self.call(["submit", "--owner", "a"], b"tok\n" + tar_bytes({"x": b"1"}))
        self.assertEqual(rc, 6)

    def test_path_traversal_refused(self):
        rc, _, err = self.call(["submit", "--owner", "a"], b"tok\n" + tar_bytes({"../evil": b"1"}))
        self.assertEqual(rc, 2)
        self.assertFalse(os.path.exists(os.path.join(self.home, "evil")))

    def test_bad_owner(self):
        self.assertEqual(self.submit("a b;rm")[0], 2)


class OwnershipAndList(Base):
    def test_cancel_not_yours_77(self):
        _, o, _ = self.submit("a")
        self.assertEqual(self.call(["cancel", "--owner", "b", o["id"]])[0], 77)
        self.assertIn(str(o["tid"]), self.pstate()["tasks"])

    def test_force_needs_admin(self):
        _, o, _ = self.submit("a")
        self.assertEqual(self.call(["cancel", "--owner", "b", "--force", o["id"]])[0], 77)
        self.assertEqual(self.call(["cancel", "--owner", "b", "--force", o["id"]], b"tok adm\n")[0], 0)
        self.assertEqual(self.pstate()["tasks"], {})

    def test_cancel_queued_removes(self):
        _, o, _ = self.submit("a")
        rc, r, _ = self.call(["cancel", "--owner", "a", o["id"]])
        self.assertEqual((rc, r["state"]), (0, "cancelled"))
        self.assertEqual(self.pstate()["tasks"], {})

    def test_cancel_running_sigterm_then_kill(self):
        _, o, _ = self.submit("a")
        self.set_status(o["tid"], "Running")
        self.assertEqual(self.call(["cancel", "--owner", "a", o["id"]])[0], 0)
        log = self.pstate()["log"]
        self.assertIn(["kill", "--signal", "sigterm", str(o["tid"])], log)
        self.assertIn(["kill", str(o["tid"])], log)  # grace 0: escalated

    def test_list_only_own_unless_all(self):
        self.submit("a"); self.submit("b")
        rows = self.call(["list", "--owner", "a"])[1]["jobs"]
        self.assertEqual([r["owner"] for r in rows], ["a"])
        rows = self.call(["list", "--all"])[1]["jobs"]
        self.assertEqual(sorted(r["owner"] for r in rows), ["a", "b"])
        self.assertEqual(sorted(r["place"] for r in rows), [1, 2])

    def test_vanished_task_marked_lost(self):
        _, o, _ = self.submit("a")
        s = self.pstate(); s["tasks"] = {}; self.save_pstate(s)
        rows = self.call(["list", "--owner", "a"])[1]["jobs"]
        self.assertEqual(rows[0]["state"], "lost")

    def test_reorder_admin(self):
        _, a, _ = self.submit("a"); _, b, _ = self.submit("b")
        self.assertEqual(self.call(["reorder", "--before", a["id"], b["id"]])[0], 77)
        self.assertEqual(self.call(["reorder", "--before", a["id"], b["id"]], b"tok adm\n")[0], 0)
        rows = {r["id"]: r["place"] for r in self.call(["list", "--all"])[1]["jobs"]}
        self.assertEqual((rows[b["id"]], rows[a["id"]]), (1, 2))


class Status(Base):
    def test_load_view(self):
        self.submit("a")
        rc, o, _ = self.call(["status"])
        self.assertEqual(rc, 0)
        self.assertEqual(o["gpu"]["temp"], 50.0)
        self.assertEqual(o["load"], [0.5, 0.4, 0.3])
        self.assertEqual(o["mem"]["avail_kb"], 16 * 1024 * 1024)
        self.assertEqual(o["disk_free_gb"], 100.0)
        self.assertFalse(o["window_open"])
        self.assertEqual(len(o["lanes"]["gpu"]["queued"]), 1)
        self.assertEqual(o["lanes"]["cpu-short"], {"running": [], "queued": []})


class Watchdog(Base):
    def setUp(self):
        super().setUp()
        self.submit("a")
        self.set_status(0, "Running")

    def log(self):
        return self.pstate()["log"]

    def test_thermal_kills_pauses_then_resumes_below_75(self):
        os.environ["TTE_JOBS_FAKE_TEMP"] = "84"
        self.addCleanup(os.environ.pop, "TTE_JOBS_FAKE_TEMP", None)
        p = ctl.watchdog_tick(1000)
        self.assertTrue(p["thermal"])
        self.assertIn(["kill", "--group", "gpu"], self.log())
        # killed job is requeued with a delay (retry-wait -> queued by reconcile)
        self.assertEqual(ctl.read_meta(os.listdir(ctl.jobs_dir())[0])["state"], "queued")
        self.assertTrue(any(a[0] == "enqueue" and "--delay" in a for a in self.log()))
        os.environ["TTE_JOBS_FAKE_TEMP"] = "78"  # hysteresis: still blocked
        self.assertTrue(ctl.watchdog_tick(1015)["thermal"])
        self.assertNotIn(["start", "--group", "gpu"], self.log())
        os.environ["TTE_JOBS_FAKE_TEMP"] = "70"
        p = ctl.watchdog_tick(1030)
        self.assertFalse(p["thermal"])
        self.assertIn(["start", "--group", "gpu"], self.log())
        self.assertFalse(any(a[:1] == ["start"] and a[1].isdigit() for a in self.log() if len(a) > 1))

    def test_82_degrees_no_action(self):
        os.environ["TTE_JOBS_FAKE_TEMP"] = "82"
        self.addCleanup(os.environ.pop, "TTE_JOBS_FAKE_TEMP", None)
        self.assertFalse(ctl.watchdog_tick(1000).get("thermal"))
        self.assertNotIn(["kill", "--group", "gpu"], self.log())

    def test_ram_needs_30s_then_pauses_with_wait(self):
        self.setproc(3 * 1024 * 1024)
        ctl.watchdog_tick(1000)
        ctl.watchdog_tick(1020)
        self.assertNotIn(["pause", "--group", "gpu", "--wait"], self.log())
        ctl.watchdog_tick(1031)
        self.assertIn(["pause", "--group", "gpu", "--wait"], self.log())
        self.setproc(5 * 1024 * 1024)  # between 4 and 6 GB: stay paused
        self.assertTrue(ctl.watchdog_tick(1100)["ram"])
        self.setproc(7 * 1024 * 1024)
        self.assertFalse(ctl.watchdog_tick(1115)["ram"])
        self.assertIn(["start", "--group", "gpu"], self.log())

    def test_ram_blip_does_not_pause(self):
        self.setproc(3 * 1024 * 1024)
        ctl.watchdog_tick(1000)
        self.setproc(7 * 1024 * 1024)
        ctl.watchdog_tick(1010)
        self.setproc(3 * 1024 * 1024)
        ctl.watchdog_tick(1035)
        self.assertNotIn(["pause", "--group", "gpu", "--wait"], self.log())

    def test_admin_pause_blocks_auto_resume(self):
        self.call(["pause"], b"tok adm\n")
        ctl.watchdog_tick(1000)
        self.assertNotIn(["start", "--group", "gpu"], self.log())
        self.call(["resume"], b"tok adm\n")
        self.assertIn(["start", "--group", "gpu"], self.log())

    def test_resume_blocked_while_thermal(self):
        os.environ["TTE_JOBS_FAKE_TEMP"] = "90"
        self.addCleanup(os.environ.pop, "TTE_JOBS_FAKE_TEMP", None)
        ctl.watchdog_tick(1000)
        self.call(["pause"], b"tok adm\n")
        self.call(["resume"], b"tok adm\n")
        self.assertNotIn(["start", "--group", "gpu"], self.log())

    def test_heartbeat_in_status(self):
        ctl.watchdog_tick(time.time())
        self.assertLess(self.call(["status"])[1]["watchdog_age_s"], 5)


class RunGpu(Base):
    def run_with(self, rc, now="2026-11-18T12:00:00"):
        os.environ["TTE_JOBS_NOW"] = now
        os.environ["FAKE_GQ_RC"] = str(rc)
        self.addCleanup(os.environ.pop, "FAKE_GQ_RC", None)
        _, o, _ = self.submit("a")
        self.call(["list", "--all"])
        self.assertEqual(ctl.main(["run-gpu", o["id"]], io.BytesIO()), rc)
        return ctl.read_meta(o["id"])

    def test_ok(self):
        self.assertEqual(self.run_with(0)["state"], "done")

    def test_rc2_retries_at_2300(self):
        m = self.run_with(2)
        self.assertEqual(m["state"], "retry-wait")
        self.assertEqual(time.strftime("%H:%M", time.localtime(m["retry_at"])), "23:00")

    def test_rc3_retries_in_10_minutes(self):
        m = self.run_with(3)
        self.assertEqual(m["state"], "retry-wait")
        self.assertEqual(round(m["retry_at"] - time.mktime(time.strptime("2026-11-18 12:00", "%Y-%m-%d %H:%M"))), 600)

    def test_other_rc_fails(self):
        self.assertEqual(self.run_with(1)["state"], "failed")

    def test_gives_up_after_6_retries(self):
        os.environ["FAKE_GQ_RC"] = "3"
        self.addCleanup(os.environ.pop, "FAKE_GQ_RC", None)
        _, o, _ = self.submit("a")
        for _ in range(ctl.MAX_RETRIES + 1):
            ctl.main(["run-gpu", o["id"]], io.BytesIO())
        self.assertEqual(ctl.read_meta(o["id"])["state"], "failed")

    def test_reconcile_requeues_retry_when_pueue_task_done(self):
        m = self.run_with(3)
        self.set_status(m["tid"], {"Done": "Failed"})
        self.call(["list", "--all"])
        log = self.pstate()["log"]
        self.assertIn(["restart", "--in-place", "--stashed", str(m["tid"])], [[str(x) for x in a] for a in log if a[0] == "restart"])
        self.assertTrue(any(a[0] == "enqueue" and "--delay" in a for a in log))
        self.assertEqual(ctl.read_meta(m["id"])["state"], "queued")


class Retention(Base):
    def test_gc_removes_only_final_older_than_14_days(self):
        _, old, _ = self.submit("a"); _, fresh, _ = self.submit("a"); _, live, _ = self.submit("a")
        for jid, state, age in ((old["id"], "done", 15), (fresh["id"], "done", 13), (live["id"], "queued", 40)):
            m = ctl.read_meta(jid)
            m.update(state=state, created=time.time() - age * 86400)
            m.pop("finished", None)
            ctl.write_meta(m)
        self.assertEqual(ctl.gc(), [old["id"]])
        self.assertFalse(os.path.exists(ctl.jdir(old["id"])))
        self.assertTrue(os.path.exists(ctl.jdir(fresh["id"])))
        self.assertTrue(os.path.exists(ctl.jdir(live["id"])))

    def test_recent_fetch_extends_retention(self):
        _, o, _ = self.submit("a")
        m = ctl.read_meta(o["id"])
        m.update(state="done", created=time.time() - 30 * 86400, fetched=time.time())
        ctl.write_meta(m)
        self.assertEqual(ctl.gc(), [])


class RawAndSelftest(Base):
    def test_submit_raw_cpu_lane(self):
        off = os.path.join(self.tmp, "off", "jobs", "j1")
        os.makedirs(off)
        wr(os.path.join(off, "job.sh"), "true\n")
        os.environ["TTE_OFFLOAD_HOME"] = os.path.join(self.tmp, "off")
        self.addCleanup(os.environ.pop, "TTE_OFFLOAD_HOME", None)
        rc, o, _ = self.call(["submit-raw", "--owner", "a", "--lane", "cpu-short", "j1"])
        self.assertEqual(rc, 0)
        self.assertEqual(self.pstate()["tasks"][str(o["tid"])]["group"], "cpu-short")
        self.assertEqual(self.call(["submit-raw", "--owner", "a", "--lane", "gpu", "j1"])[0], 2)

    def test_selftest_ok(self):
        rc, o, _ = self.call(["selftest"])
        self.assertEqual((rc, o["ok"]), (0, True))


if __name__ == "__main__":
    unittest.main()
