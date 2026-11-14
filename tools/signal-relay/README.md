# Signal relay (optional room codes)

A tiny WebSocket relay so two players can connect with a 6-character room code instead of copying a long code. It only
passes the two WebRTC signalling codes (offer and answer) between the members of a room; the match itself is still
peer to peer. Plan: [docs/WEBRTC-PLAN.md](../../docs/WEBRTC-PLAN.md) WP 10.

Rules (`rooms.ts`): codes of 6 letters and digits (no 0/O/1/I), two members per room, rooms last 10 minutes, a message is a
JSON text frame under 8 KB and only code characters are accepted, at most 2000 rooms. Nothing is stored after a room ends,
nothing is logged, there are no secrets in this folder.

## Run locally

    corepack pnpm relay                 # ws://127.0.0.1:8787
    corepack pnpm relay --port 9000

Try it in a dev server: `http://localhost:5173/?signal=ws://127.0.0.1:8787#online` (the `?signal=` override works in dev
and test builds only).

## Deploy (the owner's step): Cloudflare Worker

1. `cd tools/signal-relay && npx wrangler deploy` (log in once with `npx wrangler login`). It prints `wss://tte-signal-relay.<you>.workers.dev`.
2. Build the game with that address: `VITE_SIGNAL_URL=wss://tte-signal-relay.<you>.workers.dev pnpm build` (set it as a repository
   variable for the Pages workflow). Without `VITE_SIGNAL_URL` the `#online` screen shows no room-code buttons.

Any host that runs Node works too: `RELAY_HOST=0.0.0.0 pnpm relay` behind a TLS proxy, then use the `wss://` address.
