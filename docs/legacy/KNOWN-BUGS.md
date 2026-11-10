# Known legacy bugs

Policy: see [ADR-0015](../adr/0015-known-legacy-bugs-policy.md). Paths are relative to `war/WEB-INF/private/src/`. Line numbers are at the time of writing and approximate. The characterization-test and new-test columns are filled in by WP-h-known-bugs and the porting WPs; "TBD" means not written yet.

| Slug | Description | Legacy file:line | Characterization test | New test | Fix WP |
|---|---|---|---|---|---|
| `pause-vs-date` | Cooldowns use wall-clock `new Date()`, so they keep elapsing while `Crafty.pause()` is active | `baseCharacter.js:179`, `abilities.js:236`, `actionbar.js:216` (and similar) | TBD (known-bugs.characterization) | plain `it` (fixed by construction, sim ticks) | by construction |
| `death-in-hud` | Death is triggered from the HUD refresh (`die()`), so `isDead` is not set until `topHUD.refresh` runs | `topHUD.js:215`, `topHUD.js:272` | TBD | plain `it` (fixed by construction) | by construction |
| `capture-ignores-fade` | `Capture` can succeed against a target that is faded | `abilities.js:1`, `abilities.js:29` | TBD | `it.fails` | TBD |
| `vines-stacking` | Two Entangling Vines hits stack the freeze and the first expiry does not unfreeze correctly. Exact behaviour to be recorded by the characterization test | `abilities.js:1229` to `abilities.js:1290` | TBD | `it.fails` | TBD |
| `router-main-hash` | The hash router calls `main[funcName]()` for any hash, so `#exit`, `#gameMaster`, `#newGame` invoke methods directly and `#constructor` throws | `main.js:79` | TBD | plain `it` (explicit route table) | by construction (ADR-0012) |
| `garrison-sort-ignored` | The `garrisonSortOrder` setting is saved but never applied to the garrison list | `gamePersist.js:18`, `garrison.js` | TBD | `it.fails` | TBD |
| `garrison-max-size-unenforced` | `Garrison.MAX_SIZE` (10) is displayed but never enforced, so an 11th capture is accepted | `garrison.js:9`, `main.js:29` | TBD | `it.fails` | TBD |
| `bounds-y-typo` | `resetIfOutOfBounds` reads `this.Y` (typo), so x is restored but y is never restored | `baseCharacter.js:131`, `baseCharacter.js:150` | TBD | `it.fails` | TBD |
| `damage-uses-target-mult` | `applyDamage` multiplies by `this.targetPlayer.damageMultiplier` (the defender's current target) instead of the actual hitter, which is wrong after swaps | `baseCharacter.js:50` | TBD | `it.fails` | TBD |
| `prod-cheats` | Shift-Q (I win), Shift-X (freeze) and Shift-C (capture win) are live in production | `input.js:10` to `input.js:12` | TBD | plain `it` (cheats DEV-only) | by construction |
| `rest-heal-once` | Benched characters heal one 0.5% tick, not every second: `HealWithRest` uses `delay(fn, 1000, -1)` and Crafty's `Delay` runs a non-positive repeat once | `delay.js:11` + `crafty.js:11526-11535` | `abilities-effects.characterization` | rest healing every second to the cap | tick-based timers (WP sim) |

Related, not yet tracked as bugs: `Math.random` is used for opponent picks and GUIDs (`components.js:124`, `baseCharacter.js:992`, `baseCharacter.js:1008`); the port replaces it with seeded RNG streams (ADR-0003).
