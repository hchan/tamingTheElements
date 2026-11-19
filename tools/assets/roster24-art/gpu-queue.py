#!/usr/bin/env python3
"""One-job-at-a-time SDXL queue for the 8 GB GPU PC (runs inside WSL, in the diffusers venv). v2.

Routing rule (ideas/brainstorm/gpu-vs-mac-bakeoff.md): SDXL base 1024 -> PC with CPU offload.
Guards (owner rules): single instance per output dir (flock) and one GPU job machine-wide (flock on
$TTE_GPU_LOCK or ~/tte-gpu/gpu.lock, exit 5 when busy), no other GPU python process, GPU temp <80 C to
start an image (wait up to 10 min to cool) and abort >83 C, MemAvailable >4 GB, jobs marked
"bulk": true only run 23:00-07:00 local (others may run any time, owner 2026-11-18).
Resumable: an image that already exists is skipped.

  python gpu-queue.py QUEUE.json OUTDIR [--now] [--dry-run] [--no-files] [--tokenizer[=DIR]]
    --now        ignore the bulk window
    --dry-run    validate and print the plan (sizes, images left, tokens, VRAM, time); no torch, no writes, no locks
    --no-files   skip the "control/init file exists" checks (queue built on another machine)
    --tokenizer  exact CLIP token counts via transformers (DIR or the cached openai/clip-vit-large-patch14)
  Any other flag exits 64.  Exit codes: 0 done, 1 per-dir lock held or uncaught crash (Python default),
  2 bulk window, 3 temp, 4 RAM, 5 GPU lock busy, 6 queue invalid/unreadable, 7 stray GPU processes, 64 usage.

QUEUE.json: {"style": str, "neg": str, "width": 1024, "height": 1024, "jobs": [{"name": "glimmaw_cn",
  "kind": "t2i"|"cn"|"i2i", "prompt": str, "neg_extra": str, "bulk": bool, "seeds": [..], "cfg": 6.5,
  "steps": 28, "width": int, "height": int (per job, else queue root, else 1024; multiples of 8),
  "control": "path.png" (cn), "scales": [0.5, 0.7] (cn), "init": "path.png" (i2i), "strengths": [0.5] (i2i, in (0,1])}]}
Writes OUTDIR/out/<name>_<seed>[_s<scale>][_d<strength>][_<W>x<H>].png (size suffix only when not 1024x1024),
OUTDIR/meta.jsonl, OUTDIR/progress.log.
"""
import fcntl, gc, json, math, os, re, subprocess, sys, time

os.environ["HF_HUB_OFFLINE"] = "1"
BASE = "stabilityai/stable-diffusion-xl-base-1.0"
CN = "diffusers/controlnet-canny-sdxl-1.0"
CLIP = "openai/clip-vit-large-patch14"
KINDS = ("t2i", "cn", "i2i")
ROOT_KEYS = {"style", "neg", "width", "height", "jobs"}
JOB_KEYS = {"name", "kind", "prompt", "neg_extra", "bulk", "seeds", "cfg", "steps", "width", "height",
            "control", "scales", "init", "strengths"}
SDXL_BUCKETS = {(1024, 1024), (1152, 896), (896, 1152), (1216, 832), (832, 1216), (1344, 768), (768, 1344),
                (1536, 640), (640, 1536)}
TOKEN_LIMIT = 75
SEC_T2I, SEC_CN = 19.3, 104.0  # measured per 1024x1024 28-step image on the 4060 (2026-11-18)
VRAM_WARN_GB = 7.5
VRAM_MAX_GB = 8.0  # reserved estimate above the card size is an error
NAME_RE = re.compile(r"^[\w.-]+$")
USAGE = "usage: gpu-queue.py QUEUE.json OUTDIR [--now] [--dry-run] [--no-files] [--tokenizer[=DIR]]"


def gpu(field):
    try:
        out = subprocess.check_output(["nvidia-smi", f"--query-gpu={field}", "--format=csv,noheader,nounits"])
        return int(out.decode().split()[0])
    except Exception:
        return None


def mem_avail_gb():
    for line in open("/proc/meminfo"):
        if line.startswith("MemAvailable"):
            return int(line.split()[1]) / 1048576
    return 0.0


