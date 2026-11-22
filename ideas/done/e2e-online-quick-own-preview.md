---
status: done
added: 2026-11-18
---

# The online-quick spec's own preview

The online-quick spec starts its own preview that shares `node_modules/.tte-e2e-online`, and its `kill('SIGTERM')` hits corepack, not vite (the same bug the main supervisor had). Give it the per-checkout build dir and spawn vite directly, or reuse the supervisor.
