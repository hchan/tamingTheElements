---
status: done
added: 2026-11-14
---

# Versus Back link and hero selects under the 44 px touch minimum

QA r29 sweep (phone 844x390 and desktop 1280x720). Needs a `src/ui/styles/main.css` edit (owned by the HUD agent at the time), so not fixed in the screens WP.

- Versus pick: `a.menuButton` Back measures 48x23 on phone (Fight is fine). `#arcadePick .vsActions .menuButton` (main.css ~2191) needs `min-height: 44px; display: inline-flex; align-items: center`.
- Versus and Tour hub: the per-slot hero `<select>` is 19 px tall (122-198 wide) on desktop; the hero slot clear "x" is 28x28. Give selects `min-height: 44px` under `pointer: coarse`.
- Settings: the `summary` section headers are 43 px high on phone (one pixel short); raise to 44.
- Versus pick on phone: hint text and Opponent/Team/AI level/Arena labels render at about 11 px; the first screen is a wall of small chips. Score 3/5 vs SF character-select (no big portraits until you scroll).

Progress: 2026-11-14 done. main.css: coarse-pointer 44 px for Versus Back, selects, slot clear x, Settings summary, a.menuButton; Versus label font floor 12 px. online-versus.ts: labels stack at every width, top Back link, "(host)"/"(join)" dropped from visible labels (kept in aria-label). Desktop mouse selects stay compact by design. index.css budget needs >= 10920.
