# Deployment

| Target | URL | Trigger | `VITE_BASE` |
|---|---|---|---|
| Local | `http://localhost:5173` (dev), `:4173` (preview) | manual | `/` (default) |
| GitHub Pages | `https://hchan.github.io/tamingTheElements/` | push to `main`, after `check` and `e2e` pass | `/tamingTheElements/` |
| itch.io | HTML5 upload (zip) | `v*` tag or manual dispatch (`.github/workflows/itch.yml`) | `./` |

## Build config and version stamp

- `vite.config.ts` reads `VITE_BASE` (default `/`). The UI uses a hash router, so no server rewrite or `404.html` is needed
  on any target.
- The menu footer shows `v<package.json version> (<short git sha>)`. `vite.config.ts` injects it as
  `import.meta.env.VITE_APP_VERSION` / `VITE_APP_COMMIT`; the sha falls back to `GITHUB_SHA`, then `unknown`. CI checks out
  with `fetch-depth: 0` for the Pages build. Quote the stamp in bug reports.

## Local

```sh
corepack pnpm dev                      # HMR on 5173
corepack pnpm build && corepack pnpm preview   # production build on 4173
corepack pnpm e2e:pages                # build with VITE_BASE=/tamingTheElements/, serve under that subpath, check the menu
```

## GitHub Pages

Workflow: `.github/workflows/ci.yml`.

- Pull requests run `check`, `e2e` (including `e2e:pages`) and `browser` only. They never deploy.
- A push to `main` additionally runs `pages-build` and `deploy`, which `needs` both `check` and `e2e`.
- Only the `deploy` job has `pages: write` and `id-token: write`; the workflow default is `contents: read`.
- `deploy` uses concurrency group `pages` with `cancel-in-progress: false`, so a deploy is never cut off.
- Action versions are pinned to commit SHAs (verified with `env -u GITHUB_TOKEN gh api repos/<owner>/<repo>/git/ref/tags/<tag>`).
- No service worker or PWA scope yet.

One-time setup (the repo owner does this, not the workflow): Settings > Pages > Source = "GitHub Actions". Until then the
`deploy` job fails harmlessly.

## itch.io

```sh
corepack pnpm build:itch   # VITE_BASE=./ build into dist-itch/site, budget check, zip to dist-itch/taming-the-elements-<version>.zip
corepack pnpm e2e:itch     # unzips the artifact, serves it at a subpath-less origin, loads the menu (0 console errors, 0 failed requests)
```

`tools/itch/build-itch.mjs` zips with the system `zip` (macOS/Linux), `index.html` at the zip root.

Size limits. itch.io HTML5 zips (<https://itch.io/docs/creators/html5>): at most 1,000 files, 500 MB extracted in total,
200 MB per file, 240 characters per path, UTF-8 case-sensitive names, `index.html` required. Our budget (fails `build:itch`)
is tighter: 500 files, 40 MB extracted total, 20 MB per file, 200 characters per path, no root-absolute URLs in `index.html`.
Current build: about 154 files, 24.5 MiB extracted, 23.5 MiB zipped (Phaser dominates). Raise `BUDGET` in the script
deliberately, never to silence a regression.

Workflow `.github/workflows/itch.yml` (tag `v*` or `workflow_dispatch`, `contents: read` only): build, smoke, upload the zip
as artifact `itch-zip` (90 days), then publish with butler 15.32.0 (pinned, sha256 verified) to channel `html5` with
`--userversion` from `package.json`. The publish step runs only when the `BUTLER_API_KEY` secret exists; otherwise it logs a
notice and the run still succeeds. The `ITCH_TARGET` slug (`hchan/taming-the-elements`) is a placeholder to confirm.
Owner setup: create the itch project (kind HTML5), add `BUTLER_API_KEY` as a repo secret, set embed 1280x720 and tick
"Fullscreen button". Nothing here publishes without that secret.

Iframe constraints (itch embeds the game in an iframe on another origin):

- Fullscreen: only works with itch's "Fullscreen button" option on; use it or the game's own `requestFullscreen`.
- Audio: browsers block it until a user gesture, so sound starts after the first click.
- Keyboard: arrow keys and space scroll the parent page until the iframe has focus; click the game once to focus it.
- Storage: `localStorage` belongs to the iframe's own origin, so itch saves are separate from the Pages origin and may be
  partitioned or cleared by the browser. Settings > export/import is the bridge: export on one origin, import on the other.
- No service worker; the hash router works inside the iframe (deep links are not shareable from the itch page URL).

## Rollback

Rollback = redeploy the previous tag (or previous good `main` commit):

1. Preferred: `git revert` the bad change on `main` (revert first, per `docs/BRANCHING.md`); the push redeploys.
2. To redeploy a specific earlier version without a new commit: Actions > the earlier successful `CI` run on `main` for that
   commit/tag > "Re-run all jobs". The `deploy` job republishes that commit's build.

## Troubleshooting

- Blank page or 404 on assets: wrong `VITE_BASE` for where the build is served.
- Footer shows `unknown` sha: build ran without git metadata and without `GITHUB_SHA`.
- Stale content after deploy: Pages CDN caches for about a minute; hard-reload.
