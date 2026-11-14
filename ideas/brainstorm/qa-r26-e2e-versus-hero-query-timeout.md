---
status: idea
added: 2026-11-14
---

# QA r26: versus-hero-pick "?hero=&foe=" e2e fails twice under SwiftShader (canvas not visible in 30 s)

Repro: `E2E_PORT=7935 corepack pnpm e2e tests/e2e/versus-hero-pick.spec.ts`. Test 3 (`hero=fiara&foe=treenoc`) times out at `page.locator('#game canvas').waitFor()` (30 s); tests 1-2 pass. The rest of the subset (a11y, pause-menu, settings-sections, arcade-tag) passed: 18 of 19 overall.

Manual fight loads took up to 60 s in my runs, so this is likely a slow-load timeout, not a logic bug.

Suggest a 60 s waitFor timeout, or a lighter boot path for the hero query.
