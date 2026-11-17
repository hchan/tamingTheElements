---
status: idea
added: 2026-11-16
---

# Movement can be made smoother (render-side)

Goal: smoother fighter movement on screen without touching the sim: sub-tick interpolation between 50 Hz sim states at the display refresh rate, easing on acceleration and stops, smoother camera follow on the pan camera, foot-sliding checks (stride length versus ground speed), and walk and run cycle blending.

Why: movement reads steppy on high-refresh displays and feet slide against the ground. Related: [backward-walk-baked-rows](backward-walk-baked-rows.md), [move-animation-wings-knees](move-animation-wings-knees.md), [sf-mvc-feel](sf-mvc-feel.md) (walk inertia is already in the sim), [arena-panning](arena-panning.md). No existing file covers interpolation.

- Size: M.
- Dependencies: render-only. The sim hash and goldens must stay unchanged (prove with the replay check); hit boxes and hit detection stay on the tick state, so interpolation must never feed back into the sim. Respect reduce-motion; keep it cheap on phones.
- GPU-suitable: no.
- Owner-gated: no.
