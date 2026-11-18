---
name: gpu-redo-round1
description: 2026-11-17 GPU (4060) redo of the 12 roster24 concepts with SDXL base; what worked, GPU job quirks, verdict status
metadata:
  type: project
---

Round GPU-1 (2026-11-17): 48 candidates (4 per hero) with SDXL base 28 steps CFG 6.5 on the 4060, ~18 s/img, 15 min total. Style tail asks for bright saturated painted look on pale grey, matching the originals (bright, clean) rather than the earlier dark grimdark tail. Prompts and seeds: ideas/brainstorm/roster24-redo-candidates.md. Sheets in the worktree .scratch/sheet-{fire,water,earth,air,overview}.png.

**Why:** the owner said the earlier art was bad and the originals are the target; the earlier bake-off (Turbo/Lightning) was dark and muddy.
**How to apply:**
- Owner verdict: none yet; G0 (owner approval of sheet in chat) is still required before cutting or rigging. The "do more work on 4060" go-ahead came via the launching agent.
- Weak: water heroes and Vortigal read as coloured animals, not elemental; next round needs material-heavy prompts for those.
- GPU job quirk: a process started inside `wsl ... bash -lc` dies when the ssh session ends (nohup/setsid did not help). Run the job in the foreground of an ssh call using run_in_background on the Mac side. Single-line ssh commands; avoid `tail -3` (use `tail -n 3`). Transfer files with `tar | base64 -w0` over ssh and decode locally (scp paths into WSL do not work).
- Existing PC setup: ~/tte-gpu/venv, models cached (SDXL base, turbo, Lightning), earlier bake-off in ~/tte-gpu/bakeoff1.

## Round 2 (2026-11-17)
- Material words work only when they are the subject: "sculpted entirely of flowing transparent water, see-through glass-like body" gave a glass horse (Nykra) and a see-through octopus; "four-legged rock beast, stacked boulders" removed the tortoise. Extra negatives for colour (orange, red) were ignored by SDXL base at CFG 6.5: Glimmaw and Abyssor stayed orange/pink; name the wanted colour in the subject instead.
- "storm cloud bird" gave a wispy teal bird (elemental, ragged); "storm jellyfish" works if the animal word stays and the bell is called cloud.
- Seeds 5000+n*29+len(hero); 40 imgs, 18.5 s median, torch peak alloc 5.3 GB / reserved 7.5 GB with CPU offload.
- Tar extraction pitfall: extracting a second round into a dir with the same out/ and meta.json overwrote round 1 locally; extract each round into its own tmp dir.
- Verdict still none from the owner; sheets in ~/claudetmp/roster24-redo-gpu/.

## Round 3 (2026-11-17)
- Naming colours in the subject ("deep blue and teal translucent") removed the orange/pink for Glimmaw and Abyssor, but the animal word still wins over the material: they became blue fish/octopus with skin, and Vortigal "storm-cloud eagle" became a plain white eagle with cyan/yellow accents. Animal + material words fight; next idea is img2img from a pick or a LoRA, not more prompt words.
- No lure appeared on Glimmaw in 8 tries. "facing right" in the subject helped (most results right-facing) but not for the extra-negative "facing left" alone.
- Seeds 6000+n*31+len(hero); 28 imgs, median 18.95 s, one 59 s stall, temp max 50C. gen4.py includes a temp check (stop above 83C).
- Tool quirk: the Bash tool refuses compound commands (heredoc python + base64 + ssh in one) in a worktree-isolated agent; write the file with Write, base64 in one call, ssh in another.
- Owner verdict: still none; G0 open.

## Round 5 (2026-11-17)
- img2img strength 0.75/0.82/0.9 (4 seeds each, 72 imgs) from the round-3 picks: composition drifts a bit, surface/animal identity still wins (horse becomes grey-white, octopus keeps suckers, eagle stays an eagle). Gains are only splash/foam/mist/lightning around the creature.
- Plain text2img with "transparent liquid water sculpture in the silhouette of X, only water, see-through" and negatives against glossy/plastic/skin: best water result so far for abyssor and glimmaw (glassy translucent octopus/fish) and nykra (see-through horse). Storm heroes as "storm cloud shaped like X" still gave solid grey animals (wolf, eagle, jellyfish).
- Glimmaw lure never appears (0 of 24+ tries). Next: ControlNet edge / LoRA / IP-Adapter, or composite a water/cloud texture over a cut silhouette.
- Timings: 84 imgs in 1460 s, img2img median 16.7 s, text2img 18.2 s, temp max 50 C, peak alloc 5.5 GB. gen6.py in the worktree .scratch/ and PC ~/tte-gpu.
- scp to the PC works with `scp file hchan@HOST:C:/Users/hchan/x` then `wsl ... cp /mnt/c/Users/hchan/x ~/tte-gpu/` (base64 on the command line is too long for scripts). Fetch results with `tar | base64 -w0` over ssh, decode on the Mac. Backgrounded foreground ssh job + polling loop (each tool call auto-backgrounds after 180 s) worked.
- Owner verdict: still none; G0 open.

## Round 6 (2026-11-17)
- Text2img with "a transparent glass water sculpture of <animal>" x6 seeds/hero, CFG 6-8 (36 imgs, ~19-25 s each, <=45 C): nykra, abyssor, hyalia (cloud jelly) are real wins; glimmaw still has no lure (0 of 30+); zephra and vortigal stay realistic animals (cloud wording ignored; "solid cloud sculpture" = bird statue).
- Word "sculpture" adds plinths/bowls/desk (photo look). Next time use "creature/spirit", add "no base, no pedestal, floating". CFG 6.0 sometimes tiles repeats; CFG showed no consistent effect otherwise.
- ControlNet skipped: no controlnet weights cached on the PC, no opencv; needs a go-ahead before downloading (canny SDXL ~2.5 GB fp16, Apache-2.0).
- Tool quirks: in zsh keep ssh opts inline (a $K variable word-splits wrongly); put WSL commands with pipes in a script scp'd to C:/Users/hchan and run with `wsl -d Ubuntu -- bash /mnt/c/Users/hchan/x.sh` (cmd parses `|`). Worktree had no node_modules: symlink the main checkout's for vitest.
- Owner verdict: still none; G0 open.