def night():
    h = time.localtime().tm_hour
    return h >= 23 or h < 7


def _run(cmd):
    try:
        return subprocess.run(cmd, capture_output=True, text=True).stdout
    except OSError:  # tool not installed (e.g. no nvidia-smi)
        return ""


def _ancestors():
    pids, p = set(), os.getpid()
    while p > 1 and p not in pids:
        pids.add(p)
        out = _run(["ps", "-o", "ppid=", "-p", str(p)]).split()
        p = int(out[0]) if out and out[0].isdigit() else 0
    return pids


def _is_v2_script(pid, parts):
    """True when the process runs a lock-serialised (v2) gpu-queue.py; v2 instances are separated by the GPU flock."""
    for a in parts[1:]:
        if os.path.basename(a) == "gpu-queue.py":
            for cand in (a, os.path.join(f"/proc/{pid}/cwd", a)):
                try:
                    with open(cand) as f:
                        return "TTE_GPU_LOCK" in f.read()
                except OSError:
                    pass
    return False  # unreadable: treat as not v2


def stray_gpu_procs():
    """(GPU compute pids, other python command lines that look like GPU jobs).

    Ignored: self, parents, --dry-run runs and other v2 gpu-queue instances (the flock already excludes those);
    lockless v1 gpu-queue runs and any other GPU-looking python process are flagged. A recheck after 5 s happens
    only when something was found (a process may be mid-exit)."""
    def scan():
        out = _run(["nvidia-smi", "--query-compute-apps=pid", "--format=csv,noheader"])
        pids = [p.strip() for p in out.split() if p.strip().isdigit() and int(p) != os.getpid()]
        skip = _ancestors()
        others = []
        for l in _run(["pgrep", "-af", "python"]).splitlines():
            parts = l.split()
            if not parts or not parts[0].isdigit() or int(parts[0]) in skip or "--dry-run" in parts:
                continue
            if "gpu-queue" in l:
                if not _is_v2_script(parts[0], parts):
                    others.append(l)
            elif "diffusers" in l or "gen" in parts[-1] or "sd-bench" in l:
                others.append(l)
        return pids, others
    r = scan()
    if r[0] or r[1]:
        time.sleep(5)
        r = scan()
    return r


# ---- queue model ----------------------------------------------------------------------------------------------

def job_size(q, job):
    return (job.get("width", q.get("width", 1024)), job.get("height", q.get("height", 1024)))


def job_items(job):
    """[(seed, scale, strength)] in run order."""
    def lst(k):
        v = job.get(k)
        return v if isinstance(v, list) and v else [None]
    kind = job.get("kind", "t2i")
    seeds = job.get("seeds") or []
    if kind == "cn":
        return [(s, sc, None) for s in seeds for sc in lst("scales")]
    if kind == "i2i":
        return [(s, None, st) for s in seeds for st in lst("strengths")]
    return [(s, None, None) for s in seeds]


def out_name(job, size, seed, sc, st):
    n = f"{job['name']}_{seed}"
    if sc is not None:
        n += f"_s{sc}"
    if st is not None:
        n += f"_d{st}"
    if tuple(size) != (1024, 1024):
        n += f"_{size[0]}x{size[1]}"
    return n


def vram_gb(size):
    a = size[0] * size[1] / 1024 ** 2
    alloc = 4.8 + 0.5 * a
    return alloc, alloc * 1.4


def _is_num(v):
    return isinstance(v, (int, float)) and not isinstance(v, bool) and math.isfinite(v)


def _is_int(v):
    return isinstance(v, int) and not isinstance(v, bool)


def est_seconds(job, size, st):
    kind = job.get("kind", "t2i")
    steps = job.get("steps", 28)
    if not _is_num(steps) or steps <= 0:
        steps = 28
    if kind == "i2i" and _is_num(st) and st > 0:
        steps = max(1, int(steps * st))
    return (SEC_CN if kind == "cn" else SEC_T2I) * (size[0] * size[1] / 1024 ** 2) * (steps / 28)


_TOK = re.compile(r"\w+|[^\w\s]")


def load_tokenizer(spec):
    from transformers import CLIPTokenizer
    return CLIPTokenizer.from_pretrained(spec or CLIP)


