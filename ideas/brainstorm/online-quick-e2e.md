---
status: idea
added: 2026-11-18
---

# Online quick match e2e

The quick match screen is covered by dom tests with a fake service only. A Playwright spec (run on the PC) should drive two pages through a local relay (`packages/relay/`) built with `VITE_ONLINE_URL` pointing at it: Find on both, pick, Ready, one round, result. Needs a build variant with the variable set, a relay started by the spec, and a `@smoke` tag decision. Not touching `tests/e2e/online-relay.spec.ts`.
