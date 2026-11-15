---
status: in-progress
added: 2026-11-15
---

# Picker: the Fight / Start bar takes its own space (PB1)

The picker page scrolled and the bar was `position: sticky; bottom: 0` inside it, which reserves no space at scroll 0, so at 1280x720 the bar covered the Versus partner slot and the first hero row (QA r4, r5, r14, r39, r47 #2, r53 #4, r54 #4, r55 #3).

Done: the page and the form are flex columns; one `.pickScroll` region is the only scroller; the bar is a `flex: none` sibling below it; a "More below" strip (`markMoreBelow` in src/ui/dom.ts) replaces the old pill; drag edge-scroll scrolls the region; changing a hero select moves the detail pane (A8). Tests: tests/e2e/picker-bar.spec.ts and the dom tests.

Open: PB2 and the follow-ups in picker-followups.md.
