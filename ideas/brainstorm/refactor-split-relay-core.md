---
status: idea
added: 2026-11-21
epic: [process-and-docs](../epics/process-and-docs.md)
---

# Refactor: split `src/core/relay/core.ts`

- Current size: 885 lines (wc -l, 2026-11-21); no entry in `tools/ci/size-grandfather.json` (the 500-line limit in `tests/repo/file-size.test.ts` is the bar).
- Goal: behaviour-preserving split, SOLID and small files (target under 500 lines each).
- Proposed seams: (1) hello/handshake handling (the hello section, about lines 278-382); (2) queue and room pairing (the queue-and-rooms section, lines 382-638); (3) match phase: results, hash comparison, `matchStart` (lines 638-779); (4) storage and send helpers (`getConn`, `putConn`, `claim`, `sendError`) as a `relay/store` module; keep `RelayCore` as the dispatcher.
- Risk: High: src/core runs in the deterministic sim, so goldens, replays and the cross-browser hash are at risk. Opus (max effort) plans first, Sonnet builds; run golden/replay tests and `sim:match` before and after, and the determinism-reviewer.
- Acceptance: `gate:commit` passes; the grandfather entry is removed or lowered; one REPO-MAP line per new file; no behaviour change (no golden or snapshot re-record).
