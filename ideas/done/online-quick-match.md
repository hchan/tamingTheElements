---
status: done
added: 2026-11-18
---

# Online quick match (WP ONLINE-QM)

The Online menu entry opens a guest-first quick match when `VITE_ONLINE_URL` is configured: Find, pick three heroes, Ready, play, Play again. Builds without the variable keep the WebRTC screen. Built on `OnlineClient` (`src/game/net/ws/`); design and state table in `docs/ONLINE-CLIENT.md` "Screen". First step of the lobby in [online-lobby](../brainstorm/online-lobby.md) (its quick-match part).

Follow-ups: [online-quick-e2e](../brainstorm/online-quick-e2e.md), [online-quick-rematch](../brainstorm/online-quick-rematch.md), [online-result-agreement](../brainstorm/online-result-agreement.md), [online-guest-token-persist](../brainstorm/online-guest-token-persist.md), [online-webrtc-removal](../brainstorm/online-webrtc-removal.md).
