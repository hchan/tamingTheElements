---
status: in-progress
added: 2026-11-12
---

# Fiara-consistent heroes, environments and abilities

Owner directive: make the other heroes, environment art and ability sprites match Fiara's rigged and baked look, in batches, one agent at a time. Done: Fiara, Pax (needs redo), Treenoc, Morblass (batch 1, `tools/assets/rig-gen/morblass.py`), Rokcore and Curomo (batch 2, 2026-11-12, `rokcore.py`, `curomo.py`; run the generators with a Python that has numpy and Pillow, then `pnpm assets:bake` and `pnpm assets:sheets`). 15 characters are still on the legacy fallback sheets (next: Lavax, Sindarosa, Wispera, Cyclonius and the rest; Curomo is pale on the Water floor, could use a darker outline pass). Ability sprites (iceShock, icicles, hurlRock, rockArmour...) and arena floors come after heroes. Generators go in `tools/assets/rig-gen/`.
