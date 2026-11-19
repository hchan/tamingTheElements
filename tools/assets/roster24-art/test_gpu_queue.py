"""Tests for gpu-queue.py v2 with fake torch/diffusers (no GPU needed).

Run (stdlib only, no pytest):  PYTHONDONTWRITEBYTECODE=1 python3 -m unittest -v test_gpu_queue
from this directory, or:        python3 -m unittest discover -s tools/assets/roster24-art -p 'test_gpu_queue.py'

Pillow is optional: tests that decode real images (cn / i2i runs, aspect and alpha warnings) are skipped without it.
v1 is the commit 2582dfb3 version, read with `git show`; v2 is the working copy next to this file.
"""
import contextlib, fcntl, importlib.util, io, json, os, shutil, subprocess, sys, tempfile, types, unittest, weakref
from pathlib import Path

try:
    from PIL import Image
except ImportError:  # pragma: no cover
    Image = None

needs_pil = unittest.skipIf(Image is None, "Pillow not installed")

HERE = Path(__file__).resolve().parent
SCRATCH = Path(os.environ.get("TTE_TEST_TMP") or HERE.parents[2] / ".scratch" / "unittest-tmp")
V1_COMMIT = "2582dfb3"
CALLS = []


def load(path, name):
    spec = importlib.util.spec_from_file_location(name, path)
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


class Monkey:
    """Tiny stand-in for pytest's monkeypatch; undone by Base.tearDown."""
    _MISSING = object()

    def __init__(self):
        self._undo = []

    def setattr(self, obj, name, value):
        old = getattr(obj, name)
        self._undo.append(lambda: setattr(obj, name, old))
        setattr(obj, name, value)

    def setitem(self, d, key, value):
        old = d.get(key, self._MISSING)
        self._undo.append(lambda: d.pop(key, None) if old is self._MISSING else d.__setitem__(key, old))
        d[key] = value

    def setenv(self, key, value):
        self.setitem(os.environ, key, value)

    def delenv(self, key):
        self.setitem(os.environ, key, "x")
        del os.environ[key]

    def undo(self):
        while self._undo:
            self._undo.pop()()


class Base(unittest.TestCase):
    def setUp(self):
        SCRATCH.mkdir(parents=True, exist_ok=True)
        self._td = tempfile.TemporaryDirectory(dir=SCRATCH)
        self.addCleanup(self._td.cleanup)
        self.tmp_path = Path(self._td.name)
        self.mp = Monkey()
        self.addCleanup(self.mp.undo)
        # main() setdefault()s this into os.environ; make sure it starts unset and is restored afterwards
        self.mp.setenv("PYTORCH_CUDA_ALLOC_CONF", "x")
        self.mp.delenv("PYTORCH_CUDA_ALLOC_CONF")

    def v2(self):
        return load(HERE / "gpu-queue.py", "gpuq2")

    def v1(self):
        r = subprocess.run(["git", "show", f"{V1_COMMIT}:tools/assets/roster24-art/gpu-queue.py"], cwd=HERE,
                           capture_output=True, text=True)
        if r.returncode != 0:
            self.skipTest(f"git history for {V1_COMMIT} not available")
        p = self.tmp_path / "gpu-queue-v1.py"
        p.write_text(r.stdout)
        return load(p, "gpuq1")

    def run_q(self, mod, queue, argv=(), **kw):
        with contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()):
            return run(mod, self.mp, self.tmp_path, queue, argv, **kw)

    def fakes(self):
        fakes(self.mp)


class FakeIm:
    def save(self, path):
        Path(path).write_bytes(b"png")


class FakeVae:
    def enable_tiling(self):
        CALLS.append(("tiling", True))

    def disable_tiling(self):
        CALLS.append(("tiling", False))


def _view(v):
    return ("img", v.size) if Image is not None and isinstance(v, Image.Image) else v


# keyword arguments accepted by the diffusers SDXL __call__ signatures we use
T2I_KW = {"prompt", "negative_prompt", "num_inference_steps", "guidance_scale", "width", "height", "generator"}
ALLOWED_KW = {
    "StableDiffusionXLPipeline": T2I_KW,
    "StableDiffusionXLControlNetPipeline": T2I_KW | {"image", "controlnet_conditioning_scale"},
    "StableDiffusionXLImg2ImgPipeline": {"prompt", "negative_prompt", "image", "strength", "num_inference_steps",
                                         "guidance_scale", "generator"},
}
INSTANCES = []  # weakrefs to every pipeline created, in order


