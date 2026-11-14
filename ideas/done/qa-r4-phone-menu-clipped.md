---
status: done
added: 2026-11-13
---

# Phone landscape menu still one column, Settings and Help off-screen

At 844x390 (touch, isMobile) the main menu shows only Play, Versus and part of Online; Settings and Help are below the fold and the 2-column layout did not apply. Check the media query against isMobile contexts and that the page scrolls.

Evidence: ~/claudetmp/qa/r4/13-phone-menu.png

Resolution (2026-11-13): the QA saw a stale preview server on the same port (a foreign process held it and strictPort failed silently); a fresh build gives two columns at 844x390. Added: solid footer bar and more bottom padding, gold-leaf headings, lit backdrop, larger glowing ring, Help as a centred link row with card sections.
