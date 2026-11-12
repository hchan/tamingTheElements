---
status: brainstorm
---

# Effect sprite batches (A-D)

Redraw the 54 static effect sprites in the style of the iceShock redo (commit e9bff77): hue-shifted ramps from `tools/assets/rig-gen/palette.py`, dark outline, element-specific shapes, check with `contrast-check.py`. One generator per batch in `tools/assets/fx-gen/`, output under `public/assets/img/fx/`, manifest keys unchanged.

- A ice: iceBlast, iceBreath, shardsOfIce, iceShock (done), icicles, iceSheet
- B fire: fireBlast, crimsonFire, chaoticFire, fireball, fireDance, fireHeal, fire, fireCircle
- C earth/nature: groundShock, rockPellet, hurlRock, rockElementalRed, rockArmour, earth, stranglingBranches, vineTrap, entanglingVines, entanglingVinesLong
- D air/water/chaos: windCone, air, hurricane, sonarBlast, water, waterCircle, waterCorner, chaosBolt, chaosOrb, slimeBlast, stealHealth, voidCircle

Rules: only the coordinator edits `manifest.generated.json`, the size budget and REPO-MAP (agents report the manifest entries). Multi-frame sprites are a later step (needs a `build-assets.ts` schema change, one owner).
