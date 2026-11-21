---
status: done
triaged: superseded (portrait/touch dropped; rest fixed or tracked)
added: 2026-11-17
---

# QA r94 findings (main b36370b2)

Scores are in [qa-r94-scorecard.md](qa-r94-scorecard.md). No code changed. Screenshots under `.scratch/shots/` (gitignored, in the QA worktree).

## Fixes verified (changes since r93)

- Help chips: all jump chips share one pill style (same height, border, fill) at 390 and 360; they wrap in rows with uneven width but no longer mix styles (`m390-help.png`, `m360-help.png`).
- Versus "Options" strip on portrait phones: present at 390x844 and 360x640 as `#arcadeOptsJump`, text "Options: Computer, 1v1, Normal, Random" with a down caret; absent at 1280x720 (`m390-versus.png`, `m360-versus.png`, `d-versus.png`). Tapping scrolls the Options block into view (`m390-versus-afteroptions.png`). First hero card is still inside the first viewport (e2e `versus-portrait-grid` passes at both sizes).
- Play slot label on one line: "Hero 1 (lead)" / "Hero 2" / "Hero 3" each on one line at 390 (`m390-play.png`).
- Match end: "Rounds N-N" now appears once (chip only); the summary sentence no longer repeats it (`match-end-win-390.png`, `match-end-lose-1280.png`).
- No console or page errors across menu, Help, Versus, Play, Settings, four stages, super, 2v2 with a tag swap, Tour and the phone runs.
- No Classic, Arcade, ruleset or Capture wording in the menu, Help, Versus, Play or Settings text seen.

## Ranked findings

P2. Phone portrait entry: the full-screen "Rotate your device to landscape" overlay covers the arena on first entry at 390x844 (isMobile); the player must find "Play anyway" (`m390-fight-0.png`). Carried from r93 P2. Repro: Versus, Fight! at 390x844 with isMobile.

P3. Versus Options strip at 390: while sticky it overlays scrolled content with no solid backing; after tapping, a line of the fighter card ("... Ranged") shows through a gap between the "Versus" title and the strip, and the strip keeps saying "Options: ..." while the player is already on the options (`m390-versus-afteroptions.png`). It also takes two lines of text at 390 and wraps to a long sentence. Repro: Versus at 390x844, tap Options.

P3. Versus Options strip is an unmarked full-width box: no `aria-expanded` and no change of state after the jump, so it neither reads as a button to sighted players nor reports state to a screen reader (checked `aria-expanded` is null).

P3. Play at 390: the lead hero tile's name "Sindarosa" fills the tile edge to edge and touches the right border; the round remove (X) buttons overlap each tile's top-right corner and hide part of the hero art (`m390-play.png`).

P3. Help at 390: chips wrap into rows of 2, 1, 2, 3 and 2 with ragged right edges; works, but looks unplanned. A fixed 2-column grid would read more tidily (`m390-help.png`).

P3. Match-end screens: win and loss still share one layout and differ only in word and tint; at 1280 the foe portrait is a small upscaled sprite (`match-end-lose-1280.png`); at 390 the lower half is empty backdrop (`match-end-win-390.png`). Carried from r93.

P3. 2v2 on phone: the HUD team strip, TAG slot, ability bar and two touch buttons stack tight; the bench portraits sit under the centre round counter (`m390-tag-a.png`). Readable but busy.

P3. Super cut-in is still a banner versus an MvC full-screen slam; portrait arena keeps its empty sky band above the stage (both carried; `d-super-a.png`, `m390-fight-2.png`).

P3. The first-run "FIRST BLOOD" card on phone sits mid-screen as a large box over the sky and stays until "Got it" (`m390-fight-2.png`); it hides the HUD-to-arena gap but looks heavy.

Test notes: draw was not re-shot this round (needs a double KO in sudden death); the `match-end` spec covers win and loss only.

## Triage 2026-11-21 (code-checked)

Fixed (this round): Help chips, Versus Options strip, Play label, Rounds text. Dropped (phone/portrait/touch): rotate overlay, Options strip overlay and aria-expanded (r97 verified), Play tile at 390, 2v2 phone HUD, first-run card on phone, sky band. Design, tracked: match-end polish (`ideas/done/qa-r107-findings.md`) and super cut-in banner (`ideas/brainstorm/sf-super-cinematics.md`).
Open: none.
