---
status: epic
added: 2026-11-16
---

# Epic: Platform: touch, portrait, phone and performance

Phones in landscape and portrait, thumb reach, accessibility fixes and runtime performance.

- Suggested order: Phone blockers first (joystick covers hero, versus Fight button offscreen, HUD overlap), then portrait thumb reach and tall arena, then a11y review fixes, then the performance pass.
- Size: L overall.
- Dependencies: none (phone and portrait work dropped by the owner, 2026-11-18).
- Owner-gated: Portrait tall arena changes the 1280x720 view contract: confirm before doing.

Member ideas, in suggested priority order (work them as separate small work packages):

- [qa-r22-phone-joystick-covers-hero](../brainstorm/qa-r22-phone-joystick-covers-hero.md): Phone: virtual joystick covers the hero at the left edge. At 844x390 the roughly 130 px joystick sits over the bottom-left of the arena.
- [qa-r22-phone-versus-fight-button-offscreen](../brainstorm/qa-r22-phone-versus-fight-button-offscreen.md): Phone: Versus Fight button below the fold. At 844x390 the Versus page (p-02-versus.png) shows the options and the You/Computer cards, but the hero grid and Fight! are far below, so a player mus
- [qa-r21-phone-hud-and-card-overlap](../brainstorm/qa-r21-phone-hud-and-card-overlap.md): Phone (844x390): HUD still small, joystick covers the play field. p-fire-b-fightbanner.png: Life and SUPER text is readable but small (about 9 px effective);
- [a11y-review-fixes](../in-progress/a11y-review-fixes.md) (in progress): A11y review fixes (from the 2026-11-12 reviewer pass). Findings (code reading only; axe-core not yet run):
- [performance-pass](../brainstorm/performance-pass.md): Performance pass (frame time, memory, mobile). Goal: measure and cut frame time, per-tick allocation and memory on desktop and mid-range phones;

## Filed 2026-11-17 (round-note filing and cross-listing)

Added so every brainstorm idea sits in an epic. Members stay in their own folder; cross-listed ideas also appear in another epic.

- [qa-r100-findings](../done/qa-r100-findings.md): QA round 100 findings
- [qa-r101-findings](../done/qa-r101-findings.md): QA r101 findings
- [qa-r102-findings](../done/qa-r102-findings.md): QA r102 findings
- [qa-r103-findings](../done/qa-r103-findings.md): QA r103 findings
- [qa-r104-findings](../done/qa-r104-findings.md): QA r104 findings
- [qa-r105-findings](../brainstorm/qa-r105-findings.md): QA r105 findings
- [qa-r106-findings](../brainstorm/qa-r106-findings.md): QA r106 findings
- [qa-r107-findings](../brainstorm/qa-r107-findings.md): QA r107 findings

## Bundles (2026-11-17)

Groups of ideas that touch the same files, so one agent can take the whole bundle. Flags: SIM = sim-changing (needs an Opus plan, a SIM_VERSION bump and a golden re-record with a stated reason, one sim bundle at a time); OWNER-GATED = wait for the owner; PC = heavy generation, balance or e2e work can run on the GPU PC; needs browser/e2e = run Playwright (headless) before calling it done.

Done 2026-11-17: Strike circle label uses Snag and the portrait 2v2 label fixes (qa-r105 and qa-r107 P2s) are merged. Several portrait agents (portrait-*, qa-r97/r98) are already working on this area: check running agents before handing out PT-1.

### PT-1 Portrait arena framing and thumb reach

- Members: [qa-r103-findings](../done/qa-r103-findings.md), [qa-r106-findings](../brainstorm/qa-r106-findings.md), [qa-r107-findings](../brainstorm/qa-r107-findings.md)
- Size: L
- Shared files: Arena.ts, arena-camera.ts, action-bar.ts, Hud.ts, main.css
- Flags: needs browser/e2e; OWNER-CONFIRM (changes the 1280x720 view contract); no SIM change
- Parallel: HUD lane and Arena.ts lock: serial with FR-*, PT-2, MT-*, AE-3, AP-2.

### PT-2 Phone landscape and touch controls

- Members: [qa-r22-phone-joystick-covers-hero](../brainstorm/qa-r22-phone-joystick-covers-hero.md), [qa-r22-phone-versus-fight-button-offscreen](../brainstorm/qa-r22-phone-versus-fight-button-offscreen.md), [qa-r21-phone-hud-and-card-overlap](../brainstorm/qa-r21-phone-hud-and-card-overlap.md)
- Size: M
- Shared files: src/game/input/*, action-bar.ts, main.css
- Flags: needs browser/e2e (phone viewports)
- Parallel: HUD lane: serial with PT-1 and FR-*.

### PT-3 Review fixes and performance

- Members: [a11y-review-fixes](../in-progress/a11y-review-fixes.md), [performance-pass](../brainstorm/performance-pass.md), [qa-r102-findings](../done/qa-r102-findings.md)
- Size: M
- Shared files: src/game/*, tools/bench/*, vite config
- Flags: PC-offloadable (bench), needs browser/e2e; check what a11y-review-fixes already shipped
- Parallel: Parallel with SIM and art bundles; serial with main.css bundles.
