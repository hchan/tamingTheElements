---
name: night-queue-hyalia-vortigal
description: 2026-11-18 first bulk night job submitted via gpu:submit (Hyalia and Vortigal re-rolls); how it was built and what is pending
metadata:
  type: project
---

2026-11-18: submitted job g-20261118203934-6d9e through `pnpm gpu:submit` (start 23:00): hyalia_re 4 seeds 1024x1024, vortigal_re 4 seeds 1344x768 (8 images). Seeds 51000 + i*71 + len(hero), i=1..4. Prompts reuse round n (Hyalia, storm cloud, no animal word) and round k (Vortigal, storm eagle V wings). Queue and builder: night-art worktree `.scratch/night-art/`. Nothing fetched or shown yet; owner verdict pending; coordinator runs gpu:fetch.

**Why:** owner wants the 4060 loaded at night; both heroes were weak spots (Hyalia read as plain jellyfish, Vortigal wingspan clipped).
**How to apply:**
- Vortigal uses 1344x768 (a valid SDXL bucket), not 1024x1024, because past rolls clipped wing tips; 1536x768 is not a bucket in gpu-queue.py.
- The hi-res mist portraits idea has no prompts (it is a baking/portrait-strip task, not generation), so it got no images.
- A fresh worktree has no node_modules: symlink the one from another worktree before `corepack pnpm gpu:submit`. Validate first with `python3 -I gpu-queue.py Q OUT --dry-run --no-files`.
- Output must still go on a contact sheet for owner approval; see [[gpu-queue-and-controlnet]].
