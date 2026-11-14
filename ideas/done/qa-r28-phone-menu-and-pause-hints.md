---
status: done
added: 2026-11-14
---

# QA r28: phone menu buttons cover the character art; pause hint is keyboard-only

- 844x390 menu: the five buttons sit across the centre character art (menu-844.png).
- Phone pause says "Press Escape or Shift P to resume", irrelevant on touch (pause3-phone.png).
- A "Rotate your device" role=dialog exists in the DOM at desktop size.
- getByRole('button', {name: '2v2 tag team'}) times out (reproduced twice); check the ARIA roles.

Help screen and the desktop menu are fine.

- 2026-11-14: phone-landscape menu row moved to the bottom (crest hidden), clear of the art; pause hint is 'Tap Resume to continue.' on coarse-pointer devices; 2v2 tag team is role=radio in a radiogroup (not a button): getByRole('radio') works, e2e pins it. The 'Rotate your device' dialog at desktop size was not reproduced in code (presentation.ts only shows it for portrait phones); not changed.
