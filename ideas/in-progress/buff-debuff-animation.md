---
status: in-progress
added: 2026-11-13
---

# Better animation for buffs and debuffs, on the heroes and on the HUD

Owner request (2026-11-13): "I need better animation on the buffs and debuffs on the heroes and on the HUD."

- **On the hero:** every status (root/Snag, burn, slow, armour, speed, heal, terrain buffs, weather effects) gets a distinct, readable elemental animation on the sprite (grim, desaturated, textured, not cartoony): apply burst, looping aura, expiry fade, and a clear cleanse hand-off (see [elemental-cleanse](elemental-cleanse.md)).
- **On the HUD:** status icons next to each hero's box with animated apply, a draining timer ring, stack count pulse, expire flash; reduced-motion respected; never colour alone (shape/icon too).
- Shares one renderer for both so hero and HUD stay in sync; audio cues via `playSfx`.

## Progress notes (2026-11-13)

Done: `src/game/fx/status-fx.ts` (pure model: looks, curves, tracker), `status-fx-view.ts` (lazy hero view: apply burst, expiry fade for all nine statuses; loops for veil, freeze, slow, fast, guard, tide), HUD chips in `Hud.ts` (apply pop and flash, draining ring, shape icon, low-time blink, expire flash; `CHIP_W` 96). Reduced motion keeps the cues, drops the motion. Rush, Fire and Rock loops stay in ability-aura-view.

Not done / findings: burn and Fire Heal are not sim statuses (fire only burns a Snag rope; Fire Heal is an action-bar pop), so they have no status animation. The Cleanse hand-off waits for the sim work. Audio cues via `playSfx` not added. The Classic buff squares (`drawLegacyBuffs`) are unchanged.
