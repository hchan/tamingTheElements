# QA r124 scorecard

status: idea
added: 2026-11-19

Build: main at da78a9da, headless Chromium with SwiftShader, 1280x720. Stepped play for stage sweeps and Tour stage 2, live keyboard for the 2v2 (tag, super, loss to results).
Screenshots: `.scratch/qa-r124/`, copied to `~/claudetmp/qa-r124/`.
Console errors across all runs: none.
Smoke: `e2e ran on: PC (job 20261119-163854-short-c3bcef, short lane) -> exit 1`. 14 passed, 1 failed (`online-versus.spec.ts:31`, two players connect with pasted codes, `expect(...).toBeGreaterThan` failed). An earlier PC job (20261119-163540-short-991294) was lost (rc 93, no results.json) and was retried by the router. The failure was not re-run elsewhere; it may be flake or a real regression and needs a re-check.

## Covered

Menu (`01`), Versus picker 1v1 and 2v2 (`02`, `04`), 1v1 on four stages (`10-1v1-*`), live 2v2 (`50`), tag (`51`), super (`52`), results (`54`), Tour pick, card 1, fight 1 (`70` to `73`), Tour card 2 and fight (`76` to `78`), Help (`80`), Settings (`81`), Key Bindings (`82`, `83`).

## Scores (0-5, vs Street Fighter / MvC)

| Area | Fun | Graphics | Readability | Note |
|---|---|---|---|---|
| Menu | n/a | 4 | 5 | Clear five entries, strong key art |
| 1v1 arenas | 3 | 4 | 4 | Four distinct stages and a clean ability bar; no visible hit weight; earth stage flattest |
| Tag / super | 4 | 4 | 3 | Tag and Titan Slam read well; cut-in still sits over status chips and combo text |
| 2v2 and results | 3 | 4 | 4 | Results clear with Rematch focused; portrait sizes mismatched |
| Tour (stages 1-2) | 3 | 4 | 4 | Cards are good; no per-hero life on the card; stage 2 opens with full team HUD |
| Menus, Help, Settings, Key Bindings | n/a | 3 | 3 | Help chips ragged; Key Bindings opens scrolled from Settings; touch block first on desktop |

## r123 items still open

Help chip layout, picker "More below" chip, Key Bindings scroll from Settings, super cut-in over chips, no hit-stop. See `qa-r124-findings.md`.
