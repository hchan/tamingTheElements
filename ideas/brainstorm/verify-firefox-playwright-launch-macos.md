---
status: idea
added: 2026-11-13
---
# Firefox cross-browser golden replay cannot launch on this Mac

`pnpm test:browser` (docs/DETERMINISM.md, cross-browser goldens): Chromium and WebKit pass (24 tests), Firefox (playwright firefox-1572,
Firefox 159) exits with "Could not find profile folder" at launch, even with TMPDIR under ~/claudetmp and with the sandbox off. The binary
itself runs (`--version` works). So the Firefox golden check is unverified locally; try a newer Playwright firefox build or
`PLAYWRIGHT_FIREFOX_...` profile workaround, or run it in CI only. Note that `pnpm test:browser` exits 1 because of this.

## Findings (2026-11-14, headless attempts, all failed)

Host: macOS 27.2.1, Playwright 1.65.0. The failure is not a Playwright or profile-path problem:

- `playwright install --force firefox` (firefox-1572, Firefox 159): same error.
- Newest build via `playwright@next` into a scratch `PLAYWRIGHT_BROWSERS_PATH` (firefox-1578): same error.
- Sandbox disabled, `TMPDIR` under `~/claudetmp`, `HOME` redirected, app bundle copied out of `~/Library/Caches`: same error.
- Running the binary by hand with an existing empty profile dir (`-profile`, `--profile`, `MOZ_HEADLESS=1`, `-CreateProfile`,
  `-P`) prints "Could not find profile folder." every time, so it fails inside Firefox startup before Juggler, for any path.
- The bundle fails `codesign -v` ("code has no resources but signature indicates they must be present"); probably unrelated, as Chromium and
  WebKit run fine.

Most likely a Firefox-on-macOS-27 incompatibility in the headless profile lookup. Not fixable from config; options: run the Firefox
golden check in CI only (Linux), or retry after a newer Playwright/Firefox build. Left as `status: idea`.
