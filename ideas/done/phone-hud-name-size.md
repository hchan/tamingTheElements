---
status: done
added: 2026-11-14
---

# Phone HUD fighter names and life text at 10 px or more

At 667x375 and 844x390 the slim HUD life line shrank to fit beside the SUPER label (TREENOC read 8.4 px, SUPER 9.9 px, WEATHER 8.9 px).

Done: the life line drops the word "Life" on a phone before shrinking (`compactLabel(..., terse)`), never shrinks below `MIN_PHONE_PX` (9.8 effective CSS px) and cuts the name only after that; the SUPER label has its own boost (`superBoost`, cap 1.95). Result at 667x375: names/life 11.8 and 9.9 px, SUPER 10.4 px, no overlaps; at 844x390 names 11.8, SUPER 10.3.
Test hook `__TTE__.arena.hudTextSizes()` and `tests/e2e/touch-fight-layout.spec.ts` (phone HUD text) assert at least 9.5 px and no overlaps at both sizes.
Follow-up done: the WEATHER charge chip (weather-view.ts, `CHARGE_PX`) now scales up to 24 logical px so it reads at least 10.5 CSS px on a phone; `touch-fight-layout` asserts it.
Screenshots: ~/claudetmp/phn/before-667.png, after-667.png, after-844.png.