class FakePipe:
    def __init__(self, cls):
        self.cls, self.vae = cls, FakeVae()

    @classmethod
    def from_pretrained(cls, *a, **k):
        # at the moment a new pipeline loads, every earlier one must already be garbage
        CALLS.append(("load", cls.__name__, a[0], k.get("torch_dtype"),
                      tuple(r() is not None for r in INSTANCES)))
        p = cls(cls.__name__)
        INSTANCES.append(weakref.ref(p))
        return p

    def enable_model_cpu_offload(self):
        CALLS.append(("offload", "model"))

    def enable_sequential_cpu_offload(self):
        CALLS.append(("offload", "seq"))

    def set_progress_bar_config(self, **k):
        pass

    def remove_all_hooks(self):
        CALLS.append(("remove_hooks", self.cls))

    def __call__(self, **kw):
        bad = set(kw) - ALLOWED_KW[self.cls]
        assert not bad, f"{self.cls} got unknown kwargs {sorted(bad)}"
        kw = {k: _view(v) for k, v in kw.items()}
        CALLS.append(("call", self.cls, kw))
        return types.SimpleNamespace(images=[FakeIm()])


def _mkcls(n):
    return type(n, (FakePipe,), {})


def fakes(monkeypatch):
    CALLS.clear()
    INSTANCES.clear()
    torch = types.ModuleType("torch")
    torch.float16 = "fp16"
    torch.Generator = lambda dev: types.SimpleNamespace(manual_seed=lambda s: ("gen", s))
    torch.cuda = types.SimpleNamespace(empty_cache=lambda: CALLS.append(("empty_cache",)))
    dif = types.ModuleType("diffusers")
    for n in ("StableDiffusionXLPipeline", "StableDiffusionXLControlNetPipeline", "StableDiffusionXLImg2ImgPipeline"):
        setattr(dif, n, _mkcls(n))
    dif.ControlNetModel = type("ControlNetModel", (), {"from_pretrained": staticmethod(lambda *a, **k: "cn")})
    cv2 = types.ModuleType("cv2")
    cv2.Canny = lambda img, a, b: img
    np = types.ModuleType("numpy")

    def arr(img):
        CALLS.append(("canny_size", img.size))
        return img
    np.array, np.stack = arr, lambda lst, axis: lst
    for k, m in (("torch", torch), ("diffusers", dif), ("cv2", cv2), ("numpy", np)):
        monkeypatch.setitem(sys.modules, k, m)
    if Image is not None:
        monkeypatch.setattr(Image, "fromarray", lambda a: Image.new("RGB", (4, 4)))


def run(mod, monkeypatch, tmp_path, queue, argv=(), *, night=True, temp=None, mem=10.0, strays=([], []),
        gpu_lock=None):
    qp = tmp_path / "q.json"
    qp.write_text(json.dumps(queue))
    out = tmp_path / "work"
    monkeypatch.setenv("TTE_GPU_LOCK", str(gpu_lock or tmp_path / "gpu.lock"))
    monkeypatch.setattr(mod, "gpu", lambda f: temp)
    monkeypatch.setattr(mod, "mem_avail_gb", lambda: mem)
    monkeypatch.setattr(mod, "night", lambda: night)
    monkeypatch.setattr(mod, "stray_gpu_procs", lambda: strays)
    monkeypatch.setattr(mod.time, "sleep", lambda s: None)
    monkeypatch.setattr(sys, "argv", ["gpu-queue.py", str(qp), str(out), *argv])
    try:
        mod.main()
        code = 0
    except SystemExit as e:
        code = e.code if isinstance(e.code, int) else 1
    return code, out


def outs(out):
    d = out / "out"
    return sorted(p.name for p in d.iterdir()) if d.exists() else []


def calls_of(kind="call"):
    return [c for c in CALLS if c[0] == kind]


