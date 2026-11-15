---
status: idea
added: 2026-11-15
---

# Core swapAllowed accessor

The HUD infers why a tag is blocked (WAIT, STUN) from the phase and status flags (WP-HC1 D). Add one `swapAllowed` accessor in src/core so the HUD and the sim cannot disagree. Needs the sim slot; no behaviour change.
