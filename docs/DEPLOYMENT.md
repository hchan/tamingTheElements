# Deployment

| Target | URL | Trigger | `VITE_BASE` |
|---|---|---|---|
| Local | `http://localhost:5173` (dev), `:4173` (preview) | manual | `/` (default) |
| GitHub Pages | `https://hchan.github.io/tamingTheElements/` | push to `main`, after `check` and `e2e` pass | `/tamingTheElements/` |
| itch.io | not built yet | planned, tag-triggered | `./` (planned) |

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

## itch.io (outline, not implemented)

- Build with a relative base (`VITE_BASE=./`) and zip `dist/` with `index.html` at the zip root.
- Upload as an HTML5 project, set the embed size (1280x720) and enable fullscreen.
- Game runs in a cross-site iframe: storage can be partitioned or cleared, so offer save export. No service worker.
- Push with `butler` from a tag-triggered workflow in an approval-gated environment (not written yet).

## Rollback

Rollback = redeploy the previous tag (or previous good `main` commit):

1. Preferred: `git revert` the bad change on `main` (revert first, per `docs/BRANCHING.md`); the push redeploys.
2. To redeploy a specific earlier version without a new commit: Actions > the earlier successful `CI` run on `main` for that
   commit/tag > "Re-run all jobs". The `deploy` job republishes that commit's build.

## Troubleshooting

- Blank page or 404 on assets: wrong `VITE_BASE` for where the build is served.
- Footer shows `unknown` sha: build ran without git metadata and without `GITHUB_SHA`.
- Stale content after deploy: Pages CDN caches for about a minute; hard-reload.
