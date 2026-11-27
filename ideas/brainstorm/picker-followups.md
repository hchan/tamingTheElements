---
status: idea
added: 2026-11-15
---

# Picker follow-ups after PB1

- PB2 (planned separately, see ~/claudetmp/plans/picker-fightbar-plan.md).
- Phone portrait: the Versus roster starts below the fold (partner at y 757 of 844); consider a collapsible options block.
- The "More below" strip is decorative only; consider a keyboard-reachable "Jump to Fight" shortcut.
- Roster24: check the longer roster with the region at 800x600.

## Progress (2026-11-26)

- Phone portrait item: closed, obsolete (owner dropped phone work 2026-11-19).
- Roster24 at 800x600: already covered, `tests/e2e/picker-bar.spec.ts` runs the picker at 800x600 (bar below the scroll region, no sideways scroll).
- Keyboard "Jump to Fight": done, a first-Tab "Jump to Fight" chip (shown on focus) in the Versus picker moves focus to Fight (or Random while Fight is disabled); test in `src/ui/screens/arcade-versus.dom.test.ts`.
- Left open: the same chip for the World Tour (`tour.ts`) picker, which shares the "More below" cue.
