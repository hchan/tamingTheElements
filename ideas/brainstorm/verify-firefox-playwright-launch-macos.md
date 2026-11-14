---
status: idea
added: 2026-11-13
---
# Firefox cross-browser golden replay cannot launch on this Mac

`pnpm test:browser` (docs/DETERMINISM.md, cross-browser goldens): Chromium and WebKit pass (24 tests), Firefox (playwright firefox-1572,
Firefox 159) exits with "Could not find profile folder" at launch, even with TMPDIR under ~/claudetmp and with the sandbox off. The binary
itself runs (`--version` works). So the Firefox golden check is unverified locally; try a newer Playwright firefox build or
`PLAYWRIGHT_FIREFOX_...` profile workaround, or run it in CI only. Note that `pnpm test:browser` exits 1 because of this.