def png(path, size=(64, 64), mode="RGB"):
    if Image is not None:
        Image.new(mode, size).save(path)
    else:  # existence-only placeholder; tests that decode images are skipped without Pillow
        Path(path).write_bytes(b"\x89PNG placeholder")
    return str(path)


def base_q(jobs, **kw):
    return {"style": ", s", "neg": "bad", "jobs": jobs, **kw}


# ---- v1 compatibility ---------------------------------------------------------------------------------------

def old_queue(tmp_path):
    return base_q([
        {"name": "a", "kind": "t2i", "prompt": "p1", "seeds": [1, 2], "cfg": 5, "steps": 10},
        {"name": "b", "prompt": "p2", "neg_extra": "x", "seeds": [3]},
        {"name": "c", "kind": "cn", "prompt": "p3", "control": png(tmp_path / "c.png"), "seeds": [4, 5],
         "scales": [0.5, 0.7]},
    ])


def strip_gen(calls):
    return [c for c in calls if c[0] == "call"]


class V1Compat(Base):
    @needs_pil
    def test_v1_v2_same_args_and_names(self):
        v1, v2 = self.v1(), self.v2()
        self.fakes()
        q = old_queue(self.tmp_path)
        c1, o1 = self.run_q(v1, q, ["--now"])
        calls1, names1 = strip_gen(CALLS), outs(o1)
        tiling1 = [c for c in CALLS if c[0] == "tiling"]
        CALLS.clear()
        shutil.rmtree(o1)
        c2, o2 = self.run_q(v2, q, ["--now"])
        self.assertEqual((c1, c2), (0, 0))
        self.assertEqual(names1, outs(o2))
        self.assertEqual(len(names1), 7)
        self.assertIn("a_1.png", names1)
        self.assertIn("c_4_s0.5.png", names1)
        tiling2 = [c for c in CALLS if c[0] == "tiling"]
        self.assertEqual(strip_gen(CALLS), calls1)
        self.assertTrue(any(c[2]["width"] == 1024 for c in calls1))
        # Intentional v2 change: v1 enabled VAE tiling once per pipeline load; v2 sets it per image (off at <= 1024x1024).
        self.assertTrue(tiling1 and all(on for _, on in tiling1))
        self.assertTrue(tiling2 and not any(on for _, on in tiling2))
        self.assertEqual(len(tiling2), len(calls1))  # one decision per image

    @needs_pil
    def test_make_queues_outputs_v1_v2_and_validate(self):
        v1, v2 = self.v1(), self.v2()
        self.fakes()
        concepts = self.tmp_path / "gen.py"
        concepts.write_text('H = {\n"alpha":"a fire thing",\n"beta":"a water thing",\n}\n')
        qd = self.tmp_path / "queues"
        qd.mkdir()
        subprocess.run([sys.executable, "-B", str(HERE / "make-queues.py"), str(concepts), str(qd)], check=True,
                       capture_output=True)
        ctrl = png(self.tmp_path / "ctrl.png")
        for qf in ("queue-glimmaw-cn.json", "queue-night.json"):
            q = json.loads((qd / qf).read_text())
            errs, _ = v2.validate(q, check_files=False)
            self.assertEqual(errs, [], qf)
            for j in q["jobs"]:
                if j.get("control"):
                    j["control"] = ctrl
            errs, _ = v2.validate(q)
            self.assertEqual(errs, [])
            results = []
            for mod in (v1, v2):
                CALLS.clear()
                code, out = self.run_q(mod, q, ["--now"])
                results.append((code, outs(out), strip_gen(CALLS)))
                shutil.rmtree(out)
            self.assertEqual(results[0], results[1])
            self.assertEqual(results[0][0], 0)
            self.assertTrue(results[0][1])


# ---- v2 features --------------------------------------------------------------------------------------------

