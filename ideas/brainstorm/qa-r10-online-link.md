---
status: idea
added: 2026-11-14
---

# QA r10: online Link readout

Two headless pages on localhost connected through pasted codes (online-*.png). The match ran and both sides agreed.

- Label does not match the number. Same moment, same machine: host "Link: poor, 26 ms" then "poor, 27 ms"; joiner "good, 26 ms" then "fair, 24 ms". 24-27 ms should always read good. The grade probably uses jitter or missed pongs, and a throttled background tab inflates it. Grade on median RTT first, smooth over several samples, never show poor from one slow sample.
- The readout lives in the setup form, far above the match canvas. While the match runs the player must scroll up to see it (online-bottom.png shows the arena with no Link text). Put a small chip over the arena.
- The Online page is the least finished screen: white default textareas over busy key art, tiny native selects for heroes, the match canvas placed below a tall form so the page scrolls. A new player cannot tell where the game is. Give it the card styling Settings has and collapse the form once Connected.
- Copy: joiner still sees "Step 3: send the answer code back to your host" after connecting; hide completed steps.
