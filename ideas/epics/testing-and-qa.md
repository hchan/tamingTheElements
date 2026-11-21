---
status: epic
added: 2026-11-16
---

# Epic: Testing and QA

QA evaluator rounds (scorecards and findings), recheck notes and verification todos.

- Suggested order: Fix verification gaps (Firefox launch on macOS, itch size budget), then read the newest scorecards for open items.
- Size: Ongoing.
- Dependencies: Scorecards and findings files are kept as written (history); this epic only indexes them.
- Owner-gated: None.

Member ideas, in suggested priority order (work them as separate small work packages):

- [verify-firefox-playwright-launch-macos](../brainstorm/verify-firefox-playwright-launch-macos.md): Firefox cross-browser golden replay cannot launch on this Mac. pnpm test:browser (docs/DETERMINISM.md, cross-browser goldens):
- [verify-itch-size-budget](../brainstorm/verify-itch-size-budget.md): build:itch fails the total size budget, so e2e:itch cannot run. At main 8c969b3f pnpm build:itch ends with FAIL 74379796 bytes exceeds total budget 41943040 (itch site 70.93 MiB), so no zip is made and pnpm e2e:itc
- [qa-r36-r35-recheck](../brainstorm/qa-r36-r35-recheck.md): QA r36: r35 fix re-check. - PAX/TAG call no longer covers fighters or damage numbers:
- [qa-r38-desktop-notes](../brainstorm/qa-r38-desktop-notes.md): QA r38 smaller desktop findings (1280x720). - Terrain chips: the r37 collision with TAG! / SINDAROSA IN! is fixed (chips hid under the call in tag-0..2 frames).

QA evaluator rounds (kept unchanged; newest first, the latest rounds hold the open items):

