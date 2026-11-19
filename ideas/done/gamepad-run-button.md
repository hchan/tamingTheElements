---
status: done
added: 2026-11-18
---
# Gamepad button for Run

Help now says the gamepad has no Run button (keyboard Tab or the touch Run box only). Pick a pad button (for example a shoulder or stick click) and wire it to `Cmd.run`, then update the Gamepad row in help-controls and the tour text. Found while fixing the r109 Run help rows.

Done 2026-11-18: Home (standard button 16, the only one left free in the partner game; the shoulders and stick clicks are taken) is a rebindable `run` row sending `Cmd.run`; Help's Gamepad row says so. The stunned/rooted refusal notice needed no change (Arena reads the command bits).
