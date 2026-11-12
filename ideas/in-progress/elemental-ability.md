---
status: in-progress
added: 2026-11-12
---
# Always-available elemental ability (a WoW-racial style button)

Every hero gets one extra button, chosen by the hero's element, on its own cooldown. It is always there (no meter, no charge needed), like a
WoW racial: a short self-buff with a long cooldown, so it adds a decision (when to burn it) without a new resource.
Built in `SIM_VERSION` 39; design and numbers in [docs/FUN-DESIGN.md](../../docs/FUN-DESIGN.md) section 2.24.

| Element | Name | Effect | Cooldown |
| --- | --- | --- | --- |
| Fire | Ember | deals 1250 pm damage for 5 s | 35 s |
| Water | Cleanse | ends its own Snag root, Puddle slow, Ice Blast and tidal slows at once | 25 s |
| Earth | Stoneskin | takes 800 pm damage for 5 s (first 700; eased for Pax and Treenoc) | 35 s |
| Air | Gale | walks at 1300 pm for 5 s | 35 s |

Decisions (autoapproved, 2026-11-12):
- Cooldown 35 s (a match is about 60 to 90 s, so 1 to 2 uses); Cleanse 25 s since it is situational. Reset each round.
- Void: none. Only the training dummy and the Eternal Void boss are void; neither has a natural self-buff and the boss is tuned
  on its own. A press says "No element ability for this hero".
- Weather and terrain stack multiplicatively (a fire hero in Sunshine gets both); Ember and Stoneskin apply to supers and traps too.
- Debuffs Cleanse ends: Snag root (the usual post-root immunity follows), Puddle slow, Ice Blast and tidal slows. Stun is not a
  debuff here (a stunned hero cannot cast). No extra immunity window.
- Keys: P1 V or Minus (rebindable; the digit row is full), pad L3, P2 Semicolon (P2 Tag moved from V to Period, Tag 2 is Comma),
  touch Element button (the square touchBtn style).
- HUD: the action bar slot draws the element's alchemical symbol plus the name and the state in words; a refused press shows
  "<Name> ready in N s". Announcer: "Your Gale: speed up.", "Enemy Cleanse: 2 debuffs cleared." (polite).
- AI (Normal and Hard, Easy never): Ember on a stunned or close foe, Cleanse when rooted or slowed, Stoneskin during the foe's super
  or under half HP, Gale when the foe is far.
- Player-facing names are the element words; never "racial".

Follow-ups:
- Morblass drops to 45.2 % on the 24-seed matrix: water foes Cleanse its Ice Blast slow. Watch it; a small Morblass nudge in
  `ARCADE_RACE_NUMBERS` would fix it if it slips under 45.
- The 8-seed 2v2 baseline was already 23.9 to 77.3 %; Fiara gained 15.9 pp there. A 2v2 matrix with more seeds would tell noise
  from a real Ember-in-tag-teams effect.
- A cast flash or rig pose for each element (view only; today the cue is the HUD slot, the sound and the live line).
