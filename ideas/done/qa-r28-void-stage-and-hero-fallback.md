---
status: done
added: 2026-11-14
---

# QA r28: no void stage; ?hero=eternal-void silently falls back

ARCADE_RACES in src/game/app/arcade-pick.ts filters void-element characters, so ?hero=eternal-void quietly becomes Sindarosa vs Rokcore. This is by design, but a poor QA experience: warn in the console or allow it in dev builds.

The Tour stage 9 Void boss uses a seed-chosen element arena (an earth stage with a crystal in my run) although the hub says "Location: Void", so the final boss has no distinct arena. The hub portrait of the Eternal Void is old flat pixel art, a style mismatch. The hub says "0 of 3 continues left" with continues:0 (ambiguous).

The void signature mark (purple ring, mark-void-1.png) renders and reads well.

Progress 2026-11-14: console warning for story-only ?hero=/?foe=; dev builds allow ?foe=eternal-void; void fights get a violet void backdrop with no element scenery (presentation only, no sim change); Tour void boss portrait uses the painted Large art; stage card says "No continues left: a defeat ends the tour". Hub portrait is the existing painted art, not a new paint.
