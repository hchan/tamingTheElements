---
status: idea
added: 2026-11-14
---

# QA r25 scorecard

Fun 3.5, Graphics 3.5, Readability 3.5 (same as r24).

Evidence:
- Rematch after a Versus fight works: result screen, Rematch, new fight, no errors.
- 2v2 tag works: pick, key swap on 3 with TAG! banner and cooldown notices, KO handling, pause. A mouse click on the Tag slot was inconclusive (cooldown probably still running); retest after the cooldown.
- Pause menu (Esc) is clear: Resume focused, Restart, Quit to menu, resume hint. The dim over the HUD is heavy but fine.
- Settings has collapsible sections (Play, Audio, Controls, Display, Accessibility) and no errors at 1280x720 and 844x390; see the phone header idea.
- Cyclonius, Echo and Sindarosa "failed to load" last sweep: a test artefact. `waitForFunction` under SwiftShader needs `polling:250` and a 60 s timeout; with it all load and play.
- Supers for Curomo, Fiara, Ishimi and Treenoc "not visible": a timing artefact. All fire with banners when stepped with `stepLive`.
- Wispera on the air stage is low contrast (see qa-r25-wispera-faint).
- Tour win is plain (see qa-r25-tour-win-plain).
