
## 2026-11-23 waveD v8 (standing init for GPU i2i, no art-director verdict yet)
- Script .scratch/victory-warp/waveD/dd.py (args 68 62 12 30 = trunk, trunk bend, head, forehoof deg); output waveD/durrok_win.png, sheet waveD/_t_durrok.png.
- No ghost: the old ghost came from soft trunk masks leaving a faded copy in place. Fix = hard polygon removal (keep alpha = 1-mask) + two rigid trunk segments crossfaded at a soft bend + hose-bend foreleg at knee. Needs venv-rembg (scipy), not venv.
- Remaining: flat-cut trunk root block under the eye, tusks point forward not up, tiny grey shard at lifted-leg knee.
