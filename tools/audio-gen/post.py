"""Post-processing and objective checks for generated clips (numpy/scipy/soundfile only).

We cannot listen from the pipeline, so every clip is judged by numbers: duration, peak and RMS level, a crude loudness proxy
(K-ish weighted RMS in dBFS), onset time, tail decay, spectral centroid and bandwidth, noise-vs-tone (spectral flatness) and
a DC / clipping check. The finished clip is band-limited, trimmed at both ends, faded, and RMS-normalised to TARGET_RMS_DB with
a peak ceiling, so that every cue sits at about the same loudness and the in-game volume slider does the rest."""
from __future__ import annotations

from pathlib import Path

import numpy as np
import soundfile as sf
from scipy import signal

TARGET_RMS_DB = -19.0  # of the active part of the clip
PEAK_CEIL_DB = -1.5
MAX_SECONDS = 1.45
OUT_RATE = 44100


def db(x: float) -> float:
    return float(20 * np.log10(max(x, 1e-9)))


def write_wav(path: Path, x: np.ndarray, sr: int) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    sf.write(str(path), x, sr, subtype='PCM_16')


def write_ogg(path: Path, x: np.ndarray, sr: int) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    sf.write(str(path), x, sr, format='OGG', subtype='VORBIS')


def process(raw: np.ndarray, sr: int, cue: dict) -> np.ndarray:
    x = raw.astype(np.float64)
    x -= x.mean()
    sos = signal.butter(4, 40, 'highpass', fs=sr, output='sos')  # no sub-bass rumble, no DC
    x = signal.sosfilt(sos, x)
    sos = signal.butter(4, 16000, 'lowpass', fs=sr, output='sos')
    x = signal.sosfilt(sos, x)
    x = signal.resample_poly(x, OUT_RATE, sr)
    sr = OUT_RATE
    # Trim leading silence to 5 ms before the first sample above -40 dB of the peak.
    env = np.abs(x)
    thr = env.max() * 10 ** (-40 / 20)
    start = max(0, int(np.argmax(env > thr)) - int(0.005 * sr))
    x = x[start:]
    n = min(len(x), int(min(cue['seconds'], MAX_SECONDS) * sr))
    x = x[:n]
    # Fades: 3 ms in, cosine tail over the last 35 percent (at least 80 ms) so nothing clicks off.
    fin = int(0.003 * sr)
    x[:fin] *= np.linspace(0, 1, fin)
    fout = min(len(x), max(int(0.08 * sr), int(len(x) * 0.35)))
    x[-fout:] *= 0.5 * (1 + np.cos(np.linspace(0, np.pi, fout)))
    # Normalise by the RMS of the part within 30 dB of the peak envelope, then limit the peak.
    act = x[np.abs(x) > np.abs(x).max() * 10 ** (-30 / 20)]
    rms = float(np.sqrt(np.mean(act**2))) if len(act) else 1e-9
    g = 10 ** (TARGET_RMS_DB / 20) / rms
    x = x * g
    peak = np.abs(x).max()
    ceil = 10 ** (PEAK_CEIL_DB / 20)
    if peak > ceil:
        x = np.tanh(x / ceil * 0.9) / np.tanh(0.9) * ceil  # soft clip rather than a hard one
        x *= ceil / np.abs(x).max()
    return x.astype(np.float32)


def metrics(x: np.ndarray, sr: int) -> dict:
    n = len(x)
    f, t, S = signal.spectrogram(x, sr, nperseg=1024, noverlap=768)
    P = S.sum(axis=1) + 1e-18
    centroid = float((f * P).sum() / P.sum())
    bw = float(np.sqrt(((f - centroid) ** 2 * P).sum() / P.sum()))
    flat = float(np.exp(np.mean(np.log(P))) / np.mean(P))
    w = signal.sosfilt(signal.butter(2, [100, 8000], 'bandpass', fs=sr, output='sos'), x)  # K-ish weighting stand-in
    hop = int(0.01 * sr)
    frames = np.array([np.sqrt(np.mean(w[i:i + hop] ** 2)) for i in range(0, n - hop, hop)]) + 1e-9
    peak_i = int(np.argmax(frames))
    loud = db(float(np.sqrt(np.mean(w**2))))
    above = np.where(frames > frames.max() * 10 ** (-20 / 20))[0]
    last = int(above[-1]) if len(above) else 0
    # Fraction of the spectrogram energy above 5 kHz (hiss / air) and below 250 Hz (thump).
    hi = float(S[f > 5000].sum() / S.sum())
    lo = float(S[f < 250].sum() / S.sum())
    return dict(
        seconds=round(n / sr, 3), peak_db=round(db(float(np.abs(x).max())), 2), rms_db=round(db(float(np.sqrt(np.mean(x**2)))), 2),
        loudness_db=round(loud, 2), onset_ms=int(peak_i * 10), active_ms=int((last + 1) * 10),
        tail_db=round(db(float(frames[-5:].mean())) - db(float(frames.max())), 1), centroid_hz=int(centroid), bandwidth_hz=int(bw),
        flatness=round(flat, 4), hi_frac=round(hi, 3), lo_frac=round(lo, 3), dc=round(float(x.mean()), 6),
        clipped=int((np.abs(x) >= 0.999).sum()),
    )


def score(m: dict, cue: dict) -> float:
    """Higher is better. Prefers a punchy early peak, an audible but not endless body, a decayed tail and a centroid in the
    element's range; hard-rejects clipping and near-silence. A ranking heuristic, not a quality guarantee."""
    s = 0.0
    lo, hi = cue['centroid']
    c = m['centroid_hz']
    s -= 0 if lo <= c <= hi else min(abs(c - lo), abs(c - hi)) / 500
    s -= m['onset_ms'] / 150  # early peak
    s += min(m['active_ms'], 700) / 350  # something is actually there
    s -= max(0, m['active_ms'] - 1000) / 400
    s += min(0, m['tail_db'] + 25) / 10  # tail should end quiet, at least 25 dB under the peak
    s -= 5 * m['clipped']
    s -= 20 if m['seconds'] < 0.4 * cue['seconds'] else 0  # trimmed to a stub: the model rendered silence after a blip
    s -= 3 if m['rms_db'] < -30 else 0
    return round(s, 3)
