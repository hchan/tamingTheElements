---
status: epic
added: 2026-11-16
---

# Epic: Fight readability and HUD

Numbers, callouts, banners, labels, action bar and HUD clarity during a fight.

- Suggested order: Readability bugs that hide the action first (label clutter, callout/pop collisions, stale numbers), then banners and combo counter, then wide-view projection.
- Size: M overall; mostly S.
- Dependencies: Shares files with portrait/phone HUD work; never two agents on the same HUD file.
- Owner-gated: None.

Member ideas, in suggested priority order (work them as separate small work packages):

- [qa-stale-damage-numbers](../brainstorm/qa-stale-damage-numbers.md): QA: damage numbers and banners linger. After a KO the floating damage numbers (12, 12, 11, 10, 8, 27) are still on screen 100 ticks later and clutter the K.O.
- [qa-stat-mismatch](../brainstorm/qa-stat-mismatch.md): QA: picker stats do not match in-match stats. Sindarosa has 272 HP against Pax 765 in 1v1 (210 vs 445 in 2v2);
- [qa-r3-label-clutter](../in-progress/qa-r3-label-clutter.md): Action-bar TAG label overlaps slot text; prop labels read as debug; heroes stack. Fix: move the TAG cue, use player-facing prop names or icons only, add a soft push-apart, hide empty status boxes, expire damage numbers faster.
- [qa-r6-floor-label-clutter-and-hud-pips](../done/qa-r6-floor-label-clutter-and-hud-pips.md): QA r6: cryptic floor labels, unlabeled HUD pips, flat life bars. Evidence: tourfight-1.png, tourfight-4.png, fight-a-1280.png, fight-a-1920.png (~/claudetmp/qa6/).
- [callouts-collide-with-pops](../done/callouts-collide-with-pops.md): Defence call-outs (ROOTED, FREED, PARRY ...) can still print over white damage pops. DMGNUM-1 moves the grey HUD damage numbers clear of pops and call-outs, but the white pops (shock-view.ts) and the call-outs (defence-view.ts) are sti
- [callout-pop-limits](../brainstorm/callout-pop-limits.md): Follow-up limits of the call-out placement (upward snap, ceiling-pinned overlaps, aura word pops).
- [combo-counter-anchoring](../done/combo-counter-anchoring.md): Combo counter anchoring. Anchor the combo counter to the victim in screen space with the same clamp as damage numbers, so it never leaves the picture on a panned camera.
- [qa-r10-fight-readability](../done/qa-r10-fight-readability.md): QA r10: fight readability and intro. - ROUND 1 banner sits on the centre floor chip ("PAX x2" bleeds through the letters, fire-t1900.png);
- [qa-r13-visual-readability](../brainstorm/qa-r13-visual-readability.md): Readability and art notes (r13). Play screen: the "More heroes below" pill overlaps the hero stat row at 1280x720 and the intro paragraph is long (02-play.png).
- [qa-r41-fight-polish](../brainstorm/qa-r41-fight-polish.md): QA r41: fight polish (desktop 1280x720). Verified from r40: ghost trail shows on Sindarosa fading (2v2-hit.png, translucent red trail plus ring and FADE 2s chip);
- [qa-r30-round-banner-contrast](../brainstorm/qa-r30-round-banner-contrast.md): ROUND 2 banner is washed out. The big grey ROUND 2 with fighter names has low contrast on the fire stage.
- [fight-banner-contact-cut](../in-progress/fight-banner-contact-cut.md): FIGHT! banner: cut it short on first contact. The FIGHT! banner now shows for 30 ticks (0.6 s, FIGHT_BANNER_TICKS).
- [hud-numbers-wide-view-projection](../in-progress/hud-numbers-wide-view-projection.md): HUD damage numbers and the TAG! call project with the 1280 frame on wide views. Hud.ts (damage numbers, ~l630) and tag-view.ts (~l258) project world points into HUD_FRAME (0..1280).
- [tag-call-position-wide-view](../brainstorm/tag-call-position-wide-view.md): TAG! call position on the wide view. On the panned wide camera the TAG! call can sit away from the incoming hero.
- [unified-action-bar](../in-progress/unified-action-bar.md) (in progress): One consistent action bar. Owner: "needs to be consistent ... NO icons on the right please.
- [qa-action-bar-readability](../in-progress/qa-action-bar-readability.md) (in progress): QA: action bar labels are tiny and the bar shifts between heroes. In 77 px slots the 'Weather 3%' and 'Super 2%' text is about 9 px, and the Trap and Cleanse icons are murky.
- [grim-hud-pass](../in-progress/grim-hud-pass.md) (in progress): Grim pass on the HUD (health bars, action bar, banners, pads). Owner feedback (2026-11-12): "all of your new changes look too cartoony".
- [street-fighter-hud](../in-progress/street-fighter-hud.md) (in progress): Street Fighter style HUD. In progress (worktree agent-a93c0396118ec7093).
- [round-result-banner](../in-progress/round-result-banner.md) (in progress): Round result banner (YOU WIN / YOU LOSE / DRAW). Owner request: after a round, a brief verdict with the score, what happened and a sound.