def count_tokens(text, tok=None):
    """(count, cut-off tail). Exact with a CLIP tokenizer, else a word/punctuation estimate."""
    if tok is not None:
        ids = tok(text, add_special_tokens=False).input_ids
        return len(ids), (tok.decode(ids[TOKEN_LIMIT:]) if len(ids) > TOKEN_LIMIT else "")
    ms = list(_TOK.finditer(text))
    return len(ms), (text[ms[TOKEN_LIMIT].start():] if len(ms) > TOKEN_LIMIT else "")


def _is_size(size):
    return all(isinstance(v, int) and not isinstance(v, bool) and v > 0 and v % 8 == 0 for v in size)


def validate(q, check_files=True, tok=None):
    errors, warnings = [], []
    if not isinstance(q, dict):
        return ["queue is not a JSON object"], warnings
    for k in ("style", "neg", "jobs"):
        if k not in q:
            errors.append(f"queue: missing key '{k}'")
    for k in ("style", "neg"):
        if k in q and not isinstance(q[k], str):
            errors.append(f"queue: '{k}' must be a string")
    for k in q:
        if k not in ROOT_KEYS:
            warnings.append(f"queue: unknown key '{k}'")
    jobs = q.get("jobs")
    if not isinstance(jobs, list):
        errors.append("queue: 'jobs' must be a list")
        return errors, warnings
    try:
        from PIL import Image
    except ImportError:
        Image = None
    seen, bulk_seen = set(), False
    for i, job in enumerate(jobs):
        label = f"job {i}" + (f" ({job.get('name')})" if isinstance(job, dict) and "name" in job else "")
        if not isinstance(job, dict):
            errors.append(f"{label}: not an object")
            continue
        for k in ("name", "prompt", "seeds"):
            if k not in job:
                errors.append(f"{label}: missing key '{k}'")
        for k in job:
            if k not in JOB_KEYS:
                warnings.append(f"{label}: unknown key '{k}'")
        if "name" in job and (not isinstance(job["name"], str) or not NAME_RE.match(job["name"])):
            errors.append(f"{label}: name {job['name']!r} must match ^[\\w.-]+$ (it becomes a file name)")
        if job.get("name") in seen:
            errors.append(f"{label}: duplicate name '{job['name']}'")
        if isinstance(job.get("name"), str):
            seen.add(job["name"])
        for k in ("prompt", "neg_extra"):
            if k in job and not isinstance(job[k], str):
                errors.append(f"{label}: '{k}' must be a string")
        if "seeds" in job and (not isinstance(job["seeds"], list) or not job["seeds"]):
            errors.append(f"{label}: 'seeds' must be a non-empty list")
        elif "seeds" in job and not all(_is_int(x) for x in job["seeds"]):
            errors.append(f"{label}: seeds must be integers")
        for k in ("cfg", "steps"):
            if k in job and not (_is_num(job[k]) and job[k] > 0):
                errors.append(f"{label}: '{k}' must be a positive number")
        for k in ("scales", "strengths"):
            if k in job and (not isinstance(job[k], list) or not all(_is_num(x) for x in job[k])):
                errors.append(f"{label}: '{k}' must be a list of numbers")
        kind = job.get("kind", "t2i")
        if kind not in KINDS:
            errors.append(f"{label}: unknown kind '{kind}'")
        size = job_size(q, job)
        size_ok = _is_size(size)
        if not size_ok:
            errors.append(f"{label}: size {size[0]}x{size[1]} must be positive integers divisible by 8")
        else:
            if tuple(size) not in SDXL_BUCKETS:
                warnings.append(f"{label}: {size[0]}x{size[1]} is not an SDXL training bucket")
            alloc, resv = vram_gb(size)
            if resv > VRAM_MAX_GB:
                errors.append(f"{label}: reserved VRAM estimate {resv:.1f} GB exceeds the {VRAM_MAX_GB:g} GB card "
                              f"({alloc:.1f} GB allocated)")
            elif resv > VRAM_WARN_GB:
                warnings.append(f"{label}: VRAM estimate {alloc:.1f} GB allocated / {resv:.1f} GB reserved "
                                f"> {VRAM_WARN_GB} GB")
        steps = job.get("steps", 28)
        if not _is_num(steps):
            steps = 28
        if job.get("bulk"):
            bulk_seen = True
        elif bulk_seen:
            warnings.append(f"{label}: non-bulk job after a bulk job (it will wait behind it: bulk jobs only run 23:00-07:00 unless --now)")
        if kind == "cn":
            if not job.get("scales"):
                errors.append(f"{label}: cn job needs 'scales'")
            if not job.get("control") or not isinstance(job["control"], str):
                errors.append(f"{label}: cn job needs 'control' (a path)")
            elif check_files and not os.path.isfile(job["control"]):
                errors.append(f"{label}: control file not found: {job['control']}")
        if kind == "i2i":
            if not job.get("init") or not isinstance(job["init"], str):
                errors.append(f"{label}: i2i job needs 'init' (a path)")
            if not job.get("strengths"):
                errors.append(f"{label}: i2i job needs 'strengths'")
            for st in (job.get("strengths") if isinstance(job.get("strengths"), list) else []):
                if not isinstance(st, (int, float)) or not 0 < st <= 1:
                    errors.append(f"{label}: strength {st!r} not in (0,1]")
                elif int(steps * st) < 1:
                    errors.append(f"{label}: steps {steps} * strength {st} gives no denoising steps")
            if isinstance(job.get("init"), str) and job["init"] and check_files:
                if not os.path.isfile(job["init"]):
                    errors.append(f"{label}: init file not found: {job['init']}")
                elif Image is not None and size_ok:
                    try:
                        with Image.open(job["init"]) as im:
                            iw, ih = im.size
                            if abs((iw / ih) / (size[0] / size[1]) - 1) > 0.05:
                                warnings.append(f"{label}: init aspect {iw}x{ih} differs >5% from {size[0]}x{size[1]} "
                                                "(it will be stretched)")
                            if "A" in im.getbands() or "transparency" in im.info:
                                warnings.append(f"{label}: init has alpha (it is flattened by convert('RGB'))")
                    except Exception as e:
                        errors.append(f"{label}: cannot read init: {e}")
        for what, text in (("prompt", str(job.get("prompt", "")) + str(q.get("style", ""))),
                           ("negative", str(q.get("neg", "")) +
                            (", " + job["neg_extra"] if job.get("neg_extra") else ""))):
            n, tail = count_tokens(text, tok)
            if n > TOKEN_LIMIT:
                warnings.append(f"{label}: {what} is {n} tokens ({'exact' if tok else 'estimate'}); "
                                f"cut off after {TOKEN_LIMIT}: ...{tail!r}")
    return errors, warnings


