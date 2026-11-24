# CPU-warp victory stills (durrok, vortigal), provenance

`durrok3.py` and `vortigal3.py` warp a matted base image (durrok: `durrok-120651-rg3.png`, vortigal: `matte/vortigal.png`, both from the
private art workspace) into a victory pose with `../durrok-warp/warp.py` + `waveA/wave.py`; `lcc.py` then keeps the largest connected blob
(a `_c.png` next to each input). `../fix.py` (hairline cleanup) is the same script used for brazgor/nykra/hyalia and was not changed.

    python -I durrok3.py <warp_dir> <base_image> durrok_win3.png && python -I lcc.py durrok_win3.png   # -> durrok_win3_c.png
    python -I vortigal3.py <warp_dir> <base_image> vortigal_win3.png && python -I lcc.py vortigal_win3.png

`<warp_dir>` is `tools/assets/victory-gen/durrok-warp`. The `_win3_c.png` outputs are the approved stills
`../provenance/durrok_win.png` and `vortigal_win.png` (art-director 2026-11-23, beats_shipped, replacing the r992 / r979 i2i stills,
which stay in provenance as history). Needs numpy, scipy, opencv, Pillow. Not run by tests or CI.