## Filed 2026-11-17 (round-note filing and cross-listing)

Added so every brainstorm idea sits in an epic. Members stay in their own folder; cross-listed ideas also appear in another epic.

- [qa-r103-findings](../done/qa-r103-findings.md): QA r103 findings
- [qa-r104-findings](../done/qa-r104-findings.md): QA r104 findings
- [qa-r105-findings](../brainstorm/qa-r105-findings.md): QA r105 findings
- [qa-r106-findings](../done/qa-r106-findings.md): QA r106 findings
- [qa-r107-findings](../brainstorm/qa-r107-findings.md): QA r107 findings

## Bundles (2026-11-17)

Groups of ideas that touch the same files, so one agent can take the whole bundle. Flags: SIM = sim-changing (needs an Opus plan, a SIM_VERSION bump and a golden re-record with a stated reason, one sim bundle at a time); OWNER-GATED = wait for the owner; PC = heavy generation, balance or e2e work can run on the GPU PC; needs browser/e2e = run Playwright (headless) before calling it done.

Done 2026-11-17: the Strike circle label now uses the Snag name and the portrait 2v2 label fixes (qa-r105 and qa-r107 P2s) are merged; do not re-queue them.

### FR-1 Floating text lanes

- Members: [callout-pop-limits](../brainstorm/callout-pop-limits.md), [combo-counter-anchoring](../done/combo-counter-anchoring.md), [qa-stale-damage-numbers](../brainstorm/qa-stale-damage-numbers.md), [tag-call-position-wide-view](../brainstorm/tag-call-position-wide-view.md), [hud-numbers-wide-view-projection](../in-progress/hud-numbers-wide-view-projection.md)
- Size: M
- Shared files: src/game/fx/pop-lanes.ts, event-fx.ts, Hud.ts
- Flags: needs browser/e2e
- Parallel: HUD and FX lanes both: serial with all other Hud.ts or fx bundles.

### FR-2 Label and hazard chip clutter

- Members: [qa-r3-label-clutter](../in-progress/qa-r3-label-clutter.md), [qa-r6-floor-label-clutter-and-hud-pips](../done/qa-r6-floor-label-clutter-and-hud-pips.md), [qa-r10-fight-readability](../done/qa-r10-fight-readability.md), [qa-r13-visual-readability](../brainstorm/qa-r13-visual-readability.md), [qa-r41-fight-polish](../brainstorm/qa-r41-fight-polish.md), [qa-r105-findings](../brainstorm/qa-r105-findings.md)
- Size: M
- Shared files: Hud.ts, src/game/fx/hazard-view.ts, terrain-view.ts, main.css
- Flags: needs browser/e2e
- Parallel: HUD lane: serial with FR-1, FR-3, FR-4.

### FR-3 Round banner and stat mismatch

- Members: [qa-r30-round-banner-contrast](../brainstorm/qa-r30-round-banner-contrast.md), [fight-banner-contact-cut](../in-progress/fight-banner-contact-cut.md), [round-result-banner](../in-progress/round-result-banner.md), [qa-stat-mismatch](../brainstorm/qa-stat-mismatch.md)
- Size: S
- Shared files: round banner view, Hud.ts
- Flags: needs browser/e2e
- Parallel: HUD lane: serial with the other FR bundles.

### FR-4 Action bar and HUD style (finish in-progress)

- Members: [unified-action-bar](../in-progress/unified-action-bar.md), [qa-action-bar-readability](../in-progress/qa-action-bar-readability.md), [grim-hud-pass](../in-progress/grim-hud-pass.md), [street-fighter-hud](../in-progress/street-fighter-hud.md), [qa-r106-findings](../done/qa-r106-findings.md), [qa-r107-findings](../brainstorm/qa-r107-findings.md)
- Size: M
- Shared files: action-bar.ts, Hud.ts, arcade-hud.ts, main.css
- Flags: needs browser/e2e. Some members are in in-progress/: check what is already merged; r106/r107 supply the HUD life-format item
- Parallel: HUD lane: serial; never with PT-1 or PT-2.
