---
status: idea
added: 2026-11-16
---

# QA r86 scorecard

Scores 0-5 against Street Fighter / Marvel vs Capcom. Headless Chromium (SwiftShader), seed 7, manual stepping, main at 7b14dd91 (WP5 touch targets plus ideas cleanup). Shots in `.scratch/r86/` (gitignored, per worktree). No page or console errors at 390x844 or 1280x720. Lighter pass than r85: one hero pair (Sindarosa vs Rokcore, Fire arena), no e2e subset run.

| Area | Fun | Graphics | Readability | Notes |
|---|---|---|---|---|
| Desktop 1280x720 1v1 (Fire) | 3 | 3.5 | 3.5 | FIRE x2 chips on hazards readable; bar fits in one row of 10 tiles. Sindarosa vs lava still low contrast. |
| Portrait 390x844 fight | 2.5 | 3 | 3.5 | Two-row bar reads well, tiles about 48 CSS px. Sky void is smaller than r85 once the crowd appears, but the intro frame is a blank gradient. |
| Portrait touch bar (WP5) | n/a | 3.5 | 3.5 | Tiles 48x48, two rows, key hints in the corner. Row 1 holds only Ember and Cleanse, leaving a large empty strip. |
| Menu | n/a | 4 | 4 | Five entries (Play, Versus, Online, Settings, Help), no mode words. |
| Versus picker 390 | n/a | 3.5 | 4 | Roster grouped by element, Fight and Back pinned, "More below" cue. |
| Help 390 | n/a | 3 | 3 | The jump chips stack into nine rows and push the content below the fold. Charge text contradicts the bar (see P1). |
| Help desktop | n/a | n/a | 4 | Clear text, controls documented. |
