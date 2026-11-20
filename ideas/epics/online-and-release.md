---
status: epic
added: 2026-11-12
---

# Epic: Online, tests and release

Online play, e2e stability, test infrastructure, release and housekeeping.

Member ideas (all in [../brainstorm/](../brainstorm/) unless moved; work them as one theme, in separate small work packages):

- [online-play](../brainstorm/online-play.md)
- Retired WebRTC plan, history only ([docs/WEBRTC-PLAN.md](../../docs/WEBRTC-PLAN.md)):
  [01](../done/webrtc-01-proof-harness.md), [02](../done/webrtc-02-compact-codes.md),
  [03](../done/webrtc-03-share-link-qr.md), [04](../done/webrtc-04-ice-config.md),
  [05](../done/webrtc-05-leave-rematch.md), [06](../done/webrtc-06-mobile.md),
  [07](../done/webrtc-07-frame-pacing.md), [08](../done/webrtc-08-rollback-default.md),
  [09](../done/webrtc-09-quality-desync-report.md), [10](../done/webrtc-10-relay-room-codes.md),
  [11](../done/webrtc-11-soak.md)
- [online-rematch-e2e-flake-under-load](../done/online-rematch-e2e-flake-under-load.md)
- [e2e-coverage-and-browsers](../in-progress/e2e-coverage-and-browsers.md)
- [e2e-stability-runs](../done/e2e-stability-runs.md)
- [test-dom-environment-for-menus](../done/test-dom-environment-for-menus.md)
- [nightly-fun-gates](../done/nightly-fun-gates.md)
- [release-itch-pages](../brainstorm/release-itch-pages.md)
- [repo-housekeeping](../brainstorm/repo-housekeeping.md)
- [docs-refresh](../done/docs-refresh.md)
- [parity-open-rows](../in-progress/parity-open-rows.md)
- [polish-backlog](../brainstorm/polish-backlog.md)
- [sf-versus-join-in](../brainstorm/sf-versus-join-in.md)

## Filed 2026-11-17 (round-note filing and cross-listing)

Added so every brainstorm idea sits in an epic. Members stay in their own folder; cross-listed ideas also appear in another epic.

- [online-lobby](../brainstorm/online-lobby.md): Online lobby (AWS backbone later)
- [online-quick-join-slots](../brainstorm/online-quick-join-slots.md): Online quick join with digit slots 0-9
- [e2e-webserver-health](../done/e2e-webserver-health.md): E2E webServer health: a dead preview must not cascade into hundreds of failures
- [short-and-long-gate](../in-progress/short-and-long-gate.md): Short gate on every merge, long gate once a day
- [qa-r100-findings](../brainstorm/qa-r100-findings.md): QA round 100 findings
- [qa-r101-findings](../brainstorm/qa-r101-findings.md): QA r101 findings
- [qa-r102-findings](../brainstorm/qa-r102-findings.md): QA r102 findings

## Bundles (2026-11-17)

Groups of ideas that touch the same files, so one agent can take the whole bundle. Flags: SIM = sim-changing (needs an Opus plan, a SIM_VERSION bump and a golden re-record with a stated reason, one sim bundle at a time); OWNER-GATED = wait for the owner; PC = heavy generation, balance or e2e work can run on the GPU PC; needs browser/e2e = run Playwright (headless) before calling it done.

### OR-1 Online flow, lobby and quick join

- Members: [online-play](../brainstorm/online-play.md), [online-lobby](../brainstorm/online-lobby.md), [online-quick-join-slots](../brainstorm/online-quick-join-slots.md), [sf-versus-join-in](../brainstorm/sf-versus-join-in.md), [qa-r102-findings](../brainstorm/qa-r102-findings.md)
- Size: L
- Shared files: src/game/net/*, src/core/net/*, src/core/relay/*, online UI, main.css
- Flags: OWNER-GATED: quick join is parked (manual codes only, owner 2026-11-17); the lobby needs an AWS decision (outward-facing). Only the qa-r102 copy fixes are free to do now. needs browser/e2e
- Parallel: Online lane: parallel with SIM and FX; serial with main.css bundles.

### OR-2 Short and long gate, e2e health, itch release

- Members: [short-and-long-gate](../in-progress/short-and-long-gate.md), [e2e-webserver-health](../done/e2e-webserver-health.md), [e2e-coverage-and-browsers](../in-progress/e2e-coverage-and-browsers.md), [release-itch-pages](../brainstorm/release-itch-pages.md)
- Size: M
- Shared files: tools/ci/*, playwright.config.ts, tools/ci/size-budget.json, docs/TESTING.md, CLAUDE.md gate rule
- Flags: Opus plan first; owner confirms the CLAUDE.md gate change; PC-offloadable (full e2e, repeat runs); needs browser/e2e
- Parallel: Tools lane: never with TQ-1 or AU-1 (size-budget.json); parallel with everything else.

### OR-3 Housekeeping and parity rows

- Members: [repo-housekeeping](../brainstorm/repo-housekeeping.md), [parity-open-rows](../in-progress/parity-open-rows.md), [polish-backlog](../brainstorm/polish-backlog.md)
- Size: S
- Shared files: docs/REPO-MAP.md, docs/PARITY.md, small src cleanups
- Flags: no sim change; deleting Classic sim code is owner-gated
- Parallel: Same work as PD-1 (listed in both epics): run once.
