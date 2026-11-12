---
status: done
added: 2026-11-12
---

# Touch button cooldown readouts for Dash, Guard, Charge

touchStatus returns '' for Dash, Guard and Charge because the render view does not expose their cooldowns. Expose them in RenderView.actionBar and show them as words on the buttons and in the accessible name.
