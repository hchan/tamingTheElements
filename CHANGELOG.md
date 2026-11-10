# Changelog

## Unreleased

- Retire the legacy `war/` directory from the tree (owner-approved, 2026-11-10). It stays at git tag `legacy-crafty-1.0`; `pnpm oracle:restore` and `pnpm test:oracle` bring back the parity oracle (docs/legacy/ARCHIVE.md).
- Replace the legacy grunt/gulp `package.json` with a pnpm + TypeScript + Vite shell (`pnpm build` emits a placeholder site).
