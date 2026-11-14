---
status: done
added: 2026-11-13
---

# WebRTC WP 07: frame-advantage pacing

The session reports frame advantage (read-only); the online Arena driver skips an update now and then when ahead, so the faster
peer stops stalling. Core-touching: run alone. Plan and file list: [docs/WEBRTC-PLAN.md](../../docs/WEBRTC-PLAN.md).

Done: `LockstepSession.frameAdvantage()` (read-only, 16-update mean) and `FramePacer` (`src/core/net/pacing.ts`); the online Arena driver skips one update in four while the advantage exceeds 1 tick. Test `src/testing/net/pacing.test.ts` (fewer stalls, same hashes).
