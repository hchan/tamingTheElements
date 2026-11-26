---
status: idea
added: 2026-11-26
---

# Live browser match stalls (found 2026-11-26)

`pnpm online:live-browser` (two headless pages, one Chromium, real relay) now fails: the 300-tick match (6 s nominal) takes about 58 s
(measurement, one run) and ends with "Connection lost. The match ended with no winner", and the two end lines do not mirror.

- Not caused by MP-smooth: the same run on the commit before the smoothing and before the catch-up (6a91bf66^1) took about 100 s and ended the same way (measurement, one run each).
- The scripted `online:live-match` (no browser) passes on the same relay: 20 of 20 batches each way, no gaps, median RTT about 160 ms (measurement).
- The relay MATCH frame sets input delay 4 (80 ms), not the harness default 2.
- Probe fix made here: the probe waited for `#quickLink` to be visible, but the layout fix hides it during play; it now waits for it to be attached.
- Next: find out whether the stall is two pages in one Chromium (timer or rAF throttling for the second context) or the relay; try two separate browsers, and log `session.status` per second.
