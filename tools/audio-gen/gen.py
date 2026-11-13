#!/usr/bin/env python3
"""Generates the sampled elemental sound effects in public/assets/audio/sfx_<element>_<kind>.ogg with MOSS-SoundEffect v2.0
(OpenMOSS-Team, Apache-2.0, text-to-audio, no login needed). See README.md and LICENSE.txt in this folder.

Usage (see README.md for the one-time venv setup):
  TORCHDYNAMO_DISABLE=1 PYTHONPATH=<dir containing the moss_soundeffect_v2 package> \
    python tools/audio-gen/gen.py --weights <local weights dir> [--device mps|cpu] [--seeds 3] [--steps 40] [--only water_hit]

For every cue it renders --seeds candidates, trims, fades and normalises them (post.py), scores them and keeps the best one as
an ogg, and writes tools/audio-gen/report.json (the numbers the commit message quotes). Deterministic per seed on one machine,
not bit-identical across machines, which is why the .ogg files are committed.
"""
from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import post  # noqa: E402
from prompts import CUES  # noqa: E402

ROOT = HERE.parents[1]


def patch_for_apple_silicon() -> None:
    """The model ships for CUDA: float64 tensors and complex RoPE tables do not exist on MPS. Rebuild the RoPE tables as float32
    (cos, sin) pairs, shape [end, K, 2], and apply them with real arithmetic (the same rotation); do the timestep sinusoid in
    float64 on the CPU."""
    import torch
    from moss_soundeffect_v2.diffsynth.models import wan_audio_dit as ad
    from moss_soundeffect_v2.diffsynth.models import wan_video_dit as vd
    from moss_soundeffect_v2.diffsynth.pipelines import wan_audio as wa

    def precompute(dim, end=16384, theta=10000.0, s=1.0):
        f = 1.0 / (theta ** (torch.arange(0, dim, 2)[: dim // 2].double() / dim))
        ang = torch.outer(torch.arange(end, dtype=torch.float64) * s, f)
        return torch.stack((torch.cos(ang), torch.sin(ang)), dim=-1).float()

    def precompute_1d(dim, end=16384, theta=10000.0):
        return precompute(dim, end, theta).chunk(3, dim=1)

    def legacy_1d(dim, end=16384, theta=10000.0, base_tps=4.0, target_tps=44100 / 2048):
        s = float(base_tps) / float(target_tps)
        f = precompute(dim - 2 * (dim // 3), end, theta, s)
        one = precompute(dim // 3, end, theta, s)
        one = torch.stack((torch.ones_like(one[..., 0]), torch.zeros_like(one[..., 0])), dim=-1)
        return f, one, one

    def sinusoidal(dim, position):
        pos = position.detach().cpu().double()
        ang = torch.outer(pos, torch.pow(10000, -torch.arange(dim // 2, dtype=torch.float64).div(dim // 2)))
        return torch.cat([torch.cos(ang), torch.sin(ang)], dim=1).to(device=position.device, dtype=position.dtype)

    def rope_apply(x, freqs, num_heads):
        from einops import rearrange
        out_dtype = x.dtype
        x = rearrange(x, 'b s (n d) -> b s n d', n=num_heads).float()
        x = x.reshape(*x.shape[:-1], -1, 2)
        r = freqs.reshape(*freqs.shape[:-1], -1, 2).to(x.dtype)
        cos, sin = r[..., 0], r[..., 1]
        xe, xo = x[..., 0], x[..., 1]
        return torch.stack((xe * cos - xo * sin, xe * sin + xo * cos), dim=-1).flatten(2).to(out_dtype)

    ad.precompute_freqs_cis = precompute
    ad.precompute_freqs_cis_1d = precompute_1d
    ad.legacy_precompute_freqs_cis_1d = legacy_1d
    for m in (ad, vd, wa):
        m.sinusoidal_embedding_1d = sinusoidal
    vd.rope_apply = rope_apply


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument('--weights', required=True, help='local dir of OpenMOSS-Team/MOSS-SoundEffect-v2.0')
    ap.add_argument('--device', default='mps', choices=['mps', 'cpu'])
    ap.add_argument('--seeds', type=int, default=3)
    ap.add_argument('--steps', type=int, default=40)
    ap.add_argument('--cfg', type=float, default=4.0)
    ap.add_argument('--out', default=str(ROOT / 'public/assets/audio'))
    ap.add_argument('--only', default='', help='comma list of cue ids, e.g. water_hit,fire_cleanse')
    ap.add_argument('--keep-wav-dir', default='', help='also write every raw candidate wav here (scratch, under ~/claudetmp)')
    args = ap.parse_args()

    import torch
    from moss_soundeffect_v2 import MossSoundEffectPipeline

    if args.device == 'mps':
        patch_for_apple_silicon()
    pipe = MossSoundEffectPipeline.from_pretrained(args.weights, torch_dtype=torch.float32, device=args.device)
    sr = pipe.sample_rate
    only = {s for s in args.only.split(',') if s}
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    report_path = HERE / 'report.json'
    report = json.loads(report_path.read_text()) if report_path.exists() else {}

    for cue in CUES:
        if only and cue['id'] not in only:
            continue
        best = None
        cands = []
        for seed in range(args.seeds):
            t0 = time.time()
            wav = pipe(prompt=cue['prompt'], seconds=cue['seconds'], num_inference_steps=args.steps, cfg_scale=args.cfg,
                       seed=seed, negative_prompt=cue['negative'], max_inference_seconds=4, progress_bar_cmd=lambda x: x)
            raw = wav[0, 0].float().cpu().numpy()
            if args.keep_wav_dir:
                post.write_wav(Path(args.keep_wav_dir) / f"{cue['id']}_s{seed}.wav", raw, sr)
            clip = post.process(raw, sr, cue)
            m = post.metrics(clip, sr)
            m['seed'] = seed
            m['score'] = post.score(m, cue)
            m['gen_seconds'] = round(time.time() - t0, 1)
            cands.append(m)
            print(f"{cue['id']} seed {seed}: {json.dumps(m)}", flush=True)
            if best is None or m['score'] > best[0]['score']:
                best = (m, clip)
        m, clip = best
        post.write_ogg(out / f"sfx_{cue['id']}.ogg", clip, sr)
        report[cue['id']] = {'prompt': cue['prompt'], 'chosen_seed': m['seed'], 'steps': args.steps, 'cfg': args.cfg,
                             'chosen': m, 'candidates': cands}
        report_path.write_text(json.dumps(report, indent=1, sort_keys=True) + '\n')


if __name__ == '__main__':
    main()
