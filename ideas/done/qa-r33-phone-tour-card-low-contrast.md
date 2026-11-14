---
status: done
added: 2026-11-14
---

# Phone Tour card narrower but low-contrast on 844x390 and 667x375

The card now sits between the fighters and no longer covers the foe's foot, but its text is faint on the blue floor and the Got it button barely reads. It was caught mid-fade, so verify in real time; consider a darker panel background. On 667x375 the HUD names and tag portraits are tiny (name text about 6 px).

Screenshots: ~/claudetmp/qa-r33/tour-p-fight-2.png, tour-s-fight-2.png

## Resolution (2026-11-14)
Card now dark (rgba(14,12,32,0.92)) with light text and a clearer Got it button (main.css); checked at 844x390 and 667x375. Tiny HUD names at 667x375 remain.
