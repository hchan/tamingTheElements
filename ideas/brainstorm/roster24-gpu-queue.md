---
status: idea
added: 2026-11-18
---

# roster24: GPU queue (Glimmaw ControlNet + painted candidates) and contact-sheet plan

Owner, 2026-11-18 ("you decide"): Glimmaw ControlNet download approved; rig method for roster24 = same rigged-and-baked approach as Fiara ([hero-rigs](hero-rigs.md), [blender-rigging-pilot](blender-rigging-pilot.md)), but NOTHING is rigged yet: only cleaned candidates, shown in chat first. Everything stays behind `?ff=roster24`, `RELEASED_CHARACTERS` unchanged. GPU use: all day, one job at a time, more at night.

## Tools (all in `tools/assets/roster24-art/`)

- `gpu-queue.py`: runs in WSL on the 4060 PC (SDXL base 1024, 28 steps, `--offload`, per the routing rule in [gpu-vs-mac-bakeoff](gpu-vs-mac-bakeoff.md)). Guards: flock (one queue per dir), refuses to start if another GPU process exists, waits while GPU temp is 80 C or more (up to 10 min) and aborts above 83 C, aborts if MemAvailable is under 4 GB, jobs with `"bulk": true` only run 23:00-07:00 local unless `--now`. Resumable (skips existing images). Kinds: `t2i` and `cn` (Canny ControlNet, `diffusers/controlnet-canny-sdxl-1.0` fp16, cached on the PC since 2026-11-18).
- `make-queues.py`: builds `queue-glimmaw-cn.json` (12 images, any time) and `queue-night.json` (bulk, 112 images: 16 more Glimmaw ControlNet + 8 painted candidates for each of the 12 heroes from the `~/claudetmp/concepts-new12/gen.py` prompts).
- `make-glimmaw-control.py`: draws the anglerfish line control image (lure on a stalk, facing right), because plain text never produced the lure (0 of 30+ tries).
- `run-queue.sh`: WSL entry point. Run it in the FOREGROUND of an ssh call (kept alive with `run_in_background` on the Mac); background jobs die with the ssh session.
- `contact-sheet.py`: the sheet builder below.

Night run (start at or after 23:00, one command, ~112 images x ~20 s = about 40 min):
`ssh <alias> "wsl -d Ubuntu -- bash /mnt/c/Users/<user>/run-queue.sh queue-night.json night"` after scp of `gpu-queue.py run-queue.sh queue-night.json glimmaw-control.png` to the PC home. Keep the alias/host/user/key out of the repo.

## Results 2026-11-18

- Glimmaw ControlNet round 1 (4 seeds x conditioning 0.5/0.7/0.9, 12 images): the lure on a stalk appears in 12 of 12 (plain SDXL: 0 of 30+). Teal, translucent-ish, right-facing, fanged. Strength 0.5 is the most painterly; 0.9 copies the line drawing (visible polygon fins), so use 0.5-0.6. Backgrounds came out pale grey, not dark (easy to cut). Still a fish with a glassy body, not truly water. Sheet: `.scratch/sheet-glimmaw-cn1.png` (gitignored). Raw candidates only, no owner verdict.
- Speed: with `enable_model_cpu_offload` the ControlNet pipeline spilled the 8 GB card (about 350 s per image, 7.9 GB used). Sequential offload plus VAE tiling is 104 s per image (one test image). `gpu-queue.py` now uses that for `cn` jobs; plain `t2i` stays at about 19 s. Night queue estimate: 16 CN x 104 s (28 min) + 96 t2i x 19 s (30 min), about an hour.
- Process hygiene: the first run's python process did not exit after ALLDONE (killed by hand); after the speed fix it exited cleanly.

## Contact-sheet plan (show in chat before any rigging)

One sheet per element plus an overview, all via `contact-sheet.py PICKS.json PREFIX --repo <worktree>`:

| element | originals (left, from `public/assets/img/map/<id>Large.png`) | new candidates (right, 3 per hero) |
|---|---|---|
| fire | fiara, lavax, sindarosa | kindrel, brazgor, ouroth |
| water | curomo, ishimi, morblass | nykra, glimmaw, abyssor |
| earth | pax, rokcore, treenoc | quarrak, durrok, umbrel |
| air | cyclonius, echo, wispera | hyalia, zephra, vortigal |

- Row = one original beside up to 3 candidates of its element-paired new hero; overview = 12 rows with the single best candidate each. The pairing is for orientation (same element, same slot), not a like-for-like redesign; the originals are different characters.
- Candidates are the raw SDXL output at this stage (not yet cut out). The owner picks per hero; only picked candidates get cut (`cut-hero.py`, one head, transparent background, all facing right, per-hero scale from `make-large.py`).
- Honest labels on the sheet message: what is raw, what is a cutout, what is still weak (earlier rounds: Vortigal and Zephra read as plain animals, Glimmaw had no lure before ControlNet).
- Gate: no cutting into the repo, no rigging, no merge until the owner approves the sheet in chat. Relayed approvals from other agents do not count.

## Rig plan after approval (not started)

Per hero: cutout PNG -> `make-rig-source.py` -> rigged-and-baked like Fiara (see hero-rigs). Order by cleanliness of the cutout, not by element.