- [qa-r85-scorecard](../brainstorm/qa-r85-scorecard.md)
- [qa-r85-findings](../brainstorm/qa-r85-findings.md)
- [qa-r84-scorecard](../brainstorm/qa-r84-scorecard.md)
- [qa-r84-findings](../brainstorm/qa-r84-findings.md)
- [qa-r83-scorecard](../brainstorm/qa-r83-scorecard.md)
- [qa-r83-findings](../brainstorm/qa-r83-findings.md)
- [qa-r82-scorecard](../brainstorm/qa-r82-scorecard.md)
- [qa-r82-findings](../brainstorm/qa-r82-findings.md)
- [qa-r81-scorecard](../brainstorm/qa-r81-scorecard.md)
- [qa-r81-findings](../brainstorm/qa-r81-findings.md)
- [qa-r80-scorecard](../brainstorm/qa-r80-scorecard.md)
- [qa-r80-findings](../done/qa-r80-findings.md)
- [qa-r79-scorecard](../brainstorm/qa-r79-scorecard.md)
- [qa-r79-findings](../done/qa-r79-findings.md)
- [qa-r78-scorecard](../brainstorm/qa-r78-scorecard.md)
- [qa-r78-findings](../done/qa-r78-findings.md)
- [qa-r77-scorecard](../brainstorm/qa-r77-scorecard.md)
- [qa-r76-scorecard](../brainstorm/qa-r76-scorecard.md)
- [qa-r76-findings](../done/qa-r76-findings.md)
- [qa-r75-scorecard](../brainstorm/qa-r75-scorecard.md)
- [qa-r75-findings](../done/qa-r75-findings.md)
- [qa-r74-scorecard](../brainstorm/qa-r74-scorecard.md)
- [qa-r74-findings](../done/qa-r74-findings.md)
- [qa-r73-scorecard](../brainstorm/qa-r73-scorecard.md)
- [qa-r73-findings](../brainstorm/qa-r73-findings.md)
- [qa-r72-scorecard](../brainstorm/qa-r72-scorecard.md)
- [qa-r72-findings](../done/qa-r72-findings.md)
- [qa-r71-scorecard](../brainstorm/qa-r71-scorecard.md)
- [qa-r71-findings](../done/qa-r71-findings.md)
- [qa-r70-scorecard](../brainstorm/qa-r70-scorecard.md)
- [qa-r70-findings](../done/qa-r70-findings.md)
- [qa-r69-scorecard](../brainstorm/qa-r69-scorecard.md)
- [qa-r69-findings](../done/qa-r69-findings.md)
- [qa-r68-scorecard](../brainstorm/qa-r68-scorecard.md)
- [qa-r68-findings](../done/qa-r68-findings.md)
- [qa-r67-scorecard](../brainstorm/qa-r67-scorecard.md)
- [qa-r67-findings](../done/qa-r67-findings.md)
- [qa-r66-scorecard](../brainstorm/qa-r66-scorecard.md)
- [qa-r66-findings](../done/qa-r66-findings.md)
- [qa-r65-scorecard](../brainstorm/qa-r65-scorecard.md)
- [qa-r65-findings](../brainstorm/qa-r65-findings.md)
- [qa-r64-scorecard](../brainstorm/qa-r64-scorecard.md)
- [qa-r64-findings](../done/qa-r64-findings.md)
- [qa-r63-scorecard](../brainstorm/qa-r63-scorecard.md)
- [qa-r63-findings](../done/qa-r63-findings.md)
- [qa-r62-scorecard](../brainstorm/qa-r62-scorecard.md)
- [qa-r62-findings](../done/qa-r62-findings.md)
- [qa-r61-scorecard](../brainstorm/qa-r61-scorecard.md)
- [qa-r61-findings](../done/qa-r61-findings.md)
- [qa-r60-scorecard](../brainstorm/qa-r60-scorecard.md)
- [qa-r60-findings](../done/qa-r60-findings.md)
- [qa-r59-scorecard](../brainstorm/qa-r59-scorecard.md)
- [qa-r59-findings](../done/qa-r59-findings.md)
- [qa-r58-scorecard](../brainstorm/qa-r58-scorecard.md)
- [qa-r58-findings](../done/qa-r58-findings.md)
- [qa-r57-scorecard](../brainstorm/qa-r57-scorecard.md)
- [qa-r57-findings](../brainstorm/qa-r57-findings.md)
- [qa-r56-scorecard](../brainstorm/qa-r56-scorecard.md)
- [qa-r56-findings](../done/qa-r56-findings.md)
- [qa-r55-scorecard](../brainstorm/qa-r55-scorecard.md)
- [qa-r55-findings](../done/qa-r55-findings.md)
- [qa-r54-scorecard](../brainstorm/qa-r54-scorecard.md)
- [qa-r54-findings](../done/qa-r54-findings.md)
- [qa-r53-scorecard](../brainstorm/qa-r53-scorecard.md)
- [qa-r53-findings](../done/qa-r53-findings.md)
- [qa-r52-scorecard](../brainstorm/qa-r52-scorecard.md)
- [qa-r52-findings](../done/qa-r52-findings.md)
- [qa-r51-scorecard](../brainstorm/qa-r51-scorecard.md)
- [qa-r51-findings](../done/qa-r51-findings.md)
- [qa-r50-scorecard](../brainstorm/qa-r50-scorecard.md)
- [qa-r50-findings](../done/qa-r50-findings.md)
- [qa-r49-scorecard](../brainstorm/qa-r49-scorecard.md)
- [qa-r49-findings](../brainstorm/qa-r49-findings.md)
- [qa-r48-scorecard](../brainstorm/qa-r48-scorecard.md)
- [qa-r48-findings](../brainstorm/qa-r48-findings.md)
- [qa-r47-scorecard](../brainstorm/qa-r47-scorecard.md)
- [qa-r47-findings](../brainstorm/qa-r47-findings.md)
- [qa-r46-scorecard](../brainstorm/qa-r46-scorecard.md)
- [qa-r46-findings](../brainstorm/qa-r46-findings.md)
- [qa-r45-scorecard](../brainstorm/qa-r45-scorecard.md)
- [qa-r45-findings](../done/qa-r45-findings.md)
- [qa-r44-scorecard](../brainstorm/qa-r44-scorecard.md)
- [qa-r44-findings](../done/qa-r44-findings.md)
- [qa-r43-scorecard](../brainstorm/qa-r43-scorecard.md)
- [qa-r43-findings](../done/qa-r43-findings.md)
- [qa-r42-scorecard](../brainstorm/qa-r42-scorecard.md)
- [qa-r42-findings](../done/qa-r42-findings.md)
- [qa-r41-scorecard](../brainstorm/qa-r41-scorecard.md)
- [qa-r40-scorecard](../brainstorm/qa-r40-scorecard.md)
- [qa-r39-scorecard](../brainstorm/qa-r39-scorecard.md)
- [qa-r38-scorecard](../brainstorm/qa-r38-scorecard.md)
- [qa-r37-scorecard](../brainstorm/qa-r37-scorecard.md)
- [qa-r36-scorecard](../brainstorm/qa-r36-scorecard.md)
- [qa-r35-scorecard](../brainstorm/qa-r35-scorecard.md)
- [qa-r34-scorecard](../brainstorm/qa-r34-scorecard.md)
- [qa-r33-scorecard](../brainstorm/qa-r33-scorecard.md)
- [qa-r32-scorecard](../brainstorm/qa-r32-scorecard.md)
- [qa-r31-scorecard](../brainstorm/qa-r31-scorecard.md)
- [qa-r30-scorecard](../brainstorm/qa-r30-scorecard.md)
- [qa-r29-scorecard](../brainstorm/qa-r29-scorecard.md)
- [qa-r28-scorecard](../brainstorm/qa-r28-scorecard.md)
- [qa-r27-scorecard](../brainstorm/qa-r27-scorecard.md)
- [qa-r26-scorecard](../brainstorm/qa-r26-scorecard.md)
- [qa-r25-scorecard](../brainstorm/qa-r25-scorecard.md)
- [qa-r24-scorecard](../brainstorm/qa-r24-scorecard.md)
- [qa-r23-scorecard](../brainstorm/qa-r23-scorecard.md)
- [qa-r22-scorecard](../brainstorm/qa-r22-scorecard.md)
- [qa-r21-scorecard](../brainstorm/qa-r21-scorecard.md)
- [qa-r20-scorecard](../brainstorm/qa-r20-scorecard.md)
- [qa-r19-scorecard](../brainstorm/qa-r19-scorecard.md)
- [qa-r18-scorecard](../brainstorm/qa-r18-scorecard.md)
- [qa-r17-scorecard](../brainstorm/qa-r17-scorecard.md)
- [qa-r16-scorecard](../brainstorm/qa-r16-scorecard.md)
- [qa-r15-scorecard](../done/qa-r15-scorecard.md)
- [qa-r14-scorecard](../done/qa-r14-scorecard.md)
- [qa-r13-scorecard](../done/qa-r13-scorecard.md)
- [qa-r12-scorecard-and-status](../done/qa-r12-scorecard-and-status.md)
- [qa-r11-scorecard-and-status](../done/qa-r11-scorecard-and-status.md)
- [qa-r10-scorecard-and-status](../done/qa-r10-scorecard-and-status.md)
- [qa-r9-scorecard-and-status](../done/qa-r9-scorecard-and-status.md)
- [qa-r8-scorecard-and-status](../done/qa-r8-scorecard-and-status.md)
- [qa-r7-scorecard-and-open-regressions](../done/qa-r7-scorecard-and-open-regressions.md)