def dry_run(q, W, errors, warnings, tok):
    for w in warnings:
        print("WARN ", w)
    for e in errors:
        print("ERROR", e)
    total, total_s = 0, 0.0
    if not isinstance(q, dict):
        print(f"TOTAL no plan; {len(errors)} errors, {len(warnings)} warnings")
        return 6
    for job in q.get("jobs", []) if isinstance(q.get("jobs"), list) else []:
        if not isinstance(job, dict) or not isinstance(job.get("name"), str) or not isinstance(job.get("seeds"), list) \
                or not all(_is_int(x) for x in job["seeds"]):
            continue
        size = job_size(q, job)
        ok = _is_size(size)
        items = job_items(job)
        left = [(s, sc, st) for s, sc, st in items if not os.path.exists(f"{W}/out/{out_name(job, size, s, sc, st)}.png")]
        secs = sum(est_seconds(job, size, st) for _, _, st in left) if ok else 0.0
        n_p = count_tokens(str(job.get("prompt", "")) + str(q.get("style", "")), tok)[0]
        n_n = count_tokens(str(q.get("neg", "")) + (", " + job["neg_extra"] if job.get("neg_extra") else ""), tok)[0]
        v = vram_gb(size) if ok else (0, 0)
        print(f"{job['name']}: kind={job.get('kind', 't2i')} size={size[0]}x{size[1]} bulk={bool(job.get('bulk'))} "
              f"images left {len(left)}/{len(items)} tokens prompt={n_p} neg={n_n} "
              f"vram~{v[0]:.1f}/{v[1]:.1f} GB time~{secs / 60:.1f} min")
        total += len(left)
        total_s += secs
    print(f"TOTAL images left {total}, estimated {total_s / 3600:.2f} h; {len(errors)} errors, {len(warnings)} warnings")
    return 6 if errors else 0


