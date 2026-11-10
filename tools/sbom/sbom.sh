#!/bin/sh
# Production-only CycloneDX SBOM -> out/sbom.cdx.json.
# cyclonedx-npm reads `npm ls`, which cannot tell pnpm dev deps from prod deps, so it runs against a
# scratch prod-only install made from the lockfile. Needs the repo's dev install (for the binary).
set -eu
root=$(cd "$(dirname "$0")/../.." && pwd)
bin="$root/node_modules/.bin/cyclonedx-npm"
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
cp "$root/package.json" "$root/pnpm-lock.yaml" "$root/.npmrc" "$root/.pnpmfile.cjs" "$work/"
mkdir -p "$root/out"
(
  cd "$work"
  corepack pnpm install --prod --frozen-lockfile --ignore-scripts
  # npm ls exits non-zero on a pnpm layout; the component tree is still complete.
  env -i HOME="$HOME" PATH="$PATH" "$bin" --omit dev --ignore-npm-errors --output-format JSON --output-file "$root/out/sbom.cdx.json"
)
echo "wrote out/sbom.cdx.json"
