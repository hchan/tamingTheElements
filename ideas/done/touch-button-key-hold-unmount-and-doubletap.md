---
status: done
added: 2026-11-12
---
# Touch button: key hold survives unmount, and a tap inside the min-hold window is swallowed

Found by first-pass review of c30bb99 (`src/game/app/touch-controls.ts`, `touchButton`, ~lines 123-190).

1. Stuck key on unmount. `byKey` or `byPointer` is true and the button is removed from the DOM (a Tour stage change or results screen
   does `battle.replaceChildren(host)`). Browsers do not reliably fire `blur`, `pointerup` or `lostpointercapture` on a removed element
   (Chromium historically does not blur on removal), so `sync()` never runs and the synthetic `keydown` on `window` has no matching `keyup`.
   The pending `keyTimer` (up to 100 ms) is not cleared either; it fires after unmount and dispatches a `keyup` into whichever arena
   is live by then (harmless but untracked). Fix: have `watchTouch` (which already notices `!isConnected`) or a `MutationObserver`/exposed
   `dispose()` call `releasePointer(); releaseKey()` for every button, and clear `keyTimer`.
2. Double tap swallowed. After `keyup` schedules `releaseKey` (wait > 0) `byKey` stays true until the timer fires, so a second Enter/Space
   `keydown` within the remaining <= 100 ms hits `if (e.repeat || byKey) return;` and is dropped. Switch users who tap fast lose a press.
   Fix: on a non-repeat `keydown` while `keyTimer` is pending, clear the timer and treat it as a continuing hold (or re-arm).
3. Cheap test gaps: no test removes the button mid-hold, none taps twice inside 100 ms.
