---
status: idea
added: 2026-11-26
---

# Wispera victory still: re-key the grey halo; recapture KO stills at full opacity

Art-director in-game check (2026-11-26) of the merged original-hero stills (merge of d32c3b7a): curomo (victory + KO), ishimi, sindarosa (victory), morblass APPROVE; the sindarosa KO and curomo KO nudge are provisional because the screenshots were taken during the 400 ms fade-in.

Wispera victory REVISE: the keyed still keeps a flat grey disc (~25-30% of the radius) behind the plasma ball and lightning, reading as pasted and muddy on the dark card. Fix inside our own keying tool (`tools/assets/victory-gen/victory-key.py`, wispera entry; source `provenance/wispera_win.png`, approval `vic-warp2/approval.json`; no new art generation, no GPU): key out low-saturation (S < 0.15), mid-luminance (L ~90-150) pixels, keep the bright core and the blue/white lightning; alpha matte threshold ~0.35, erode 3 px, feather 1.5 px; alternatively multiply alpha by 0.25 outside 0.8 of the ball radius, so the result is a faint blue-white glow, not an opaque grey cloud; the storm cloud survives only as dark blue wisps inside the lightning; if a clean key is impossible, ship with a radial alpha falloff. Do NOT brighten the core (earlier director note). Update the sha pin in `tests/repo/victory-frames.test.ts`, re-run the keying script, new real-game screenshot, art-director re-check.

Also: recapture the sindarosa and curomo KO stills at full opacity (wait ~500 ms after the fade in `tests/e2e/victory-still.spec.ts`) and send them to the art-director; the curomo 6 px nudge stays unless more than 3 px of float shows.
Layout note (not art): wispera and curomo victory stills sit inside the yellow-glow card and look slightly "framed" next to fiara; optional card polish.

## Progress note (2026-11-26)
- Part 1 done: `key_wispera` in `tools/assets/victory-gen/victory-key.py` (S < 0.15 and L 90-150 keyed, matte 0.35, erode 3 px, feather 1.5 px, dark cloud outside 0.8 ball radius x0.25, ball interior forced opaque so the rust speck leaves no hole; core not brightened). Only `wispera_victory.png` changed; pin updated. Before/after sheet: `.scratch/wispera-rekey/sheet.png` (worktree-local).
- Part 2 done: `tests/e2e/victory-still.spec.ts` waits for opacity 1 and finished animations before the screenshot; PC run, 5 passed; stills in `.scratch/originals-stills/` (curomo-ko, curomo-victory, sindarosa-ko, wispera-victory).
- Open: art-director re-check of wispera victory, sindarosa KO and curomo KO nudge. Status stays idea until then.
