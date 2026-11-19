---
status: done
added: 2026-11-15
---

# Core swapAllowed accessor

The HUD infers why a tag is blocked (WAIT, STUN) from the phase and status flags (WP-HC1 D). Add one `swapAllowed` accessor in src/core so the HUD and the sim cannot disagree. Needs the sim slot; no behaviour change.

Done 2026-11-18: swapAllowed/SwapBlock (merged in 46992a0d) is the one swap rule; swapSystem, the Tag slot word and the press notice read it; the busy fallback counts game ticks plus the online input delay and resets per match. No SIM_VERSION bump.
