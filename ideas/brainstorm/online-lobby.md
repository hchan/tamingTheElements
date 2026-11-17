---
status: idea
added: 2026-11-17
---

# Online lobby (AWS backbone later)

Owner idea, 2026-11-17: a LOBBY for Online play, with AWS as the backbone later.

Today a friend must be sent a copy/paste code or an invite link (see `docs/WEBRTC-PLAN.md`); the room-code relay (`tools/signal-relay/`, `src/game/net/relay.ts`) exists but is only shown with `VITE_SIGNAL_URL`. A lobby would let players find each other without exchanging anything out of band.

## Shape (sketch, not a plan)
- A hosted service (AWS: e.g. API Gateway WebSocket + Lambda/DynamoDB, or a small Fargate service) that does only signalling and presence: list open games, create/join a room, relay the WebRTC offer/answer. Match traffic stays peer to peer; the deterministic sim needs no server authority.
- Lobby screen under the existing Online entry (no new menu item): open games list with host name, hero element, ping hint, Join button; Host button; optional quick match (random matchmaking).
- Same relay protocol as `tools/signal-relay/` so the current room code and a lobby are one client path (`relay.ts`); room codes stay as the private-game route.
- Needs: handshake of SIM_VERSION and flags before listing a game as joinable, room expiry (10 min today), rate limits, no accounts at first (anonymous display name), abuse/report later.

## Open questions
- Hosting cost and region; keep the free copy/paste path as the no-server fallback.
- Names and moderation; whether to add accounts.
- Public repo: no AWS account IDs, endpoints or keys in committed files (use `VITE_SIGNAL_URL` at build time).

Related: the Online join-flow redesign (planned 2026-11-17) should be lobby-ready: one Host/Join choice that a lobby list can later plug into.
