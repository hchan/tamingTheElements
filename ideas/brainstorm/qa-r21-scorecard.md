---
status: idea
added: 2026-11-14
---

# QA r21 scorecard

Headless Chromium (SwiftShader), real-time input, test build on port 7905. Screenshots in `~/claudetmp/qa-r21/`
(`d-*` desktop 1280x720, `p-*` phone 844x390, `m-*` modes).

Scores (0-5), previous round r20 in brackets:

- Fun: 3.5 (3.5). Tag swap, super cinematic (TITAN SLAM) and rooted/snag feedback read well. AI still mostly trades hits; hazards were not dodged visibly.
- Graphics: 3.5 (3.5). Stage tiles and telegraphs are better; combat text and banners are still flat cream/yellow and cartoony next to the painterly floor.
- Readability: 4.0 (3.5). Tide and gale telegraphs are now clearly visible, phone letterbox bars are gone, HUD text is larger, banners are solid.

Covered: menu, Versus picker (1v1, 2v2, 3v3), four stages, FIGHT!/K.O., supers, 2v2 tag swap, Tour entry, Help, phone.

Improved since r20 (positive): tide chevrons and gale band now legible; wide phone view without side bars; FIGHT! and K.O. solid; STUN/STONESKIN/SNAGGED status chips clear.

Not verified: Curomo Ice Shock (the Versus hero tile click did not change the player's hero, so every run was Sindarosa vs Rokcore; see qa-r21-versus-hero-pick-unclear). Tour was entered (stage 1 of 9 select) but the fight was not started.

Findings: qa-r21-versus-hero-pick-unclear, qa-r21-combat-text-cartoony, qa-r21-phone-hud-and-card-overlap, qa-r21-rockfall-and-fire-telegraph-contrast, qa-r21-super-banner-clipped-on-phone, qa-r21-ice-shock-still-unverified.
