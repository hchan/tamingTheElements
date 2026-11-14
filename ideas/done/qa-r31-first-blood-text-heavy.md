---
status: done
added: 2026-11-14
---

# First Blood strip text is long on desktop

Four lines of key hints sit over the bottom of the arena at 1280x720 while the player reads FIGHT!. Shorten to one line plus Got it, or show hints one at a time. Shots: /Users/henry.chan/claudetmp/qa31/meter3-full-1280-1.png, tag-swap-a.png.

Resolved 2026-11-14: on a short keyboard window (800 px tall or less) the card is one line of keys (firstRunShortLine) plus Got it; phones and tall windows keep their lines. Unit test added.
