---
status: idea
added: 2026-11-18
---

# The visual e2e config's server

The visual config builds `--mode test` into `dist/` and serves it without the supervisor. Move it to `tools/ci/e2e-server.ts` and the per-checkout build dir.
