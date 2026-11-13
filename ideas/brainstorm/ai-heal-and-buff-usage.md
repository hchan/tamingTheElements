---
status: idea
added: 2026-11-13
---

# Scripted AI: use Fire Heal and the buffs more

From `pnpm ability:usage` (Arcade, AI level 3): Fiara's Fire Heal is cast 0.7 times per minute (1% of her casts) because `wantsSelfCast` in tools/sim/run-match.ts only heals below 60% health. Buffs run 3 to 6 casts a minute with 7 to 33% uptime (Rock Armour 19%, Adrenaline 20%, Translucent Flame 18%, Fade 7%). Before any buff or heal rebalance (see fire-heal-buff), tune the AI to use them sensibly (heal threshold by cooldown, buffs on incoming threat), so a weak number is the ability and not the bot. Tooling and AI only; re-run ability:usage and balance:compare.