class V2Features(Base):
    @needs_pil
    def test_wide_t2i_no_tiling_and_size_name(self):
        v2 = self.v2()
        self.fakes()
        q = base_q([{"name": "w", "prompt": "p", "seeds": [1], "width": 1536, "height": 640}])
        code, out = self.run_q(v2, q)
        self.assertEqual(code, 0)
        self.assertEqual(outs(out), ["w_1_1536x640.png"])
        c = calls_of()[0][2]
        self.assertEqual((c["width"], c["height"]), (1536, 640))
        self.assertIn(("tiling", False), CALLS)
        self.assertNotIn(("tiling", True), CALLS)
        self.assertNotIn("PYTORCH_CUDA_ALLOC_CONF", os.environ)  # only set when sizes are mixed

    @needs_pil
    def test_big_size_enables_tiling_and_root_size_fallback(self):
        v2 = self.v2()
        self.fakes()
        q = base_q([{"name": "w", "prompt": "p", "seeds": [1]},
                    {"name": "n", "prompt": "p", "seeds": [1], "width": 768, "height": 768}],
                   width=1536, height=1024)
        code, out = self.run_q(v2, q)
        self.assertEqual(code, 0)
        self.assertEqual(outs(out), ["n_1_768x768.png", "w_1_1536x1024.png"])
        self.assertIn(("tiling", True), CALLS)
        self.assertEqual(os.environ.get("PYTORCH_CUDA_ALLOC_CONF"), "expandable_segments:True")

    @needs_pil
    def test_i2i(self):
        v2 = self.v2()
        self.fakes()
        init = png(self.tmp_path / "init.png", (512, 512), "RGBA")
        q = base_q([{"name": "i", "kind": "i2i", "prompt": "p", "init": init, "seeds": [9],
                     "strengths": [0.5, 0.75], "width": 1344, "height": 768}])
        code, out = self.run_q(v2, q)
        self.assertEqual(code, 0)
        self.assertEqual(outs(out), ["i_9_d0.5_1344x768.png", "i_9_d0.75_1344x768.png"])
        cs = calls_of()
        self.assertEqual({c[1] for c in cs}, {"StableDiffusionXLImg2ImgPipeline"})
        for c, st in zip(cs, (0.5, 0.75)):
            self.assertEqual(c[2]["strength"], st)
            self.assertNotIn("width", c[2])
            self.assertNotIn("height", c[2])
            self.assertEqual(c[2]["image"], ("img", (1344, 768)))
        self.assertEqual(calls_of("load")[0][1], "StableDiffusionXLImg2ImgPipeline")
        self.assertIn(("offload", "model"), CALLS)

    @needs_pil
    def test_cn_canny_at_job_size_and_pipeline_swap_frees_old(self):
        v2 = self.v2()
        self.fakes()
        q = base_q([{"name": "t", "prompt": "p", "seeds": [1]},
                    {"name": "c", "kind": "cn", "prompt": "p", "control": png(self.tmp_path / "c.png"),
                     "seeds": [1], "scales": [1]}], width=1216, height=832)
        code, out = self.run_q(v2, q)
        self.assertEqual(code, 0)
        self.assertIn(("canny_size", (1216, 832)), CALLS)
        cn = [c for c in calls_of() if c[1] == "StableDiffusionXLControlNetPipeline"][0][2]
        self.assertEqual(cn["controlnet_conditioning_scale"], 1.0)
        self.assertIsInstance(cn["controlnet_conditioning_scale"], float)
        self.assertEqual((cn["width"], cn["height"]), (1216, 832))
        self.assertIn(("remove_hooks", "StableDiffusionXLPipeline"), CALLS)
        self.assertLess(CALLS.index(("remove_hooks", "StableDiffusionXLPipeline")),
                        CALLS.index(calls_of("load")[-1]))
        # the old pipeline is really garbage (not just hook-stripped) when the new one loads
        self.assertEqual(calls_of("load")[0][4], ())
        self.assertEqual(calls_of("load")[-1][4], (False,))
        self.assertIn(("offload", "seq"), CALLS)

    def test_dry_run_no_torch_no_writes(self):
        v2 = self.v2()
        for m in ("torch", "diffusers"):
            self.mp.setitem(sys.modules, m, None)  # import raises ImportError
        lock = self.tmp_path / "gpu.lock"
        q = base_q([{"name": "w", "prompt": "p " * 100, "seeds": [1, 2], "width": 1536, "height": 640},
                    {"name": "c", "kind": "cn", "prompt": "p", "control": "/nope.png", "seeds": [1],
                     "scales": [0.5]}])
        before = sorted(p.name for p in self.tmp_path.iterdir())
        buf = io.StringIO()
        with contextlib.redirect_stdout(buf):
            code, out = run(v2, self.mp, self.tmp_path, q, ["--dry-run", "--no-files"])
        self.assertEqual(code, 0)
        self.assertEqual(sorted(p.name for p in self.tmp_path.iterdir()), sorted(before + ["q.json"]))
        self.assertFalse(out.exists())
        self.assertFalse(lock.exists())
        txt = buf.getvalue()
        for needle in ("1536x640", "images left 2/2", "TOTAL images left 3", "vram~", "tokens", "estimate"):
            self.assertIn(needle, txt)  # last two: long prompt warning

    def test_dry_run_reports_errors_with_exit_6(self):
        code, _ = self.run_q(self.v2(), base_q([{"name": "x", "prompt": "p", "seeds": [1], "width": 1001}]),
                             ["--dry-run"])
        self.assertEqual(code, 6)

    def test_unknown_flag_exits_64(self):
        self.fakes()
        code, out = self.run_q(self.v2(), base_q([{"name": "a", "prompt": "p", "seeds": [1]}]), ["--dryrun"])
        self.assertEqual(code, 64)
        self.assertFalse(out.exists())

    def test_invalid_queue_exits_6_before_torch(self):
        v2 = self.v2()
        self.mp.setitem(sys.modules, "torch", None)
        code, out = self.run_q(v2, base_q([{"name": "a", "prompt": "p", "seeds": [1], "kind": "zzz"}]))
        self.assertEqual(code, 6)
        self.assertFalse(out.exists())

    def test_gpu_lock_held_exits_5(self):
        v2 = self.v2()
        self.fakes()
        lock = self.tmp_path / "held.lock"
        f = open(lock, "a+")
        try:
            fcntl.flock(f, fcntl.LOCK_EX | fcntl.LOCK_NB)
            code, out = self.run_q(v2, base_q([{"name": "a", "prompt": "p", "seeds": [1]}]), gpu_lock=lock)
        finally:
            f.close()
        self.assertEqual(code, 5)
        self.assertEqual(outs(out), [])
        self.assertIn("BUSY", (out / "progress.log").read_text())

    @needs_pil
    def test_gpu_lock_records_pid_and_logs_start(self):
        self.fakes()
        code, out = self.run_q(self.v2(), base_q([{"name": "a", "prompt": "p", "seeds": [1]}]))
        self.assertEqual(code, 0)
        self.assertIn("START v2", (out / "progress.log").read_text())
        self.assertEqual((self.tmp_path / "gpu.lock").read_text().split()[0], str(os.getpid()))

    @needs_pil
    def _guard(self, kw, expect):
        v2 = self.v2()
        self.fakes()
        q = base_q([{"name": "a", "prompt": "p", "seeds": [1], "bulk": True}])
        code, out = self.run_q(v2, q, **kw)
        self.assertEqual(code, expect)
        self.assertEqual(outs(out), [])

    def test_guard_exit_codes_not_night(self):
        self._guard({"night": False}, 2)

    def test_guard_exit_codes_hot_gpu(self):
        self._guard({"temp": 90}, 3)

    def test_guard_exit_codes_low_memory(self):
        self._guard({"mem": 1.0}, 4)

    def test_guard_exit_codes_stray_pids(self):
        self._guard({"strays": (["123"], [])}, 7)

    @needs_pil
    def test_now_overrides_bulk_window(self):
        v2 = self.v2()
        self.fakes()
        q = base_q([{"name": "a", "prompt": "p", "seeds": [1], "bulk": True}])
        code, out = self.run_q(v2, q, ["--now"], night=False)
        self.assertEqual(code, 0)
        self.assertEqual(outs(out), ["a_1.png"])

    @needs_pil
    def test_resumable_skips_existing(self):
        v2 = self.v2()
        self.fakes()
        q = base_q([{"name": "a", "prompt": "p", "seeds": [1, 2]}])
        self.run_q(v2, q)
        CALLS.clear()
        code, out = self.run_q(v2, q)
        self.assertEqual(code, 0)
        self.assertEqual(calls_of(), [])


