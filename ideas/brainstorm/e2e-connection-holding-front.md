---
status: idea
added: 2026-11-18
---

# A connection-holding front for the e2e preview port

A tiny TCP front on the e2e port that holds incoming connections while the preview restarts, so a test inside the restart window waits instead of failing. Only worth building if the supervisor log keeps showing restarts after the health work in [e2e-webserver-health](../done/e2e-webserver-health.md).
