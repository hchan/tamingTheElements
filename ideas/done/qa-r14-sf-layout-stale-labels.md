---
status: done
added: 2026-11-14
---

# Fighting-game layout leaves wrong key labels (r14)

After applying the fighting-game layout, Echo's bar shows Charge as 5 (it is on H, and 5 is also the alternate for Tag 3), the screen-reader list under the arena still reads "= Cleanse ready, - Element ready, 0 Trap ready, 6 Weather, 9 Super" (default keys), and Cleanse's keycap is the long word Semicolon (11-sf-fight-hint.png, 13-sf-after.png). Charge and Tag 3 also share alternate key 5.

Fix: show the primary bound key on every slot and in the screen-reader labels, print ; instead of Semicolon, and give Charge a free alternate.
