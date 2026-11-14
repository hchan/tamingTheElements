---
status: idea
added: 2026-11-14
---

# QA r28: phone menu buttons cover the character art; pause hint is keyboard-only

- 844x390 menu: the five buttons sit across the centre character art (menu-844.png).
- Phone pause says "Press Escape or Shift P to resume", irrelevant on touch (pause3-phone.png).
- A "Rotate your device" role=dialog exists in the DOM at desktop size.
- getByRole('button', {name: '2v2 tag team'}) times out (reproduced twice); check the ARIA roles.

Help screen and the desktop menu are fine.
