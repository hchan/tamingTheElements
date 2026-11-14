---
status: done
added: 2026-11-13
---

# WebRTC WP 10: optional relay signalling (room codes)

A tiny WebSocket room relay in `tools/signal-relay/` (the owner deploys it, for example as a free Cloudflare Worker); the client
shows room codes only when a build sets `VITE_SIGNAL_URL`. Plan and file list: [docs/WEBRTC-PLAN.md](../../docs/WEBRTC-PLAN.md).
