---
status: idea
added: 2026-11-16
---

# QA r74: scorecard (main e7c19b97 with HF2 and FLOOR-TAGS-1, headless Playwright, screenshots in ~/claudetmp/qa-r74/)

## Scores (0-5, vs Street Fighter / MvC)

| Axis | r73 | r74 | Why |
|---|---|---|---|
| Fun | 3 | 3 | Same loop and 13-hero roster. Hits, tag swaps, KO entrances and supers all work and read; still little hitstop or knockback weight next to SF. |
| Graphics | 3.5 | 3.5 | Round banner hero names are now big, bone and clean; "PAX IN!" is a small gold call; swap flash is a rim, not a wash. Earth intro Treenoc is less pale but still ghosted. Wispera is still a plain orb. |
| Readability | 3.5 | 3.5 (up a little, held back by clutter) | r69 items verified fixed (IN! call, TAG! call, swap flash, hero names, hit-mark colours); floor chips stay in view and clear of heads. Dense fights still stack damage numbers, and on phones the Pause button and the first-run card still collide with the super band. |

## Checks

- Menu is unchanged (Play, Versus, Online, Settings, Help); not re-opened beyond the versus picker. PASS.
- 1v1 in Fire, Water, Earth, Air (9 pairings at 1280x720, plus 4 played fights with live input): zero console or page errors. PASS.
- 2v2 Pax + Sindarosa vs Fiara at 1280x720, 844x390, 667x375: banner, swap, KO entrance, zero errors. PASS.
- HF2-1 KO entrance call: "PAX IN!" is about 34 px gold, sits above the head at x about 110-290, no clipping at any of the three sizes, no overlap with a damage number in these shots (k-1280-ko-1.png, k-844-ko-8.png, k-667-ko-8.png). PASS.
- HF2-2 swap flash: bone rim on the bar and a glint; the bar is not dimmed (k-1280-swap-2.png). PASS.
- HF2-3 hit marks: fire is an orange-yellow sunburst, earth a teal-green burst, water/air a pale cyan; clearly different in p-ishimi-fiara-3.png, p-rokcore-cyclonius-5.png, s-cyclonius-echo-14.png. PASS.
- HF2 round banner names: FIARA / LAVAX / PAX / ROKCORE are large, whole, and fully on screen at 1280, 844 and 667 (f-*-intro.png, k-667-banner-10.png). PASS.
- FLOOR-TAGS-1: "WATER +HP" now sits at x about 15 to 122 inside the screen (was cut at x=0 in r73) and below the fighter's feet (f-treenoc-cyclonius-fight.png); "AIR x2" chips are clear of both fighters (s-cyclonius-echo-14.png). PASS.
- Super band: no regressions at 667x375 and 844x390 (sup-p667-*, sup-p844-*). Hint card and Pause overlaps from r73 remain (see findings).
