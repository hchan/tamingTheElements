# Legacy inventory

Map of the legacy game. Source files are under `war/WEB-INF/private/` and are loaded by `index.html` as plain scripts in a fixed order (jQuery, `lib/crafty.js`, `lib/SpriteColor.js`, then `src/*.js`), sharing globals. "New home" is the planned destination from the migration plan; those paths do not exist yet. Known bugs are tracked in [KNOWN-BUGS.md](KNOWN-BUGS.md).

## `src/*.js` (24 scripts)

| File | Purpose | Key globals | New home |
|---|---|---|---|
| `input.js` | Key bindings (action name to key combos) and matcher, incl. the Shift-Q/X/C cheats | `Input` | `src/game/input/key-map.ts` (cheats DEV-only) |
| `helper.js` | Utility grab-bag: asset loading, ability component factory, text/description helpers, progression math, random picks | `GameHelper`, `assetsLoaded` | `rules/describe.ts`, `rules/progression.ts`, `game/assets`, `rng/` |
| `HUDHelper.js` | `Slot` type used by the action bar and HUD | `Slot` | `src/game/hud/*` |
| `global.js` | Shared constants (speeds, sound flag) | `Global` | `src/core/data/settings.ts`, `rules/damage.ts` |
| `imgAssets.js` | Generated sprite sheet manifest | `Global.imgAssets` | `src/game/assets/manifest.generated.json` |
| `imgMapAssets.js` | Generated map image manifest | `Global.imgMapAssets` | `src/game/assets/manifest.generated.json` |
| `imgBackgroundAssets.js` | Generated background manifest | `Global.imgBackgroundAssets` | `src/game/assets/manifest.generated.json` |
| `sndAssets.js` | Generated sound manifest | `Global.sndAssets` | `src/game/assets/manifest.generated.json` |
| `settings.js` | Settings defaults, enums and radio-button helpers (values written from jQuery, so can be strings) | `Settings` | `src/core/data/settings.ts` + `src/ui/screens/settings.ts` |
| `gamePersist.js` | Save/load/clear game state in `localStorage` | `GamePersist` | `src/core/save/*` + `src/game/platform/storage/*` |
| `garrison.js` | Player roster: max size, sorting, opponent selection, XP/level and chapter objectives, garrison screen | `Garrison` | `src/core/rules/{progression,objectives,garrison,opponents}.ts` + `src/ui/screens/garrison.ts` |
| `gameMaster.js` | Developer tool to set up arbitrary game state | `GameMaster` | `src/ui/screens/game-master.ts` (DEV only) |
| `game.js` | Game definition, dimensions and the Game scene hookup | `Game` | `src/game/app/*` |
| `delay.js` | `HealWithRest` component healing benched characters | Crafty component | `src/core/sim/systems/rest.ts` |
| `components.js` | Shared Crafty components: bullets, melee, alerts and effects | Crafty components | `sim/systems/projectile.ts`, `game/views/*`, `ui` alerts |
| `swap.js` | Teammate swap and swap cooldown logic | `Swap` | `src/core/sim/systems/swap.ts` |
| `topHUD.js` | Top HUD bars, health refresh (also triggers death) | `TopHUD`, Crafty component | `src/game/hud/*` |
| `actionbar.js` | Bottom action bar: ability slots, cooldown display, capture and swap buttons | `ActionBar` | `src/game/hud/*` |
| `baseCharacter.js` | The character entity: movement, damage, abilities, death, bounds, input and AI hooks | Crafty component | `sim/systems/{movement,health,...}.ts`, `agents/scripted-ai/*`, `game/input/*` |
| `characters.js` | The 12 race definitions and their abilities and stats | race tables | `src/core/data/characters.ts` |
| `abilities.js` | All primary and secondary abilities (projectiles, melee, buffs, heals, Fade, Capture, Entangling Vines, ...) | `GameHelper.createAbilityComponent` calls | `src/core/data/abilities-{a,b}.ts` + `sim/systems/*` |
| `scenes.js` | Scenes: Game, Victory, YouJustDied, Loading plus four story scenes | `Crafty.scene` | `game/scenes/Arena.ts`, `ui/screens/results.ts`, `rules/results.ts`, `src/game/cinematics/scripts/*` |
| `chaoticFire.js` | Canvas fire effect used on the portal screen | `ChaoticFire` | `src/ui/screens/portal-fx.ts` |
| `main.js` | Menu controller, hash router, screens and wiring | `Main` | `src/game/app/*`, `src/ui/router.ts`, `src/ui/screens/*` |

## Other legacy files

| Path | Purpose | New home |
|---|---|---|
| `war/WEB-INF/private/index.html` | Menus markup and script loader | `index.html` + `src/ui/screens/*` |
| `war/WEB-INF/private/css/main.scss`, `main.css` | Styles | `src/ui/styles/main.css` |
| `war/WEB-INF/private/lib/crafty.js` | Vendored Crafty engine | none (Phaser) |
| `war/WEB-INF/private/lib/SpriteColor.js` | Crafty sprite tint plugin | `src/game/views` tint |
| `war/WEB-INF/private/bower_components/jquery/` | Vendored jQuery | none |
| `war/WEB-INF/private/img/`, `snd/` | Sprites, map and background images, ogg sound | `public/assets/{atlases,backgrounds,audio}` |
| `war/WEB-INF/{appengine-web.xml,web.xml,jsp/,lib/}` | GAE wrapper | none (retired) |
| `war/home.html`, `war/todo.html` | Landing page and to-do list | `docs/legacy/home.md`, `docs/legacy/TODO-legacy.md` |
| `war/favicon.ico`, `war/favicon.png` | Icons | `public/favicon.png` |
| `tools/*.pl` | Perl asset manifest generators (retired in R6) | `tools/assets/*.ts` |
| `imgWorkArea/` | Art sources (PNG, xcf) | `art/png/**`, `art/src/**` (LFS) |
| `visio/elementalBalanceEquation.*` | Balance diagram | `art/diagrams/` |
| `Gruntfile.js`, `gulpfile.js`, `node-webkit.package.json` | Build and NW.js packaging | none (retired) |
| `package.json` | Legacy package manifest | rewritten for pnpm/TS |
| `.classpath`, `.project`, `.settings/` | Eclipse files | none (retired) |
| `node_modules/`, `.svn/`, `war/WEB-INF/private/css/.sass-cache/` | Vendored and generated leftovers | none (retired) |

The GAE credentials file under `war/WEB-INF/` is intentionally not described or read; it is slated for removal and rotation.
