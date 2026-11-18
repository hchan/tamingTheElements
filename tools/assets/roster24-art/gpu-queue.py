#!/usr/bin/env python3
"""One-job-at-a-time SDXL queue for the 8 GB GPU PC (runs inside WSL, in the diffusers venv).

Routing rule (ideas/brainstorm/gpu-vs-mac-bakeoff.md): SDXL base 1024 -> PC with CPU offload.
Guards (owner rules): single instance (flock), no other GPU python process, GPU temp <80 C to
start an image (wait up to 10 min to cool) and abort >83 C, MemAvailable >4 GB, jobs marked
"bulk": true only run 23:00-07:00 local (others may run any time, owner 2026-11-18).
Resumable: an image that already exists is skipped.

  python gpu-queue.py QUEUE.json OUTDIR [--now]     (--now ignores the bulk window)

QUEUE.json: {"style": str, "neg": str, "jobs": [{"name": "glimmaw_cn", "kind": "t2i"|"cn",
  "prompt": str, "neg_extra": str, "bulk": bool, "seeds": [..], "cfg": 6.5, "steps": 28,
  "control": "path.png" (cn), "scales": [0.5, 0.7] (cn)}]}
Writes OUTDIR/out/<name>_<seed>[_s<scale>].png, OUTDIR/meta.jsonl, OUTDIR/progress.log.
"""
import fcntl, json, os, subprocess, sys, time

os.environ["HF_HUB_OFFLINE"] = "1"
BASE = "stabilityai/stable-diffusion-xl-base-1.0"
CN = "diffusers/controlnet-canny-sdxl-1.0"


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


def stray_gpu_procs():
    out = subprocess.run(["nvidia-smi", "--query-compute-apps=pid", "--format=csv,noheader"], capture_output=True, text=True).stdout
    pids = [p.strip() for p in out.split() if p.strip().isdigit() and int(p) != os.getpid()]
    ps = subprocess.run(["pgrep", "-af", "python"], capture_output=True, text=True).stdout.splitlines()
    others = [l for l in ps if "gpu-queue.py" not in l and ("diffusers" in l or "gen" in l.split()[-1] or "sd-bench" in l)]
    return pids, others


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    now_ok = "--now" in sys.argv
    q = json.load(open(args[0]))
    W = os.path.abspath(args[1])
    os.makedirs(W + "/out", exist_ok=True)
    lock = open(W + "/.lock", "w")
    try:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except OSError:
        sys.exit("another gpu-queue holds the lock for this dir")
    log = lambda s: open(W + "/progress.log", "a").write(f"{time.strftime('%F %T')} {s}\n")
    pids, others = stray_gpu_procs()
    if pids or others:
        log(f"ABORT stray GPU processes: {pids} {others}")
        sys.exit("stray GPU processes present: " + str(pids) + str(others))

    import torch
    from diffusers import StableDiffusionXLPipeline, StableDiffusionXLControlNetPipeline, ControlNetModel
    from PIL import Image
    import cv2, numpy as np

    pipes = {}

    def get(kind):
        if kind not in pipes:
            if kind == "cn":
                cn = ControlNetModel.from_pretrained(CN, torch_dtype=torch.float16, variant="fp16")
                p = StableDiffusionXLControlNetPipeline.from_pretrained(BASE, controlnet=cn, torch_dtype=torch.float16, variant="fp16")
            else:
                p = StableDiffusionXLPipeline.from_pretrained(BASE, torch_dtype=torch.float16, variant="fp16")
            if kind == "cn":
                # model offload moves unet+controlnet (7.5 GB) together and spills the 8 GB card (350 s/img, measured
                # 2026-11-18); sequential offload keeps only the active layer resident
                p.enable_sequential_cpu_offload()
            else:
                p.enable_model_cpu_offload()
            p.vae.enable_tiling()
            p.set_progress_bar_config(disable=True)
            pipes.clear()  # one pipeline resident at a time
            torch.cuda.empty_cache()
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
        neg = neg0 + (", " + job["neg_extra"] if job.get("neg_extra") else "")
        control = None
        if kind == "cn":
            img = np.array(Image.open(job["control"]).convert("L").resize((1024, 1024)))
            edges = cv2.Canny(img, 100, 200)
            control = Image.fromarray(np.stack([edges] * 3, -1))
            control.save(f"{W}/control_{job['name']}.png")
        for seed in job["seeds"]:
            for sc in (job.get("scales") or [None]):
                name = f"{job['name']}_{seed}" + (f"_s{sc}" if sc is not None else "")
                path = f"{W}/out/{name}.png"
                if os.path.exists(path):
                    continue
                guard(bulk)
                pipe = get(kind)
                g = torch.Generator("cpu").manual_seed(seed)
                kw = dict(prompt=job["prompt"] + style, negative_prompt=neg, num_inference_steps=job.get("steps", 28),
                          guidance_scale=job.get("cfg", 6.5), generator=g)
                if kind == "cn":
                    kw.update(image=control, controlnet_conditioning_scale=sc, width=1024, height=1024)
                else:
                    kw.update(width=1024, height=1024)
                t = time.time()
                im = pipe(**kw).images[0]
                s = time.time() - t
                im.save(path)
                rec = {"name": name, "seed": seed, "scale": sc, "cfg": kw["guidance_scale"], "sec": round(s, 1),
                       "temp_c": gpu("temperature.gpu"), "mem_avail_gb": round(mem_avail_gb(), 1), "prompt": job["prompt"]}
                open(W + "/meta.jsonl", "a").write(json.dumps(rec) + "\n")
                log(f"{name} {s:.1f}s temp={rec['temp_c']}")
    log("ALLDONE")


if __name__ == "__main__":
    main()
