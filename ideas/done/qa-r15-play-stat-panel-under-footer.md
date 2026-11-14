---
status: done
added: 2026-11-14
---

# Hero select stat panel hidden behind the footer at 720p (r15)

On the Play hero select at 1280x720 the Life, Speed, Alignment and ABILITIES panel is covered by the sticky footer (02-play.png), so a new player cannot see what a hero does before picking. Related to the known Versus footer issue but a separate screen. The panel also has no ability preview or idle motion.

Done 2026-11-14 (qa-r15-layout): fixed; verified by headless screenshots at 1280x720, 844x390, 390x844, tests/e2e/layout-r15.spec.ts and a slim-hud unit test. Tour tiles also got Level/Continues labels and tooltips.