## Filed 2026-11-17 (round-note filing and cross-listing)

Added so every brainstorm idea sits in an epic. Members stay in their own folder; cross-listed ideas also appear in another epic.

- [e2e-webserver-health](../done/e2e-webserver-health.md): E2E webServer health: a dead preview must not cascade into hundreds of failures
- [short-and-long-gate](../in-progress/short-and-long-gate.md): Short gate on every merge, long gate once a day
- [qa-r86-findings](../brainstorm/qa-r86-findings.md): QA r86 findings
- [qa-r86-scorecard](../brainstorm/qa-r86-scorecard.md): QA r86 scorecard
- [qa-r87-findings](../brainstorm/qa-r87-findings.md): QA r87 findings
- [qa-r87-scorecard](../brainstorm/qa-r87-scorecard.md): QA r87 scorecard
- [qa-r88-findings](../brainstorm/qa-r88-findings.md): QA r88 findings
- [qa-r88-scorecard](../brainstorm/qa-r88-scorecard.md): QA r88 scorecard
- [qa-r89-findings](../brainstorm/qa-r89-findings.md): QA r89 findings
- [qa-r89-scorecard](../brainstorm/qa-r89-scorecard.md): QA r89 scorecard
- [qa-r90-findings](../brainstorm/qa-r90-findings.md): QA r90 findings (main 53099fee)
- [qa-r90-scorecard](../brainstorm/qa-r90-scorecard.md): QA r90 scorecard (main 53099fee)
- [qa-r91-findings](../brainstorm/qa-r91-findings.md): QA r91 findings (main fbc2085d)
- [qa-r91-scorecard](../brainstorm/qa-r91-scorecard.md): QA r91 scorecard (main fbc2085d)
- [qa-r92-findings](../brainstorm/qa-r92-findings.md): QA r92 findings (main ea6fe5b7)
- [qa-r92-scorecard](../brainstorm/qa-r92-scorecard.md): QA r92 scorecard (main ea6fe5b7)
- [qa-r93-findings](../brainstorm/qa-r93-findings.md): QA r93 findings (main 2eca0a0e)
- [qa-r93-scorecard](../brainstorm/qa-r93-scorecard.md): QA r93 scorecard (main 2eca0a0e)
- [qa-r94-findings](../brainstorm/qa-r94-findings.md): QA r94 findings (main b36370b2)
- [qa-r94-scorecard](../brainstorm/qa-r94-scorecard.md): QA r94 scorecard (main b36370b2)
- [qa-r95-findings](../brainstorm/qa-r95-findings.md): QA r95 findings (main 5d3b0227)
- [qa-r95-scorecard](../brainstorm/qa-r95-scorecard.md): QA r95 scorecard (main 5d3b0227)
- [qa-r96-findings](../brainstorm/qa-r96-findings.md): QA r96 findings (main f0828a8a)
- [qa-r96-scorecard](../brainstorm/qa-r96-scorecard.md): QA r96 scorecard (main f0828a8a)
- [qa-r97-findings](../brainstorm/qa-r97-findings.md): QA r97 findings (main 7c500bc5)
- [qa-r97-scorecard](../brainstorm/qa-r97-scorecard.md): QA r97 scorecard (main 7c500bc5)
- [qa-r98-findings](../brainstorm/qa-r98-findings.md): QA r98 findings
- [qa-r98-scorecard](../brainstorm/qa-r98-scorecard.md): QA r98 scorecard
- [qa-r99-findings](../brainstorm/qa-r99-findings.md): QA round 99 findings
- [qa-r99-scorecard](../brainstorm/qa-r99-scorecard.md): QA round 99 scorecard
- [qa-r100-findings](../done/qa-r100-findings.md): QA round 100 findings
- [qa-r100-scorecard](../done/qa-r100-scorecard.md): QA round 100 scorecard
- [qa-r101-findings](../done/qa-r101-findings.md): QA r101 findings
- [qa-r101-scorecard](../done/qa-r101-scorecard.md): QA r101 scorecard (headless Chromium, SwiftShader, 1280x720, 390x844, 360x640)
- [qa-r102-findings](../done/qa-r102-findings.md): QA r102 findings
- [qa-r102-scorecard](../done/qa-r102-scorecard.md): QA r102 scorecard (headless Chromium, SwiftShader, 1280x720, 390x844, 844x390, 360x640)
- [qa-r103-findings](../done/qa-r103-findings.md): QA r103 findings
- [qa-r103-scorecard](../done/qa-r103-scorecard.md): QA r103 scorecard (headless Chromium, SwiftShader, 1280x720, 844x390, 390x844)
- [qa-r104-findings](../done/qa-r104-findings.md): QA r104 findings
- [qa-r104-scorecard](../done/qa-r104-scorecard.md): QA r104 scorecard (headless Chromium, SwiftShader, 1280x720, 844x390, 390x844)
- [qa-r105-findings](../done/qa-r105-findings.md): QA r105 findings
- [qa-r105-scorecard](../done/qa-r105-scorecard.md): QA r105 scorecard (headless Chromium, SwiftShader, 1280x720, 844x390, 390x844)
- [qa-r106-findings](../done/qa-r106-findings.md): QA r106 findings
- [qa-r106-scorecard](../done/qa-r106-scorecard.md): QA r106 scorecard (headless Chromium, SwiftShader, 390x844, 667x375, 844x390, 1920x1080)
- [qa-r107-findings](../done/qa-r107-findings.md): QA r107 findings
- [qa-r107-scorecard](../done/qa-r107-scorecard.md): QA r107 scorecard

