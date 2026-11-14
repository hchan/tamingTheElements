---
status: done
added: 2026-11-14
---

# QA r20: phone letterbox and tiny HUD at 844x390

At 844x390 the arena is pillarboxed with dark side bars, HUD text (Life 545/545, SUPER) is about 8-9 px, and the First Blood hint panel covers the fighters' lower half and the centre of the stage. Hotbar slots are small. Use the full width, scale HUD text up, and auto-dismiss the hint or dock it above the hotbar on phones. Related: qa-r19-phone-letterbox-wastes-screen.

## Done (2026-11-14)

Letterbox was fixed by the wide view; HUD text raised (see qa-r19-phone-letterbox-wastes-screen). The First Blood card now docks under the HUD bar on short landscape touch screens (`main.css`), clear of the fighters, the stick and the action bar; pinned by a test in `tests/e2e/touch-fight-layout.spec.ts`. Verified at 844x390 and 932x430.
