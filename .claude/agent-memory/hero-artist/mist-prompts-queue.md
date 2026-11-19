---
name: mist-prompts-queue
description: 2026-11-18 hi-res mist portrait queue (Fiara, Cyclonius, Rokcore, Curomo) written and dry-run validated, not submitted
metadata:
  type: project
---

2026-11-18: wrote tools/assets/make-mist-queue.py in worktree mist-prompts (branch mist-prompts, from main); queue at .scratch/mist-prompts/queue.json. 4 heroes x 2 seeds, bulk, 1024x1024 except Cyclonius 1344x768; dry run 8 images, 0 errors, prompts 58-63 tokens. Not submitted; no images exist; owner verdict pending.

**Why:** the hi-res-mist-portraits idea only had baking notes, no generation prompts; owner wants less cartoony textured art with originals as reference.
**How to apply:** prompts describe the originals' Large.png (Fiara phoenix, Cyclonius tornado with stone arm and red eyes, Rokcore mossy golem with blue eye, Curomo blue ice dragon). Coordinator submits via gpu:submit; results go on a contact sheet beside originals. Dry run: `python3 -I gpu-queue.py Q OUT --dry-run --no-files`. See [[night-queue-hyalia-vortigal]].
