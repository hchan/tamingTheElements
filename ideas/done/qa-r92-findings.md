---
status: done
triaged: superseded (portrait/touch dropped; rest fixed or tracked)
added: 2026-11-17
---

# QA r92 findings (main ea6fe5b7)

Scores are in [qa-r92-scorecard.md](qa-r92-scorecard.md). No code changed.

## Fixes verified

- Versus match-end victory screen: portrait, name, result word, stat chip and full-width Rematch render on desktop, 390 and 360 for win, loss and draw. `*-end-win.png`, `*-end-loss.png`, `*-end-draw.png`.
- First-run card vs super banner (portrait phone): "HELLFIRE LANCE / FIRE" is fully readable at 360 and 390 (`p360-super-4.png`, `p390-super-10.png`); the card yields and returns afterwards.
- Help jump chips wrap at 360 and 390 with nothing clipped; Versus "More below" tab clears the footer (`p360-help.png`, `p390-help.png`, `p360-versus-bottom.png`, `p390-versus-bottom.png`).
- Whole hero names in the portrait HUD at both phone widths (`p390-fight-Fire-b.png`, `p360-fight-Air-a.png`).

## e2e subset (1 worker, E2E_PORT 7951)

match-end, first-run-hint-portrait, arcade-tag, round-result, versus-stage-pick: 22 passed, 2 failed. Both failures are in `tests/e2e/arcade-tag.spec.ts` (lines 145 and 198, 2v2 and 3v3): the selector `#arcadeResults p` is now ambiguous (strict mode) because the new victory screen has two `<p>` (`.matchEndName` and `.matchEndSummary`). Stale test selector from the victory-screen change, not a game bug.

## Ranked findings

P1. Test regression: arcade-tag 2v2 and 3v3 fail on the ambiguous `#arcadeResults p`. Idea: use `#arcadeResults .matchEndSummary`.

P2. Result word is low contrast and muddy over the backdrop on win, loss and draw; the biggest word on the screen is the hardest to read. `d-end-win.png`.

P2. Loss screen headlines the winner with a low-res, upscaled portrait; the player's own result is secondary. `d-end-loss.png`.

P2. Draw has no portrait, so it feels unfinished next to win and loss. `d-end-draw.png`.

P3. Match-end backdrop reuses the menu dragon art; the long name wraps at 390; "Rounds" appears twice (chip and summary).

P3. First-run "FIRST BLOOD" card sits over the arena on desktop and reappears after a super on 390 (`p390-tag-6.png`).

P3. Help chip styling and alignment inconsistent between chips.

P3. Online is a technical copy-paste host-code flow (step 2/3) with no friendly framing. `p360-online.png`.

P3. Portrait arena still has a large empty sky band above small fighters (carried from r91). `p390-fight-Fire-b.png`.

P3. Super cut-in is still a thin banner versus MvC full-screen portrait slam (carried).

## Triage 2026-11-21 (code-checked)

Fixed: arcade-tag selector (`tests/e2e/arcade-tag.spec.ts:145,208` now use `.matchEndSummary`), result word contrast and loss/draw portraits (r93), duplicate Rounds text (r94), first-run card (r93), Help chips (r94). Dropped (phone/portrait): sky band, Online copy at 360, 390 wrapping. Design, tracked: super cut-in banner (`ideas/brainstorm/sf-super-cinematics.md`); later match-end polish is in `ideas/done/qa-r107-findings.md`.
Open: none.