# ---- validate() ---------------------------------------------------------------------------------------------

class Validate(Base):
    def test_validate_errors(self):
        v2 = self.v2()
        init = png(self.tmp_path / "i.png")
        cases = {
            "missing keys": ({"jobs": [{"name": "a"}]}, 3),
            "unknown kind": (base_q([{"name": "a", "prompt": "p", "seeds": [1], "kind": "x"}]), 1),
            "size": (base_q([{"name": "a", "prompt": "p", "seeds": [1], "width": 1001}]), 1),
            "steps*strength": (base_q([{"name": "a", "kind": "i2i", "prompt": "p", "seeds": [1], "init": init,
                                        "steps": 3, "strengths": [0.2]}]), 1),
            "strength range": (base_q([{"name": "a", "kind": "i2i", "prompt": "p", "seeds": [1], "init": init,
                                        "strengths": [0]}]), 1),
            "cn no scales": (base_q([{"name": "a", "kind": "cn", "prompt": "p", "seeds": [1], "control": init}]), 1),
            "missing file": (base_q([{"name": "a", "kind": "i2i", "prompt": "p", "seeds": [1], "init": "/no.png",
                                      "strengths": [0.5]}]), 1),
            "dup": (base_q([{"name": "a", "prompt": "p", "seeds": [1]},
                            {"name": "a", "prompt": "p", "seeds": [1]}]), 1),
        }
        for label, (q, n) in cases.items():
            errs, _ = v2.validate(q)
            self.assertGreaterEqual(len(errs), n, (label, errs))
        errs, _ = v2.validate(cases["steps*strength"][0])
        self.assertTrue(any("denoising" in e for e in errs))

    @needs_pil
    def test_validate_warnings(self):
        v2 = self.v2()
        init = png(self.tmp_path / "wide.png", (200, 100), "RGBA")
        q = base_q([{"name": "b", "prompt": "p", "seeds": [1], "bulk": True, "bogus": 1},
                    {"name": "i", "kind": "i2i", "prompt": "word " * 90, "seeds": [1], "init": init,
                     "strengths": [0.5], "width": 1000, "height": 1000, "steps": 20}], extra=1)
        errs, warns = v2.validate(q)
        self.assertEqual(errs, [])
        text = "\n".join(warns)
        for needle in ("unknown key 'bogus'", "unknown key 'extra'", "not an SDXL training bucket", "aspect",
                       "alpha", "non-bulk job after a bulk job", "only run 23:00-07:00", "tokens (estimate)",
                       "word"):
            self.assertIn(needle, text, needle)

    def test_vram_warning_for_huge_sizes(self):
        v2 = self.v2()
        _, w = v2.validate(base_q([{"name": "a", "prompt": "p", "seeds": [1], "width": 1472, "height": 1280}]))
        self.assertTrue(any("VRAM" in x for x in w))
        _, w = v2.validate(base_q([{"name": "a", "prompt": "p", "seeds": [1]}]))
        self.assertFalse(any("VRAM" in x for x in w))

    def test_vram_warning_band_and_error_above_card(self):
        v2 = self.v2()
        errs, w = v2.validate(base_q([{"name": "a", "prompt": "p", "seeds": [1], "width": 1472, "height": 1280}]))
        self.assertEqual(errs, [])
        self.assertTrue(any("VRAM" in x for x in w))  # 7.5 < reserved <= 8
        errs, _ = v2.validate(base_q([{"name": "a", "prompt": "p", "seeds": [1], "width": 2048, "height": 1536}]))
        self.assertTrue(any("exceeds" in e for e in errs))

    def test_exact_tokenizer_used(self):
        v2 = self.v2()
        tok = lambda text, add_special_tokens=False: types.SimpleNamespace(input_ids=list(range(80)))
        tok.decode = lambda ids: "TAIL"
        _, w = v2.validate(base_q([{"name": "a", "prompt": "p", "seeds": [1]}]), tok=tok)
        self.assertTrue(any("80 tokens (exact)" in x and "TAIL" in x for x in w))


