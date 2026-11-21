---
status: epic
added: 2026-11-12
---

# Epic: Accessibility, controls and onboarding

Touch, controller, a11y and the tutorial and help.

Member ideas (all in [../brainstorm/](../brainstorm/) unless moved; work them as one theme, in separate small work packages):

- [accessibility-pass](../in-progress/accessibility-pass.md)
- [a11y-hybrid-pointer-touch-buttons](../done/a11y-hybrid-pointer-touch-buttons.md)
- [controller-and-touch](../in-progress/controller-and-touch.md)
- [tutorial-and-help](../in-progress/tutorial-and-help.md)
- [sf-training-mode](../brainstorm/sf-training-mode.md)
- [replays-and-training](../brainstorm/replays-and-training.md)

## Filed 2026-11-17 (round-note filing and cross-listing)

Added so every brainstorm idea sits in an epic. Members stay in their own folder; cross-listed ideas also appear in another epic.

- [qa-r104-findings](../done/qa-r104-findings.md): QA r104 findings
- [qa-r105-findings](../brainstorm/qa-r105-findings.md): QA r105 findings
- [qa-r106-findings](../brainstorm/qa-r106-findings.md): QA r106 findings

## Bundles (2026-11-17)

Groups of ideas that touch the same files, so one agent can take the whole bundle. Flags: SIM = sim-changing (needs an Opus plan, a SIM_VERSION bump and a golden re-record with a stated reason, one sim bundle at a time); OWNER-GATED = wait for the owner; PC = heavy generation, balance or e2e work can run on the GPU PC; needs browser/e2e = run Playwright (headless) before calling it done.

### AO-1 Input accessibility and first-run card

- Members: [accessibility-pass](../in-progress/accessibility-pass.md), [controller-and-touch](../in-progress/controller-and-touch.md), [tutorial-and-help](../in-progress/tutorial-and-help.md), [qa-r104-findings](../done/qa-r104-findings.md), [qa-r105-findings](../brainstorm/qa-r105-findings.md), [qa-r106-findings](../brainstorm/qa-r106-findings.md)
- Size: M
- Shared files: src/ui/*, src/game/input/*, src/game/a11y/*, main.css, first-run hint code
- Flags: needs browser/e2e (first-run-hint specs)
- Parallel: HUD/UI lane: serial with bundles touching main.css, Hud.ts or action-bar.ts.
