---
status: idea
added: 2026-11-18
---

# Ability tutorials and a short lesson per hero

Owner idea (2026-11-18): the abilities need a tutorial, and perhaps one tutorial per hero.

Two layers:
1. **Ability basics** (shared): a short guided drill for the ability set every hero has (attack, ranged, Run, Snag, super, element push), using the existing Help lessons as the script. Each step waits for the player to do the thing, shows the touch or key prompt, and skips cleanly.
2. **Hero lesson** (per hero, 24 heroes eventually, 14 released now): a 30-60 s drill built from that hero's own kit: what makes it different, one combo or setup to try, one counter to watch for. Offered on the hero picker ("Learn this hero") and after first picking a hero; never forced.

Open questions: build on the training-mode work in `sf-training-mode.md` and `mvc-training-mode-assists.md` (dummy that acts on cue) rather than a new system; where lessons live (data per hero next to the ability data, so new heroes get one for free); reward (a chip on the hero card once done); words for players only (Play, Versus, Online, Settings, Help; no Classic/Arcade/ruleset/Capture, use Snag); phone-first prompts at 44 px targets.

Needs: an Opus plan, then Sonnet build. UI and scripted-dummy work only, no sim change, so it can run beside a sim agent. Not art work: reuse existing hero art.
