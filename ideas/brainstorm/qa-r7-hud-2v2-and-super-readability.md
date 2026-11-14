---
status: idea
added: 2026-11-14
---

# QA r7: 2v2 HUD overlap, weak super cinematic, stuck TAG label

Evidence: 2v2-fight.png, tag-swap-a.png, tag-swap-b.png, super-a/b/c.png (~/claudetmp/qa-r7/).

- 2v2: the bench portrait cards sit on top of the timer / super-segment strip, with a TAG chip and a cooldown number crammed in tiny boxes; hard to parse at 1280x720. Give the bench its own row under the life bars, larger.
- After a tag, a small "TAG" caption stays over the action-bar tooltip, and the big "TAG!" call overlaps an on-screen touch stick and chevrons that are drawn on a desktop (mouse) viewport; check touch-controls detection.
- Super (Glacier Crash): the banner is a grey outlined title across the lower third; the dim is light, the caster is duplicated as a ghost sprite at lower-left, and the element does not colour the banner. SF/MvC supers get a hard darken, speed lines and a close-up portrait slash-in. Add element colour and a portrait, remove the ghost.
- The FIGHT! banner stays semi-visible over the 2v2 start under manual stepping; verify live.
