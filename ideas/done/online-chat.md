# Online free-text chat (MUST, owner 2026-11-21)

Owner requirement, not optional: free-text chat between the two players of an online match, available in the match and on the result screen, in a minimizable window (WoW style).

- Design: Opus plan in `.scratch/plans/chat.md` (worktree mp-chat), then Sonnet builds.
- Relay side: backend session sct-27 agreed the CHAT frame (0x70), rate limit, counts-only logging, capability flag preferred over a version bump; final layout is fixed in the plan and docs/ONLINE-PROTOCOL.md first.
- Client does word filter and mute; the relay does not see or log text.
- Tests: failing-first unit tests, in-repo RelayCore conformance, e2e on the RouteSender rig, a clean live pass of 12+ runs after the transport change.

## Progress
- 2026-11-21: worktree mp-chat created, relay spec sent to sct-27, answers received (accepted 1-4, 6; rate limit and counts-only logging; capability flag; no ordering on the real relay).
- 2026-11-22: design sent to sct-27 and answered. On local main: chat-0 docs, chat-1 relay rules+codec, chat-2 relay core, chat-3 client transport, chat-4 conformance + relay 1.1.0, chat-5 channel+filter, chat-6 view, chat-7 glue. Running: chat-8 e2e. Next: chat-9 live pass (after sct-27 deploys), chat-10 done. Open: relay-v1.1.0 tag is the owner's call; real-game screenshot of the dock still to do.
- 2026-11-22: done. Relay 1.1.0 deployed chat OFF then ON by the backend session. Live pass (measurements, one run each unless stated): conformance `--advisory-close --no-binary --retry-ordering 3` 94 passed, 0 failed, 7 skipped; 12 of 12 consecutive `online:live-match --chat` runs clean, peak 6-10 frames/s (limit 150); each other live scenario once, OK. First chat runs showed the rate limit not refusing: cause was Lambda cold starts delaying frames about 2 s while the bucket read the handler clock; fixed server side by using the API Gateway arrival time. Layout redesign (arena fills the viewport, folded top-icon menu), start input delay cap 2 and the panel placement under the HUD shipped alongside. Open: real-game screenshot of the chat dock.
