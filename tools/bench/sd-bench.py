#!/usr/bin/env python3
"""Fair Stable Diffusion benchmark, same prompts/seeds on any device (cuda or mps).

Usage: python sd-bench.py --device {cuda,mps} --job {sdxl,turbo1,turbo4,sd15,img2img}
         [--offload] [--slicing] [--dtype fp16|fp32] [--runs 5] [--init concept.png] [--out result.json]

Each job: cold model load (timed), 1 warm-up run (discarded), N timed runs with device sync
before stopping the timer. Reports median/min/max seconds per run, peak memory, and (cuda only)
nvidia-smi power.draw samples. Models are official stabilityai repos (safetensors, fp16 variant).
No host/IP/credentials here; the caller runs this on each machine however it reaches it.
Mac power needs `powermetrics` (sudo), so it is not sampled.
"""
import argparse, json, statistics, subprocess, threading, time

PROMPT = ("a fierce fire elemental beast, hand painted, dark fantasy, detailed fur and ember scales, "
          "centered full body, plain background")
NEG = "blurry, low quality, text, watermark"
SEED = 1234

JOBS = {  # job: (repo, steps, size, batch, cfg)
    "sdxl": ("stabilityai/stable-diffusion-xl-base-1.0", 28, 1024, 1, 6.5),
    "turbo1": ("stabilityai/sdxl-turbo", 4, 512, 1, 0.0),
    "turbo4": ("stabilityai/sdxl-turbo", 4, 512, 4, 0.0),
    "sd15": ("stabilityai/sd-turbo", 20, 512, 1, 7.0),  # small stand-in (official 1.5 weights moved off stabilityai)
    "img2img": ("stabilityai/sdxl-turbo", 4, 512, 1, 0.0),
}


def sync(torch, dev):
    if dev == "cuda":
        torch.cuda.synchronize()
    elif dev == "mps":
        torch.mps.synchronize()


def mem_mb(torch, dev):
    if dev == "cuda":
        return torch.cuda.max_memory_allocated() / 2**20
    if dev == "mps":
        return torch.mps.driver_allocated_memory() / 2**20  # no peak API; sampled after each run
    return 0.0


class Power:
    def __init__(self):
        self.s, self.stop = [], False

    def run(self):
        while not self.stop:
            try:
                o = subprocess.check_output(["nvidia-smi", "--query-gpu=power.draw,temperature.gpu",
                                             "--format=csv,noheader,nounits"], text=True)
                w, t = [float(x) for x in o.strip().split(",")]
                self.s.append((w, t))
            except Exception:
                pass
            time.sleep(0.5)


def main():
    a = argparse.ArgumentParser()
    a.add_argument("--device", required=True, choices=["cuda", "mps", "cpu"])
    a.add_argument("--job", required=True, choices=list(JOBS))
    a.add_argument("--repo")
    a.add_argument("--dtype", default="fp16", choices=["fp16", "fp32"])
    a.add_argument("--offload", action="store_true", help="model CPU offload (cuda only)")
    a.add_argument("--slicing", action="store_true", help="attention slicing")
    a.add_argument("--runs", type=int, default=5)
    a.add_argument("--init", help="init image for img2img")
    a.add_argument("--strength", type=float, default=0.5)
    a.add_argument("--max-temp", type=float, default=83.0, help="abort if GPU temp exceeds (cuda)")
    a.add_argument("--out")
    a = a.parse_args()

    import torch
    from diffusers import AutoPipelineForText2Image, AutoPipelineForImage2Image
    repo, steps, size, batch, cfg = JOBS[a.job]
    repo = a.repo or repo
    dt = torch.float16 if a.dtype == "fp16" else torch.float32
    kw = dict(torch_dtype=dt, use_safetensors=True)
    if a.dtype == "fp16":
        kw["variant"] = "fp16"
    cls = AutoPipelineForImage2Image if a.job == "img2img" else AutoPipelineForText2Image

    t0 = time.perf_counter()
    pipe = cls.from_pretrained(repo, **kw)
    if a.offload and a.device == "cuda":
        pipe.enable_model_cpu_offload()
    else:
        pipe.to(a.device)
    if a.slicing:
        pipe.enable_attention_slicing()
    sync(torch, a.device)
    load_s = time.perf_counter() - t0

    init = None
    if a.job == "img2img":
        from PIL import Image
        init = Image.open(a.init).convert("RGB").resize((size, size))

    def one(seed):
        g = torch.Generator("cpu").manual_seed(seed)  # cpu generator: same noise on both devices
        args = dict(prompt=[PROMPT] * batch, num_inference_steps=steps, guidance_scale=cfg, generator=g)
        if cfg > 1.0:
            args["negative_prompt"] = [NEG] * batch
        if init is not None:
            args.update(image=init, strength=a.strength)
        else:
            args.update(height=size, width=size)
        return pipe(**args).images

    pw = Power()
    th = None
    if a.device == "cuda":
        th = threading.Thread(target=pw.run, daemon=True)
        th.start()
        torch.cuda.reset_peak_memory_stats()

    one(SEED)  # warm-up, discarded
    sync(torch, a.device)
    times, peaks = [], []
    for i in range(a.runs):
        if pw.s and pw.s[-1][1] > a.max_temp:
            print("ABORT: temperature", pw.s[-1][1])
            break
        sync(torch, a.device)
        t = time.perf_counter()
        one(SEED + 1 + i)
        sync(torch, a.device)
        times.append(time.perf_counter() - t)
        peaks.append(mem_mb(torch, a.device))
    pw.stop = True
    if th:
        th.join()

    res = dict(job=a.job, device=a.device, repo=repo, dtype=a.dtype, offload=a.offload,
               slicing=a.slicing, steps=steps, size=size, batch=batch, load_s=round(load_s, 2),
               times_s=[round(x, 3) for x in times],
               median_s=round(statistics.median(times), 3) if times else None,
               min_s=round(min(times), 3) if times else None, max_s=round(max(times), 3) if times else None,
               s_per_image=round(statistics.median(times) / batch, 3) if times else None,
               peak_mem_mb=round(max(peaks), 0) if peaks else None,
               torch=torch.__version__)
    if pw.s:
        res["power_w_mean"] = round(statistics.mean(x[0] for x in pw.s), 1)
        res["power_w_max"] = round(max(x[0] for x in pw.s), 1)
        res["temp_c_max"] = max(x[1] for x in pw.s)
    print(json.dumps(res))
    if a.out:
        json.dump(res, open(a.out, "w"), indent=1)


if __name__ == "__main__":
    main()
