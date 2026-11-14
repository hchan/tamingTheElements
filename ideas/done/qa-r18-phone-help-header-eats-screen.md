---
status: done
added: 2026-11-14
---

# Phone landscape Help: header, logo and tab row use two thirds of the screen (r18)

At 844x390 the Help page shows the title, the element-ring logo, then the five tabs (Key Bindings, Guide, Wiki, Watch the story, About); the first heading and one sentence of "How to fight" start only at the bottom edge. The reader scrolls almost at once. Idea: hide the logo and shrink the title in short viewports (max-height 480 px), and make the tab row sticky and one line. Check: at 844x390 at least five lines of body text are visible without scrolling.

Done (2026-11-14): at max-height 500 landscape the Help crest is hidden, the title shrinks and the tabs are one sticky nowrap row; first heading near y=140 of 390. Test: tests/e2e/help-controls.spec.ts.

Done (2026-11-14): at max-height 500 landscape the Help crest is hidden, the title shrinks and the tabs are one sticky nowrap row; first heading near y=140 of 390. Test: tests/e2e/help-controls.spec.ts.
