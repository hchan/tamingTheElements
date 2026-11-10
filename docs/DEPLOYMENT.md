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
- A push to `main` additionally runs `pages-build` and `deploy`, which `needs` `check`, `e2e` and the cross-browser `browser` job. `browser` is skipped on docs-only runs, so the job condition accepts `skipped` and blocks only on `failure` or `cancelled`. Pages and itch builds are production builds written to `dist/`, `dist-pages/` and `dist-itch/`; the e2e test build (`--mode test`, contains `window.__TTE__`) goes to `node_modules/.tte-e2e` and `pnpm size:check` fails if `dist/` ever contains `__TTE__`.
- Only the `deploy` job has `pages: write` and `id-token: write`; the workflow default is `contents: read`.
- `deploy` uses concurrency group `pages` with `cancel-in-progress: false`, so a deploy is never cut off.
- Action versions are pinned to commit SHAs (verified with `env -u GITHUB_TOKEN gh api repos/<owner>/<repo>/git/ref/tags/<tag>`).
- No service worker or PWA scope yet.

One-time setup (the repo owner does this, not the workflow): Settings > Pages > Source = "GitHub Actions". Until then the
`deploy` job fails harmlessly.

## Deploying without GitHub Actions

Test and deploy from your machine; no workflow minutes are used by these commands.

```sh
corepack pnpm ci:local            # lint, typecheck, depcruise, test, test:legacy, build, size:check, e2e, e2e:pages, test:browser
corepack pnpm ci:local --fast     # the seven node-only steps, no browsers
corepack pnpm deploy:pages --dry-run   # build + subpath smoke test, show what would be pushed, no push
corepack pnpm deploy:pages             # same, then publish to the gh-pages branch of origin
```

- `ci:local` runs the same commands as `ci.yml`, prints a summary table and exits non-zero on any failure. It probes which
  engines launch; `test:browser` runs per launchable engine (Chromium, Firefox, WebKit) and any engine that cannot launch is
  reported as SKIP with the reason, never silently. The `coverage` job is not part of it (`pnpm test:coverage` runs it).
- `deploy:pages` refuses a dirty working tree and a HEAD that is not already on `origin/main`. It runs `e2e:pages`, which builds
  `dist-pages` with `VITE_BASE=/tamingTheElements/` (as `pages-build` does) and smoke-tests it, then makes a throwaway orphan
  commit under `~/claudetmp/` containing only the built files plus an empty `.nojekyll`, message `Deploy <sha> (<version>)`,
  and runs `git push --force origin HEAD:gh-pages`. Force-push is allowed for the hard-coded `gh-pages` branch only; any other
  target is refused.

One-time switch of Pages from the workflow source to the branch (owner only; `build_type` and `source` are documented at
<https://docs.github.com/en/rest/pages/pages#update-information-about-a-apiname-pages-site>; run `deploy:pages` once first so
the branch exists):

```sh
env -u GITHUB_TOKEN gh api -X PUT repos/hchan/tamingTheElements/pages -f build_type=legacy -f 'source[branch]=gh-pages' -f 'source[path]=/'
```

Switch back to the workflow source:

```sh
env -u GITHUB_TOKEN gh api -X PUT repos/hchan/tamingTheElements/pages -f build_type=workflow
```

While Pages uses the branch source, the `pages-build` and `deploy` jobs still run on pushes to `main` but their deploy
fails harmlessly (or is superseded); disable them if that bothers you.

Actions minutes. Public repositories get free standard-runner minutes, so this is a convenience, not a cost fix. To use
fewer anyway:

- `ci.yml` has a `changes` job: when a push or PR touches only `**/*.md`, `docs/**` or `LICENSE`, the `coverage` and `browser`
  jobs are skipped. A workflow-level `paths-ignore` is not used on purpose: `check` includes `tests/repo`, which checks
  markdown links and the repo map, so a docs edit can break it, and a skipped workflow leaves any required check pending.
  Trade-off: a docs-only change gets no cross-engine run (it cannot affect determinism).
- Put `[skip ci]` in a commit message (GitHub honours it natively for `push` and `pull_request` runs of the head commit).
  Only for changes you have already verified with `ci:local`.

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

Workflow `.github/workflows/itch.yml` has two jobs. `build` (tag `v*` or `workflow_dispatch`, `contents: read` only) builds,
smoke-tests and uploads the zip as artifact `itch-zip` (90 days); a manual dispatch is a dry run and never publishes.
`publish` runs only for `refs/tags/v*`, in the `itch` GitHub Environment that holds `BUTLER_API_KEY`, and only downloads
that artifact (no checkout, install, build or Playwright, so no node or dev dependency runs next to the key). It uses butler
15.32.0 (pinned, sha256 verified) to push to channel `html5` with `--userversion` taken from the tag. If the secret is
missing it logs a notice and the run still succeeds. The `ITCH_TARGET` slug (`hchan/taming-the-elements`) is a placeholder to confirm.
Owner setup: create the itch project (kind HTML5), create a GitHub Environment named `itch` (restrict deployments to `v*` tags, optionally require a reviewer) and add `BUTLER_API_KEY` as an environment secret there, set embed 1280x720 and tick
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
