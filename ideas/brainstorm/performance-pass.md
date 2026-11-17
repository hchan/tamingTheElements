---
status: idea
added: 2026-11-16
---

# Performance pass (frame time, memory, mobile)

Goal: measure and cut frame time, per-tick allocation and memory on desktop and mid-range phones; budget per scene; profile particle and filter use.

Why: more art, weather layers and filters are landing; phones are a target (see [qa-phone-landscape-touch](qa-phone-landscape-touch.md)).

- Size: M.
- Dependencies: headless profiling only (no visible browsers); the per-tick allocation test and perf-budget-reviewer already exist. Sim changes unlikely.
- GPU-suitable: no.
- Owner-gated: no (bundle size is irrelevant to the owner; frame time is not).
