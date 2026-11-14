---
status: idea
added: 2026-11-13
---

# QA r6: dead band and hard seam on every non-fight screen; menu has no key art

Seen at both 1280x720 and 1920x1080 (menu-*.png, flow-*.png in ~/claudetmp/qa6/).

## Problems

- The page background ends in a hard seam, leaving a dead band (roughly 10-20% of the height) below the content on menu, Play, Help, Settings and Versus.
- The logo ring is blurry and low-res at 1920x1080 (it is clearly upscaled).
- The menu is flat: five buttons on a dark field with no hero art, no glow, no animation. It does not say "Street Fighter / Marvel vs Capcom" or "mystic and luminous".
- Versus: the earth stage row is faded under the sticky footer; stage lock icons overlap their text. Settings legends straddle the fieldset borders, and Display Size defaults to "Largest".

## Suggested fix

- Make the background fill the viewport (cover, or a gradient that continues past the image) and check at 16:9, 16:10 and ultrawide.
- Re-bake the logo at 2x or as SVG.
- Add key art: a painted hero line-up (the rigged Pax/Sindarosa/Curomo with rim light and a soft glow) behind the menu, with slow parallax and light motes.
- Fix footer padding, lock icon placement and fieldset legends in the CSS.
