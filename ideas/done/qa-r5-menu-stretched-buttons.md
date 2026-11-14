---
status: done
added: 2026-11-13
---

# Desktop main menu: five 1220 px stretched buttons, left-aligned text, version clipped

The bright mystic backdrop is a clear improvement, but at 1280x720 the five buttons are about 1220 px wide with text hugging the left edge, so the menu reads like a form, not a fighting-game title screen. The version line at the bottom is cut off at 720 px height. The phone two-column layout looks better.

Proposal: cap button width (about 420 px), centre the stack, add hero or element art behind it, and keep the footer inside the viewport.

Evidence: ~/claudetmp/qa/r5/01-menu.png, ~/claudetmp/qa/r5/13-phone-menu.png
Done 2026-11-13: CSS only (main.css): menu stack capped at 24em and centred, 720p compaction; picker scroll-cue pill and 8em padding, wrapped ability text; phone landscape 10px edge bands.

Done 2026-11-13: CSS only (src/ui/styles/main.css): menu stack capped at 24em and centred, 720p compaction; picker scroll-cue pill, 8em padding, wrapped ability text; phone landscape 10px top/bottom edge bands.
