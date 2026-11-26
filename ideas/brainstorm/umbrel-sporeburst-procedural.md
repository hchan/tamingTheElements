---
status: idea
added: 2026-11-26
---

# Umbrel sporeBurst: procedural Phaser particle burst (rule 13 ladder, step 3)

Art session (2026-11-26): the sporeBurst sprite failed three i2i rounds (best seed 70003 REVISE 3: cream instead of ochre/olive, a speck halo), so the shipped sporeBurst stays and the art route is parked (with Vortigal stoop and Quarrak hurlRock; Abyssor/Glimmaw abyssalPull is the last one still in work at the art session).
Fourth method, our side: a procedural Phaser particle burst replacing the sprite for Umbrel's spore cast: 12-20 olive/ochre specks (colours from the shipped palette, not cream), random radius and size, thrown outward and fading. Find where sporeBurst is drawn (`git grep sporeBurst src/game`; ability-aura-view / fx cast views), follow the Phaser particles skill (`node_modules/phaser/skills/particles/SKILL.md`), keep it render-only (no sim change), deterministic-free (view layer may use its own RNG, never the sim RNG), reduced motion = a single faint puff or the shipped sprite. Tests for the spec table/colours/counts; real-game screenshot of a burst sent to the art-director (a mid-animation frame via the manual-stepping probe). Same recipe fits Quarrak hurlRock and Vortigal stoop later if the director wants them.
