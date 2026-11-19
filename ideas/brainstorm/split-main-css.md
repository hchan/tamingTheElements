---
status: idea
added: 2026-11-18
---

# Split main.css by screen (pure refactor)

`src/ui/styles/main.css` is 3,416 lines; the other CSS files are 200-430 lines (help, guide, match-end, picker-compact, idle-aura, tour-select). Split it by area (menu, fight HUD and touch controls, picker, settings, shared tokens) with no visual change.

- Keep every rule in its original order and keep `@import` order, so cascade and specificity are unchanged.
- Run only when no other agent has `main.css` (tour-help-fit and phone fixes edit it often).
- Verify: real screenshots at 4 viewports before and after, compare built CSS if feasible, phone and Help e2e specs, full gate.
- Follow-ups: a repo test failing when a CSS file passes about 800 lines; move phone layout math out of `Hud.ts` when next in there. Arena.ts (1230), action-bar.ts (1209), Hud.ts (1056) are large but cohesive; split only when a feature forces it.
