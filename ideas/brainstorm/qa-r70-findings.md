---
status: idea
added: 2026-11-16
---

# QA r70: findings

Build main 4d383fa3, headless only. Screenshots in ~/claudetmp/qa-r70/. Scripts (Playwright, test build on port 7970) in ~/claudetmp/qa-r70/*.cjs. Servers were killed afterwards.

## Good

- Menu has exactly Play, Versus, Online, Settings, Help; no forbidden words on menu, Play or Versus (menu.png, play1.png, versus1.png).
- Restored Fiara renders bright and readable in all three stages (m-fiara-treenoc-fight.png, m-cyclonius-fiara-fight.png) and matches its picker icon and HUD portrait.
- WALL-3b: Hard AI keeps a gap from a player parked at the left wall (AI x settles at 120 against player x 15, one hit of 35, then nothing for 280 ticks). Normal AI crowds the player and keeps hitting (wall-Normal-1.png: 59 damage, stun, trap decals clipped by the edge).
- Stage picker works (Fire, Water, Air arenas all draw their own floor, crowd and ambience).
- Portrait 390x844 now offers "Play anyway" on the rotate overlay (r69 saw none).
- Zero console or page errors in menu, picker, five fights, portrait and landscape touch runs.

## Weak

1. Treenoc is fragmented at round start. At tick 30 (ROUND 1 banner) the body is drawn as scattered rectangular shards (m-fiara-treenoc-intro.png, m-treenoc-cyclonius-intro.png), 3 of 3 times, as player and as foe, on Fire and Water. Fiara and Cyclonius in the same frame are whole. Whole body appears by tick 90. Either a fade-in/dissolve that looks like a bug, or sheet frames cut wrongly; worth a look at the restored Treenoc intro frames.
2. Cyclonius is three creatures: the picker and info card show a blue striped tile (card-Cyclonius.png), the HUD portrait is a blue dragon, the arena idle is a blocky blue pixel figure with white speckles (m-treenoc-cyclonius-fight.png), and its cast frame is a watery swirl (m-cyclonius-fiara-fight.png). The restore needs one identity and one palette.
3. Treenoc colour: the picker icon is gold, the arena body is grey-green with a pale blue halo, the HUD bar is tan. On the fire floor the halo looks like a cutout (m-treenoc-cyclonius-fight.png).
4. "FIRE x2" and "AIR x2" element tags sit on top of the hero name or body (Treenoc and Wispera labels at the same height as the tags, m-lavax-wispera-fight.png earlier capture) and a clipped "x2" shows at the left screen edge on every fire stage shot.
5. Wall: Fiara pinned at x 15 is clipped by the screen edge (wall-Hard-7.png), so the pinned player sees half a hero. Normal still lets the AI sit inside the player (positions overlap, wall-Normal-1.png): see ai-step-apart-normal.
6. Portrait phone play (phone-play-anyway.png): the arena is a thin letterboxed strip with the action bar wrapped into two rows and a large "First Blood" hint card; most of the screen is black or UI. The cyclonius run shows HUD text at about 7 px.
7. Landscape phone (phone-land.png): the hint card covers the left status chips; the enemy sits behind the Pause and Strike buttons at the right edge.
8. Cyclonius label in the picker touches the tile border ("Cyclonius" fills the full width at 1280x720, card-Cyclonius.png).
9. First-run hint card "FIRST BLOOD" is present in every versus fight in test mode and sits over the lower arena, covering feet of low heroes.

## Suggested follow-ups

1. Find out why Treenoc shatters at round start (view bug or restore frames) and fix it.
2. Give Cyclonius one look across picker, HUD and arena, in a palette that stays apart from the Air stage and from Water heroes.
3. Anchor the element tags off the name and off-screen edges; hide tags that are clipped.
4. Keep a hero fully on-screen at a side wall (camera pad), and consider Normal step-apart.
5. Rework the portrait phone fight layout (arena fills the width, bar one row, hint card compact).
