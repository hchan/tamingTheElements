# tools/audio-gen

Generates the sampled effect cues (pilot: four element hits and four Cleanse sounds) shipped as
`public/assets/audio/sfx_<element>_<kind>.ogg`. Licence and provenance: [LICENSE.txt](LICENSE.txt). The game plays them via
`playSfx(kind, element)` ([src/game/audio/sample-sfx.ts](../../src/game/audio/sample-sfx.ts)) and falls back to the synth
voices in `element-sfx.ts` for any cue without a sample.

Model: MOSS-SoundEffect v2.0 (Apache-2.0, ungated, about 10 GB of weights; 1.3B diffusion transformer, 48 kHz mono).
Runs on Apple Silicon through MPS in float32 (about 10 to 20 s per 40-step clip on a 48 GB M-series Mac) after the runtime
patch in `gen.py` (`patch_for_apple_silicon`: the model ships float64 and complex RoPE tables that MPS lacks). CPU also works
(`--device cpu`), several minutes per clip.

## One-time setup (scratch, outside the repo)

```
uv venv ~/claudetmp/audio/.venv --python 3.12
uv pip install --python ~/claudetmp/audio/.venv/bin/python torch torchaudio diffusers transformers descript-audiotools \
  soundfile scipy "numpy<2" einops safetensors huggingface_hub
git clone https://github.com/OpenMOSS/MOSS-TTS ~/claudetmp/audio/MOSS-TTS
mkdir -p ~/claudetmp/audio/pkg && ln -s ~/claudetmp/audio/MOSS-TTS/moss_soundeffect_v2 ~/claudetmp/audio/pkg/moss_soundeffect_v2
~/claudetmp/audio/.venv/bin/hf download OpenMOSS-Team/MOSS-SoundEffect-v2.0 --local-dir ~/claudetmp/audio/weights
```

## Run

```
TORCHDYNAMO_DISABLE=1 PYTORCH_ENABLE_MPS_FALLBACK=1 PYTHONPATH=~/claudetmp/audio/pkg \
  ~/claudetmp/audio/.venv/bin/python tools/audio-gen/gen.py --weights ~/claudetmp/audio/weights --seeds 4 --steps 40
```

`--only water_hit,fire_cleanse` regenerates some cues; `--keep-wav-dir` keeps the raw candidates. Per cue it renders `--seeds`
candidates, post-processes them (`post.py`), ranks them by a heuristic score and writes the best as the .ogg, and records every
candidate's numbers in `report.json`. Output is deterministic per seed on one machine, not bit-identical across machines, which
is why the files are committed. To add a cue: add it to `prompts.py`, run the generator, add its id to `SFX_SAMPLE_IDS` in
`tools/assets/extract-legacy-manifest.ts`, and regenerate the manifest JSON.

## How the sound was judged (nobody listened)

Per candidate, `post.py` measures duration (must be under 1.45 s), peak and RMS (every cue normalised to about -19 dB RMS
over its active part, peak at most -1.5 dB, soft-limited), onset time of the loudest 10 ms frame, active length, tail level
(how far the end sits under the peak), clipped samples and DC, spectral centroid and bandwidth, spectral flatness (noise against
tone) and the share of energy above 5 kHz and below 250 Hz. The score prefers an early peak, a body of a few hundred ms, a
quiet tail and a spectral centroid in the element's expected range (earth low, water mid, fire and air bright and noisy). These
numbers catch silence, clipping, clicks, wrong-element timbre and runaway length. They cannot tell good from bad or grim from
cartoony: **the owner should listen to the eight files and veto or regenerate any that are wrong** (change the prompt in
`prompts.py` and rerun with `--only`).