def _usage(code, msg):
    print(f"{msg}\n{USAGE}", file=sys.stderr)
    sys.exit(code)


def parse_args(argv):
    o = {"now": False, "dry": False, "nofiles": False, "tok": None}
    pos = []
    for a in argv:
        if a == "--now":
            o["now"] = True
        elif a == "--dry-run":
            o["dry"] = True
        elif a == "--no-files":
            o["nofiles"] = True
        elif a == "--tokenizer":
            o["tok"] = ""
        elif a.startswith("--tokenizer="):
            o["tok"] = a.split("=", 1)[1]
        elif a.startswith("--"):
            _usage(64, f"unknown flag {a}")
        else:
            pos.append(a)
    if len(pos) != 2:
        _usage(64, "need QUEUE.json and OUTDIR")
    o["queue"], o["out"] = pos
    return o


def canny_control(path, w, h):
    from PIL import Image
    import cv2, numpy as np
    img = np.array(Image.open(path).convert("L").resize((w, h)))
    edges = cv2.Canny(img, 100, 200)
    return Image.fromarray(np.stack([edges] * 3, -1))


def main():
    o = parse_args(sys.argv[1:])
    now_ok = o["now"]
    try:
        with open(o["queue"]) as f:
            q = json.load(f)
    except (OSError, ValueError) as e:  # ValueError covers JSONDecodeError and bad encodings
        print(f"ERROR cannot read queue {o['queue']}: {e}", file=sys.stderr)
        sys.exit(6)
    W = os.path.abspath(o["out"])
    tok = None
    if o["tok"] is not None:
        try:
            tok = load_tokenizer(o["tok"])
        except Exception as e:
            print(f"WARN tokenizer unavailable ({e}); using estimates", file=sys.stderr)
    errors, warnings = validate(q, check_files=not o["nofiles"], tok=tok)
    if o["dry"]:
        sys.exit(dry_run(q, W, errors, warnings, tok))
    for w in warnings:
        print("WARN ", w, file=sys.stderr)
    if errors:
        for e in errors:
            print("ERROR", e, file=sys.stderr)
        sys.exit(6)
    os.makedirs(W + "/out", exist_ok=True)
    lock = open(W + "/.lock", "w")
    try:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except OSError:
        sys.exit("another gpu-queue holds the lock for this dir")
    log = lambda s: open(W + "/progress.log", "a").write(f"{time.strftime('%F %T')} {s}\n")
    gpu_lock_path = os.environ.get("TTE_GPU_LOCK") or os.path.expanduser("~/tte-gpu/gpu.lock")
    os.makedirs(os.path.dirname(gpu_lock_path) or ".", exist_ok=True)
    gpu_lock = open(gpu_lock_path, "a+")
    try:
        fcntl.flock(gpu_lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except OSError:
        log("BUSY another GPU queue holds the GPU lock")
        print("BUSY: another GPU queue holds " + gpu_lock_path, file=sys.stderr)
        sys.exit(5)
    gpu_lock.seek(0)
    gpu_lock.truncate()
    gpu_lock.write(f"{os.getpid()} {W}\n")
    gpu_lock.flush()
    log("START v2")
    pids, others = stray_gpu_procs()
    if pids or others:
        log(f"ABORT stray GPU processes: {pids} {others}")
        print("stray GPU processes present: " + str(pids) + str(others), file=sys.stderr)
        sys.exit(7)

    if len({job_size(q, j) for j in q["jobs"]}) > 1:
        os.environ.setdefault("PYTORCH_CUDA_ALLOC_CONF", "expandable_segments:True")
    import torch
    from diffusers import (StableDiffusionXLPipeline, StableDiffusionXLControlNetPipeline,
                           StableDiffusionXLImg2ImgPipeline, ControlNetModel)
    from PIL import Image

    pipes = {}

    def free():
        for p in pipes.values():
            try:
                p.remove_all_hooks()
            except Exception:
                pass
        pipes.clear()  # one pipeline resident at a time
        gc.collect()
        torch.cuda.empty_cache()

    def get(kind):
        if kind not in pipes:
            free()
            if kind == "cn":
                cn = ControlNetModel.from_pretrained(CN, torch_dtype=torch.float16, variant="fp16")
                p = StableDiffusionXLControlNetPipeline.from_pretrained(BASE, controlnet=cn, torch_dtype=torch.float16, variant="fp16")
            elif kind == "i2i":
                p = StableDiffusionXLImg2ImgPipeline.from_pretrained(BASE, torch_dtype=torch.float16, variant="fp16")
            else:
                p = StableDiffusionXLPipeline.from_pretrained(BASE, torch_dtype=torch.float16, variant="fp16")
            if kind == "cn":
                # model offload moves unet+controlnet (7.5 GB) together and spills the 8 GB card (350 s/img, measured
                # 2026-11-18); sequential offload keeps only the active layer resident
                p.enable_sequential_cpu_offload()
            else:
                p.enable_model_cpu_offload()
            p.set_progress_bar_config(disable=True)
            pipes[kind] = p
        return pipes[kind]

    def guard(bulk):
        if bulk and not (night() or now_ok):
            log("STOP bulk job outside 23:00-07:00 window")
            sys.exit(2)
        t0 = time.time()
        while True:
            tp = gpu("temperature.gpu")
            if tp is not None and tp > 83:
                log(f"ABORT temp={tp}")
                sys.exit(3)
            if tp is None or tp < 80:
                break
            if time.time() - t0 > 600:
                log(f"ABORT still {tp} C after 10 min")
                sys.exit(3)
            time.sleep(20)
        if mem_avail_gb() < 4:
            log(f"ABORT MemAvailable {mem_avail_gb():.1f} GB < 4")
            sys.exit(4)

    style, neg0 = q["style"], q["neg"]
    for job in q["jobs"]:
        kind = job.get("kind", "t2i")
        bulk = job.get("bulk", False)
        w, h = size = job_size(q, job)
        neg = neg0 + (", " + job["neg_extra"] if job.get("neg_extra") else "")
        control = init = None
        if kind == "cn":
            control = canny_control(job["control"], w, h)
            control.save(f"{W}/control_{job['name']}.png")
        elif kind == "i2i":
            init = Image.open(job["init"]).convert("RGB").resize((w, h))
        for seed, sc, st in job_items(job):
            name = out_name(job, size, seed, sc, st)
            path = f"{W}/out/{name}.png"
            if os.path.exists(path):
                continue
            guard(bulk)
            pipe = None  # drop the old pipeline reference first, or get() -> free() cannot release it
            pipe = get(kind)
            if w * h > 1024 * 1024:
                pipe.vae.enable_tiling()
            else:
                pipe.vae.disable_tiling()
            g = torch.Generator("cpu").manual_seed(seed)
            kw = dict(prompt=job["prompt"] + style, negative_prompt=neg, num_inference_steps=job.get("steps", 28),
                      guidance_scale=job.get("cfg", 6.5), generator=g)
            if kind == "cn":
                kw.update(image=control, controlnet_conditioning_scale=float(sc), width=w, height=h)
            elif kind == "i2i":
                kw.update(image=init, strength=float(st))  # size comes from the init image
            else:
                kw.update(width=w, height=h)
            t = time.time()
            im = pipe(**kw).images[0]
            s = time.time() - t
            im.save(path)
            rec = {"name": name, "seed": seed, "scale": sc, "cfg": kw["guidance_scale"], "sec": round(s, 1),
                   "temp_c": gpu("temperature.gpu"), "mem_avail_gb": round(mem_avail_gb(), 1), "prompt": job["prompt"]}
            if st is not None:
                rec["strength"] = st
            if size != (1024, 1024):
                rec["size"] = f"{w}x{h}"
            open(W + "/meta.jsonl", "a").write(json.dumps(rec) + "\n")
            log(f"{name} {s:.1f}s temp={rec['temp_c']}")
    log("ALLDONE")


if __name__ == "__main__":
    main()
