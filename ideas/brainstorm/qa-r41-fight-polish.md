---
status: idea
added: 2026-11-14
---

# QA r41: fight polish (desktop 1280x720)

Verified from r40: ghost trail shows on Sindarosa fading (2v2-hit.png, translucent red trail plus ring and FADE 2s chip); terrain chips (FIRE x2, WATER +HP, AIR x2) fade/read on all four stages (stage-*-hit.png). Tag swap shows TAG! banner, chevron ring and IN/BENCH state (tag-1.png).

New observations:
- super-b.png: the "FIGHT" round-intro word is still faintly visible behind a super's rings and burst (ghosted text under the effect). Fade it out faster or draw it below effects.
- tag-1.png: the First Blood hint is half-faded under the action bar while TAG plays; hide hints during a tag call so there is one focus.
- stage-water-hit.png / stage-air-hit.png: the player sprite is visibly pixelated/noisy next to the smooth foe sprite (Fiara fire texture); the SF/MvC bar is crisp characters, so upscale or clean Fiara's bake.
- Hit still frames show damage numbers and bursts, but attacker anticipation (lunge/recoil) still cannot be seen in stills; a hit-stop capture test would settle this.
