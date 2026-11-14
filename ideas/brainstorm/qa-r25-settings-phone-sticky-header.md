---
status: idea
added: 2026-11-14
---

# Settings on a phone: header and bar eat a third of the screen

At 844x390 the Settings title, the Save/Back bar (about 80 px, opaque) and the Play section header take about 190 px of 390, so only the first Difficulty radios are visible. Sections are collapsible, which helps, but the bar and the title could shrink.

Repro: `/?seed=7#settings` at 844x390 touch.

Idea: on short viewports, drop the title or put it in the bar, shrink Save/Back, and collapse every section except the first by default.