class Stray(Base):
    def test_stray_gpu_procs_tolerates_missing_tools(self):
        v2 = self.v2()
        self.mp.setattr(v2.subprocess, "run", lambda *a, **k: (_ for _ in ()).throw(FileNotFoundError()))
        self.assertEqual(v2.stray_gpu_procs(), ([], []))

    def test_stray_gpu_procs_skips_self_dryrun_flags_others(self):
        v2 = self.v2()
        me = os.getpid()
        # absolute path to a lockless (v1-style) script: a bare "gpu-queue.py" resolves via the cwd and would
        # make this test depend on where it is run from
        v1src = self.tmp_path / "gpu-queue.py"
        v1src.write_text("import fcntl\n")
        ps = f"{me} python gpu-queue.py a b\n4001 python gpu-queue.py q o --dry-run\n4002 python {v1src} q o\n"

        def fake_run(cmd, **k):
            out = ps if cmd[0] == "pgrep" else ("" if cmd[0] == "nvidia-smi" else "1\n")
            return types.SimpleNamespace(stdout=out)
        self.mp.setattr(v2.subprocess, "run", fake_run)
        sleeps = []
        self.mp.setattr(v2.time, "sleep", sleeps.append)
        pids, others = v2.stray_gpu_procs()
        self.assertEqual(pids, [])
        self.assertEqual(len(others), 1)
        self.assertTrue(others[0].startswith("4002"))
        self.assertEqual(sleeps, [5])  # rechecked once after 5 s

    def test_stray_ignores_other_v2_instances_but_flags_v1(self):
        v2 = self.v2()
        v1src = self.tmp_path / "gpu-queue.py"  # same base name, but without the GPU flock marker
        v1src.write_text("import fcntl\n")
        ps = (f"4001 python {HERE / 'gpu-queue.py'} q o\n"
              f"4002 python {v1src} q o\n")
        self.mp.setattr(v2.subprocess, "run", lambda cmd, **k: types.SimpleNamespace(
            stdout=ps if cmd[0] == "pgrep" else ("" if cmd[0] == "nvidia-smi" else "1\n")))
        self.mp.setattr(v2.time, "sleep", lambda s: None)
        pids, others = v2.stray_gpu_procs()
        self.assertEqual(pids, [])
        self.assertEqual(len(others), 1)
        self.assertTrue(others[0].startswith("4002"))

    def test_stray_clean_system_does_not_sleep(self):
        v2 = self.v2()
        self.mp.setattr(v2.subprocess, "run", lambda cmd, **k: types.SimpleNamespace(stdout=""))
        sleeps = []
        self.mp.setattr(v2.time, "sleep", sleeps.append)
        self.assertEqual(v2.stray_gpu_procs(), ([], []))
        self.assertEqual(sleeps, [])

    def test_stray_exit_code_7_documented(self):
        v2 = self.v2()
        self.fakes()
        code, out = self.run_q(v2, base_q([{"name": "a", "prompt": "p", "seeds": [1]}]),
                               strays=([], ["4002 python other-gen.py"]))
        self.assertEqual(code, 7)
        self.assertIn("ABORT stray", (out / "progress.log").read_text())
        self.assertIn("7 stray GPU processes", (HERE / "gpu-queue.py").read_text())