## Bundles (2026-11-17)

Groups of ideas that touch the same files, so one agent can take the whole bundle. Flags: SIM = sim-changing (needs an Opus plan, a SIM_VERSION bump and a golden re-record with a stated reason, one sim bundle at a time); OWNER-GATED = wait for the owner; PC = heavy generation, balance or e2e work can run on the GPU PC; needs browser/e2e = run Playwright (headless) before calling it done.

Rounds r86 to r99 are history: their open items were fixed or repeated in r100 to r107, so they are indexed, not bundled.

### TQ-1 Verification gaps

- Members: [verify-firefox-playwright-launch-macos](../brainstorm/verify-firefox-playwright-launch-macos.md), [verify-itch-size-budget](../brainstorm/verify-itch-size-budget.md), [qa-r36-r35-recheck](../brainstorm/qa-r36-r35-recheck.md), [qa-r38-desktop-notes](../brainstorm/qa-r38-desktop-notes.md)
- Size: S
- Shared files: tools/ci/size-budget.json, playwright.config.ts, tools/itch/*
- Flags: PC-offloadable (Firefox and WebKit run on the PC), needs browser
- Parallel: Tools lane: never with OR-2 or AU-1 (size-budget.json).

### TQ-2 Triage of open items, r103 to r107

- Members: [qa-r103-findings](../done/qa-r103-findings.md), [qa-r104-findings](../done/qa-r104-findings.md), [qa-r105-findings](../done/qa-r105-findings.md), [qa-r106-findings](../done/qa-r106-findings.md), [qa-r107-findings](../done/qa-r107-findings.md)
- Size: S
- Shared files: ideas/ only (new idea files for anything not yet filed)
- Flags: docs only, no browser
- Parallel: Parallel with everything.

### TQ-3 Triage of r100 to r102

- Members: [qa-r100-findings](../done/qa-r100-findings.md), [qa-r100-scorecard](../done/qa-r100-scorecard.md), [qa-r101-findings](../done/qa-r101-findings.md), [qa-r101-scorecard](../done/qa-r101-scorecard.md), [qa-r102-findings](../done/qa-r102-findings.md), [qa-r102-scorecard](../done/qa-r102-scorecard.md)
- Size: S
- Shared files: ideas/ only
- Flags: docs only, no browser
- Parallel: Parallel with everything; run before TQ-2 if both are wanted.
