---
status: in-progress
added: 2026-11-12
---

# Fiara-consistent heroes, environments and abilities

Owner directive: make the other heroes, environment art and ability sprites match Fiara's rigged and baked look, in batches, one agent at a time. Done: Fiara, Pax (needs redo), Treenoc, Morblass (batch 1, `tools/assets/rig-gen/morblass.py`), Rokcore and Curomo (batch 2, `rokcore.py`, `curomo.py`), Lavax and Sindarosa (batch 3, 2026-11-12, `lavax.py` magma ape, `sindarosa.py` fire dragon; the outline pass was thickened to 3 px at 4x supersampling and made fully opaque in lavax, sindarosa and curomo so they read on their Fire/Water floors; run the generators with a Python that has numpy and Pillow, then `pnpm assets:bake` and `pnpm assets:sheets`). 13 characters are still on the legacy fallback sheets (next: Wispera, Cyclonius and the rest; Lavax and Sindarosa are still orange-on-orange against the Fire floor, a cooler or darker body could help). Ability sprites (iceShock, icicles, hurlRock, rockArmour...) and arena floors come after heroes. Generators go in `tools/assets/rig-gen/`.
