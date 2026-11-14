---
status: done
added: 2026-11-14
---

# WebRTC soak: longer and harsher runs

WP 11 ([webrtc-11-soak](../done/webrtc-11-soak.md)) runs the two-context proof for a 1500-tick draw under `?netsim=lat:60,jitter:20,loss:10`.
Follow-ups, to run at night (heavy Mac work window):

- A natural match (`TTE_NATURAL_MATCH=1`) under netsim, and a repeated best-of-3 with `pnpm e2e:flake --repeat 10`.
- A harsher grid: `lat:120..200`, `loss:20..30`, `dup:10`; record the stall and rollback numbers in docs/NETCODE.md.
- A multi-hour idle-link run (tab hidden/visible, pause) to look for slow leaks in the held packet queue and the control mux.
