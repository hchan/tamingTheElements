---
status: idea
added: 2026-11-13
---

# Better animation for buffs and debuffs, on the heroes and on the HUD

Owner request (2026-11-13): "I need better animation on the buffs and debuffs on the heroes and on the HUD."

- **On the hero:** every status (root/Snag, burn, slow, armour, speed, heal, terrain buffs, weather effects) gets a distinct, readable elemental animation on the sprite (grim, desaturated, textured, not cartoony): apply burst, looping aura, expiry fade, and a clear cleanse hand-off (see [elemental-cleanse](elemental-cleanse.md)).
- **On the HUD:** status icons next to each hero's box with animated apply, a draining timer ring, stack count pulse, expire flash; reduced-motion respected; never colour alone (shape/icon too).
- Shares one renderer for both so hero and HUD stay in sync; audio cues via `playSfx`.
