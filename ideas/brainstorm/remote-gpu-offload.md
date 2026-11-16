---
status: idea
added: 2026-11-16
---

# Offload heavy work to the owner's Windows PC (RTX 4060)

Owner, 2026-11-16: the Mac crashed under parallel agent load; the owner has a Windows PC with an RTX 4060 on the same network.

Plan: PC does heavy compute (SDXL-Turbo generation, img2img, later bakes, e2e, balance sims); the Mac coordinates, cuts, views and merges.

1. Owner sets up the PC: OpenSSH Server (auto-start), Git, Python 3.11+, NVIDIA driver, CUDA PyTorch + diffusers venv, fixed IP/hostname, the Mac's public key in authorized_keys (administrators_authorized_keys for admin accounts).
2. Verify the link: `ssh pc nvidia-smi`, torch CUDA import, one timed 512x512 render.
3. Add `tools/assets/remote/run-gen.sh` (scp prompts and script, run over ssh, pull PNGs back); make `gen-candidates.py` pick CUDA, then MPS, then CPU.
4. Move roster24 redo generation first, then Wispera img2img, then e2e/balance/bake (repo cloned on the PC, own E2E_PORT).

Safety: one remote job at a time; at most one Mac-side agent while it runs; PC never sleeps on AC; home network only, no passwords stored; results return by scp/rsync, never pushed branches.

Related: [roster24-art](roster24-art.md) if present.
