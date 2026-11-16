---
status: idea
added: 2026-11-16
---

# In `?manual=1` the white damage pops never age

With the driver paused (manual stepping) the shock layer's pops only advance when `ageFx(true)` is on, so a pop from a hit stays on screen at full alpha until the test turns ageing on. That is intended for deterministic screenshots, but it means manual-mode e2e cannot see a pop expire without `ageFx`, and QA repros in manual mode (QA r74) show stale pops. Follow-up: decide whether pops should age on rAF time in manual mode (with a probe to freeze them), and document it in docs/TESTING.md.