# ---- review fixes -------------------------------------------------------------------------------------------

TYPE_ERROR_CASES = [
    ({"name": "a/b", "prompt": "p", "seeds": [1]}, "name"),
    ({"name": "../x", "prompt": "p", "seeds": [1]}, "name"),
    ({"name": "a b", "prompt": "p", "seeds": [1]}, "name"),
    ({"name": 5, "prompt": "p", "seeds": [1]}, "name"),
    ({"name": "a", "prompt": "p", "seeds": [1.5]}, "seeds"),
    ({"name": "a", "prompt": "p", "seeds": [True]}, "seeds"),
    ({"name": "a", "prompt": "p", "seeds": ["1"]}, "seeds"),
    ({"name": "a", "prompt": "p", "seeds": [1], "steps": "28"}, "steps"),
    ({"name": "a", "prompt": "p", "seeds": [1], "steps": True}, "steps"),
    ({"name": "a", "prompt": "p", "seeds": [1], "cfg": None}, "cfg"),
    ({"name": "a", "prompt": "p", "seeds": [1], "kind": "cn", "control": "c", "scales": ["1"]}, "scales"),
    ({"name": "a", "prompt": "p", "seeds": [1], "kind": "cn", "control": "c", "scales": [True]}, "scales"),
    ({"name": "a", "prompt": "p", "seeds": [1], "kind": "i2i", "init": "i", "strengths": [False]}, "strength"),
    ({"name": "a", "prompt": 5, "seeds": [1]}, "prompt"),
]

