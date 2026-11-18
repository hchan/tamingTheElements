---
name: gpu-queue-and-controlnet
description: 2026-11-18 Glimmaw ControlNet download, the gpu-queue.py guards, owner scheduling rules (GPU all day, more at night) and contact-sheet pairing
metadata:
  type: project
---

2026-11-18: owner delegated art decisions ("you decide"): canny SDXL ControlNet (diffusers/controlnet-canny-sdxl-1.0, fp16 2.5 GB, in the PC HF cache, opencv-python-headless installed in ~/tte-gpu/venv) is approved and verified; roster24 rig method = same rigged-and-baked as Fiara but nothing rigged until a sheet is approved in chat; everything stays behind ?ff=roster24.

**Why:** plain SDXL never drew the Glimmaw lure (0 of 30+ tries); the owner wanted it solved without more prompt guessing.
**How to apply:**
- Scheduling correction from the owner (via coordinator, same day): keep the 4060 busy ALL day, just more work 23:00-07:00. gpu-queue.py therefore only gates jobs marked bulk to the night window; small jobs run any time. Still one GPU job at a time, temp <80 C start / abort >83 C, MemAvailable >4 GB.
- Tools: tools/assets/roster24-art/{gpu-queue.py,make-queues.py,run-queue.sh,make-glimmaw-control.py,contact-sheet.py}; plan in ideas/brainstorm/roster24-gpu-queue.md.
- Compound shell commands (heredoc python + other commands) get refused in this worktree agent: write scripts with Write.
- Contact sheet pairs originals to new heroes by element slot (fire fiara/lavax/sindarosa vs kindrel/brazgor/ouroth, etc.); the 12 playable originals are the released heroes in public/assets/img/map/<id>Large.png.
- What worked: Canny ControlNet from a hand-drawn line image gave the Glimmaw lure 12 of 12 (conditioning 0.5-0.6 best; 0.9 copies the lines). ControlNet + model offload spills 8 GB (350 s/img); sequential offload + vae.enable_tiling() = 104 s/img. Newer diffusers: use pipe.vae.enable_tiling(), not pipe.enable_vae_tiling().
- A background queue python process once lingered after ALLDONE; check pgrep and nvidia-smi after every run.
- Owner verdicts: none seen directly; G0 still open.
