---
status: in-progress
added: 2026-11-12
---

# Gamepad and touch polish

Full gamepad rebinding and a button-layout screen, haptics, on-screen button position and size options, verify on a real phone and tablet, safe areas.

## Progress

- Done: on-screen button haptics (Settings checkbox, device-local in `tte.touchLayout`, `touchHaptic` on button press). Size and side options and safe areas already existed.
- Done: gamepad rebinding. A "Gamepad buttons" section on the Key Bindings screen (`src/ui/screens/pad-bindings-section.ts`): one button per action, activate then press the new pad button, announced in words (status region), Escape cancels, Tab leaves, a used button swaps with its owner, reset. Model and device-local store (`tte.padBindings`) in `src/game/platform/input/pad-bindings.ts`; `padConfigFor` in `src/game/input/gamepad.ts` applies it to both game kinds and pause. No src/core change.
- Done: stick deadzone option. A range slider (10 to 80 percent, default 40, `aria-valuetext` in words) plus a reset button under the Gamepad buttons section; device-local store `tte.padDeadzone` and `getPadDeadzone`/`setPadDeadzone` in `pad-bindings.ts`; `padConfigFor` applies it to both game kinds. Tests: `src/game/input/pad-deadzone.test.ts`, the section dom test, `tests/e2e/pad-deadzone.spec.ts` (stubbed `navigator.getGamepads`).
- Open: free button positioning, real phone/tablet and real pad verification.