GARBAGE_QUEUES = [
    [], "x", None, {"jobs": "no"}, {"style": "", "neg": "", "jobs": [3, None]},
    base_q([{"name": 3, "prompt": "p", "seeds": "ab", "kind": "cn", "scales": 5}]),
    base_q([{"name": "a", "prompt": "p", "seeds": [1], "kind": "i2i", "strengths": "z", "steps": "s",
             "width": "w"}]),
]


class ReviewFixes(Base):
    @needs_pil
    def test_old_pipeline_is_dead_before_new_load_across_three_kinds(self):
        v2 = self.v2()
        self.fakes()
        ctrl, init = png(self.tmp_path / "c.png"), png(self.tmp_path / "i.png")
        q = base_q([{"name": "t", "prompt": "p", "seeds": [1]},
                    {"name": "c", "kind": "cn", "prompt": "p", "control": ctrl, "seeds": [1], "scales": [1]},
                    {"name": "i", "kind": "i2i", "prompt": "p", "init": init, "seeds": [1], "strengths": [0.5]}])
        code, _ = self.run_q(v2, q)
        self.assertEqual(code, 0)
        self.assertEqual([c[4] for c in calls_of("load")], [(), (False,), (False, False)])

    def test_validate_accepts_dotted_and_dashed_names(self):
        errs, _ = self.v2().validate(base_q([{"name": "glim-maw_v1.2", "prompt": "p", "seeds": [0, 7]}]))
        self.assertEqual(errs, [])

    def test_bad_json_exits_6(self):
        v2 = self.v2()
        qp = self.tmp_path / "bad.json"
        qp.write_text("{not json")
        self.mp.setattr(sys, "argv", ["gpu-queue.py", str(qp), str(self.tmp_path / "w")])
        with contextlib.redirect_stderr(io.StringIO()), contextlib.redirect_stdout(io.StringIO()):
            with self.assertRaises(SystemExit) as e:
                v2.main()
        self.assertEqual(e.exception.code, 6)
        self.assertFalse((self.tmp_path / "w").exists())
        self.mp.setattr(sys, "argv", ["gpu-queue.py", str(self.tmp_path / "missing.json"), str(self.tmp_path / "w")])
        with contextlib.redirect_stderr(io.StringIO()), contextlib.redirect_stdout(io.StringIO()):
            with self.assertRaises(SystemExit) as e:
                v2.main()
        self.assertEqual(e.exception.code, 6)

    def test_est_seconds_tolerates_bad_types(self):
        v2 = self.v2()
        for job, st in (({"steps": "x"}, 0.5), ({"steps": None}, "a"), ({"steps": -3, "kind": "i2i"}, 0.5),
                        ({"steps": True}, None)):
            self.assertGreater(v2.est_seconds(job, (1024, 1024), st), 0)

    def test_fake_pipe_rejects_unknown_kwargs(self):
        p = _mkcls("StableDiffusionXLImg2ImgPipeline")("StableDiffusionXLImg2ImgPipeline")
        with self.assertRaises(AssertionError):
            p(prompt="x", width=1024)


def _add_type_error_test(i, job, needle):
    def t(self):
        errs, _ = self.v2().validate(base_q([job]), check_files=False)
        self.assertTrue(any(needle in e for e in errs), errs)
    setattr(ReviewFixes, f"test_validate_type_errors_{i:02d}_{needle}", t)


def _add_garbage_test(i, queue):
    def t(self):
        code, _ = self.run_q(self.v2(), queue, ["--dry-run", "--no-files"])
        self.assertEqual(code, 6)
    setattr(ReviewFixes, f"test_dry_run_never_crashes_on_garbage_{i}", t)


for _i, (_job, _needle) in enumerate(TYPE_ERROR_CASES):
    _add_type_error_test(_i, _job, _needle)
for _i, _queue in enumerate(GARBAGE_QUEUES):
    _add_garbage_test(_i, _queue)


if __name__ == "__main__":
    unittest.main()
