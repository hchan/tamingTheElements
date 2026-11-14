---
status: idea
added: 2026-11-14
---

# Curomo Ice Shock still not verified in real play

Both r20 and r21 failed to capture Ice Shock: the Versus tile click does not pick the hero (see qa-r21-versus-hero-pick-unclear)
and the test hook has no "pick hero" parameter. Idea: add `?hero=curomo` (dev/test builds only) or a `__TTE__.arena` start option so
QA can start as a chosen hero, then capture the Ice Shock hit and freeze visuals. Also Tour: "Start tour" lands on a stage-select
screen (`m-08-tour1.png`) where the player must press FIGHT; fine, but the screen is unchanged after 6 s so QA cannot tell it was started.
