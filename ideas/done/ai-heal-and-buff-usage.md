---
status: done
added: 2026-11-13
---

# Scripted AI: use Fire Heal and the buffs more

From `pnpm ability:usage` (Arcade, AI level 3): Fiara's Fire Heal is cast 0.7 times per minute (1% of her casts) because `wantsSelfCast` in tools/sim/run-match.ts only heals below 60% health. Buffs run 3 to 6 casts a minute with 7 to 33% uptime (Rock Armour 19%, Adrenaline 20%, Translucent Flame 18%, Fade 7%). Before any buff or heal rebalance (see fire-heal-buff), tune the AI to use them sensibly (heal threshold by cooldown, buffs on incoming threat), so a weak number is the ability and not the bot. Tooling and AI only; re-run ability:usage and balance:compare.

## Resolution (2026-11-14): no change, the premise did not hold

Re-measured `pnpm ability:usage --seeds 8` (Arcade, level 3). The bot is already at the cooldown cap, so the numbers were the ability, not the bot:

- Fire Heal: cooldown 40 s gives a ceiling of 1.5 casts/min; the bot casts 1.4 (93%). Raising the heal threshold from 0.6 to 0.85 of max health in Arcade gave 1.5/min (205 vs 182 casts), within noise, so it was not kept. The heal is 10 hp; its 3% cast share is the 40 s cooldown, not the threshold.
- Buffs against their cooldown ceilings (casts/min actual of max): Adrenaline 3.3 of 4.0, Rock Armour 2.9 of 4.0, Fade 5.2 of 6.0, Fire Dance 3.3 of 3.75. Uptime 17 to 33% follows from a 3 s window on a 10 to 15 s cooldown, so only a longer duration or shorter cooldown raises it.
- Only Translucent Flame has headroom (5.3 of 10 per min, 6 s cooldown) and it is gated on a real threat on purpose.

Any heal/buff rebalance (fire-heal-buff) can therefore proceed on the ability numbers directly. No sim or AI change, no SIM_VERSION bump, no re-record; Classic goldens and baselines untouched.
