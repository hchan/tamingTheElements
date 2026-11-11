# Changelog

## Unreleased

- Rig bake tool (WP-rig-bake): `pnpm assets:bake [--check]` bakes cutout rigs (`imgWorkArea/rigs/<sprite>/rig.json`, part PNGs, optional hand-painted keys, `extends` variants) into the per-frame PNGs `pnpm assets:sheets` packs; deterministic integer/fixed-point bake with a hash lock for stale detection (ADR-0019, FUN-DESIGN 2.16). Tools and tests only; no rigs or art ship yet.
- Arcade 3v3 tag teams (WP-arcade-3v3): a third hero (`partner2`) in the picker, Tag 2 on the 4 key / RB / touch button; in Arcade, Tag 1 and Tag 2 bring in the first and second living bench hero in roster order (Classic unchanged); the team HUD shows a BENCH line per bench hero; the Arcade AI tags to the healthier bench hero; `sim:match --ruleset arcade --team-size 3`; new golden `arcade-tag3` (every other golden unchanged, no SIM_VERSION bump).
- Retire the legacy `war/` directory from the tree (owner-approved, 2026-11-10). It stays at git tag `legacy-crafty-1.0`; `pnpm oracle:restore` and `pnpm test:oracle` bring back the parity oracle (docs/legacy/ARCHIVE.md).
- Replace the legacy grunt/gulp `package.json` with a pnpm + TypeScript + Vite shell (`pnpm build` emits a placeholder site).
