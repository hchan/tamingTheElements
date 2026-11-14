---
status: idea
added: 2026-11-13
---

# Phone: touch stick works, but slot row is 48 px on the screen edge and the canvas is pillarboxed

The new 138 px stick at bottom-left is visible, inside the viewport and drives the move keys (positive; fixes qa-r4-phone-fight-no-touch-controls for movement). Remaining at 844x390: action slots are 48 px tall with the row touching the bottom edge (notch and home-bar risk, labels tight); the 1v1 canvas is pillarboxed (693 of 844 px wide) leaving dead bars, and the stick overlaps the left bar and arena; no aim or deadzone affordance.

Proposal: safe-area padding on the slot row, use the side bars for the stick and a thumb cluster, and consider a larger slot size for attack and super.

Evidence: ~/claudetmp/qa/r5/16-phone-fight.png, ~/claudetmp/qa/r5/15-phone-intro.png
