---
status: done
added: 2026-11-13
---

# WebRTC WP 08: rollback default decision

Measure rollback against lockstep (`sim:net` and the two-context e2e) and pick the production default; record the numbers in
NETCODE.md. Plan and file list: [docs/WEBRTC-PLAN.md](../../docs/WEBRTC-PLAN.md).

Done 2026-11-14: rollback window 6 is the online default; `?ff=lockstep` (dev/test) opts out; `sim:net --rollback W`; numbers in NETCODE.md. FramePacer stays off under rollback (advantage = prediction lead).
