---
status: planned
added: 2026-11-13
---

# WebRTC WP 01: two-context proof harness

Two separate headless browser contexts play a full online match over loopback WebRTC (`?ice=none`, `?ff=netbot`) and agree on
the winner and every checkpoint hash, lockstep and rollback. Read-only `checkpoints()` on the session, test-hook `net()` probe.
Plan and file list: [docs/WEBRTC-PLAN.md](../../docs/WEBRTC-PLAN.md).
