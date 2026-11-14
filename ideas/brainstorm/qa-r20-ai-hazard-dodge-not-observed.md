---
status: idea
added: 2026-11-14
---

# QA r20: AI hazard dodging not observed in real-time play

Real-time play (no manual=1), seed 7, Pax as AI, hero vs Pax on each stage, weather super fired once per stage. At the strike frame the foe centre was inside the hazard on water (full-width tide), earth (176x176 slab) and air (full-width gale band); outside only on fire (narrow strip at x=1552, which the foe was never near, so not a dodge either). One run per stage, so this is not proof SIM_VERSION 55 dodging is broken. Water and air bands span almost the whole arena, so there may be no safe spot reachable in time; confirm the AI path to safety and give those hazards a safe lane or longer warn. Note: manual step() leaves the AI idle, so dodging can only be judged in real time or via a sim test. Idea: add a sim-level test or tools script that logs the foe inside-at-strike rate over many seeds.
