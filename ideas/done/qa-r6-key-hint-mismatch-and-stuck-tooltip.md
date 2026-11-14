---
status: done
added: 2026-11-13
done: 2026-11-13
---

Done: the first-run card names keys through `actionKeyLabel` (the action bar's own label function), so it reads Dash 7, Guard 8, Super 9, Tag 3, Cleanse = like the bar (pinned by a test). On windows 800 px tall or less the card is smaller and drops its footer so it ends above the hero. Tooltips expire after `TIP_MAX_MS` (3.5 s) even while the mouse or focus rests on a box. The floating "TAG" caption over the Tag box now goes after 7 s (`CAPTION_TICKS`) instead of being pinned all fight (that was the "stuck TAG" label). Not done: the round intro shortening and input buffering (separate system, see the round-intro ideas).

# QA r6: first-run hint keys disagree with the action bar; stuck "Dash" tooltip

Found while playing Tour stage 1 and Versus at 1280x720 (screenshots in ~/claudetmp/qa6/: tourfight-1.png, tourfight-4.png, fight-a-1280.png).

## Problems

- The "FIRST BLOOD" card says "Strike with 1. Dash with E; hold Q to Guard. Super: X. Tag with 3. Cleanse: =". The action bar under it labels Dash 7, Guard 8, Super 9, Trap 0, Cleanse =, Tag 3/4. A new player who presses E or Q gets nothing. One of the two is stale.
- The card covers the left third of the arena at 1280x720, including the player hero's zone, and stays for 7.5 s+ until "Got it" is pressed.
- A "TAG" / "Dash" tooltip label stays pinned bottom-centre of the arena for the whole fight (visible in every frame).
- The round intro ("ROUND 1" plus floor name) lasts 4+ s and early inputs are dropped, so a keen player thinks the game is frozen.

## Suggested fix

- Generate the hint text from the same key-binding table as the action bar, so they cannot drift; add a test that pins it.
- Dock the card to a corner away from heroes (or the bottom above the bar), auto-dismiss on first Strike/move, and make it smaller.
- Clear the floating tooltip when the pointer or key focus leaves; check why it never expires.
- Shorten the round intro to about 1.5 s and buffer inputs pressed during it.
