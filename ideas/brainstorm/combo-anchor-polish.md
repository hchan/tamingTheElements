---
status: idea
added: 2026-11-19
---

# Combo anchor polish

Tune easing, the 40% stuck fade and the pop size of the anchored combo counter after owner playtest. Follow-up to [combo-counter-anchoring](../done/combo-counter-anchoring.md).

## Progress note (2026-11-26)

Done: a counter that stops being stuck brightens back over 160 ms instead of snapping from 40% to full (`stuckMix`/`stuckAlpha`). Going faint stays immediate. Easing tau (35 ms) is left alone: it is pinned to the call-out ease by a parity test. Pop size unchanged. Still open: owner playtest of the rest.
