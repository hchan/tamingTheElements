"""Install the art-director-approved procedural roster24 loop strips into public/assets/img/fx/loop/.

Run: ~/claudetmp/venv/bin/python -I tools/assets/loop-proc/install.py   (from the worktree root)
Reads tools/assets/loop-proc/strips/<name>.png (1024x128, 8 frames of 128), requires an art-director approval row
"loop_<name>" in approval.json (approved file name, beats_shipped true), rescales every frame to 160x160 in premultiplied
space (the 1280x160 strip size the manifest rows and projectile-view.ts expect; no manifest change), writes
public/assets/img/fx/loop/<name>Loop.png and tools/assets/loop-proc/provenance.json (strip and output sha256, pinned by
tests/repo/loop-proc.test.ts). approval.json holds no sha256, so the strip sha256 is recorded here at install time.
Pillow and numpy only; deterministic.
"""
import hashlib
import json
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[3]
HERE = ROOT / "tools/assets/loop-proc"
OUT = ROOT / "public/assets/img/fx/loop"
NAMES = ["cinderSpray", "sporeBurst", "stingingFilament", "boulderRoll", "abyssalPull"]
N, SRC_F, F = 8, 128, 160


def sha(p: Path) -> str:
    return hashlib.sha256(p.read_bytes()).hexdigest()


def rescale(frame: Image.Image) -> Image.Image:
    a = np.asarray(frame.convert("RGBA"), np.float32) / 255.0
    pm = np.concatenate([a[..., :3] * a[..., 3:4], a[..., 3:4]], axis=2)
    ch = [np.asarray(Image.fromarray(pm[..., c], "F").resize((F, F), Image.LANCZOS)) for c in range(4)]
    pm = np.clip(np.stack(ch, axis=2), 0, 1)
    al = pm[..., 3:4]
    rgb = np.where(al > 1e-4, pm[..., :3] / np.maximum(al, 1e-4), 0)
    out = np.concatenate([np.clip(rgb, 0, 1), al], axis=2)
    return Image.fromarray((out * 255 + 0.5).astype(np.uint8), "RGBA")


def main() -> None:
    approval = json.loads((HERE / "approval.json").read_text())
    prov = {}
    for name in NAMES:
        a = approval[f"loop_{name}"]
        if a["reviewer"] != "art-director" or not a["beats_shipped"] or a["approved"] != f"{name}.png":
            raise SystemExit(f"{name}: not approved")
        src = HERE / "strips" / a["approved"]
        im = Image.open(src)
        if im.size != (SRC_F * N, SRC_F):
            raise SystemExit(f"{name}: strip is {im.size}, expected {(SRC_F * N, SRC_F)}")
        strip = Image.new("RGBA", (F * N, F))
        for i in range(N):
            strip.paste(rescale(im.crop((i * SRC_F, 0, (i + 1) * SRC_F, SRC_F))), (i * F, 0))
        out = OUT / f"{name}Loop.png"
        strip.save(out, optimize=True)
        prov[name] = {"strip": f"tools/assets/loop-proc/strips/{name}.png", "stripSha256": sha(src), "output": f"public/assets/img/fx/loop/{name}Loop.png", "outputSha256": sha(out)}
        print(f"wrote {out} {strip.size}")
    (HERE / "provenance.json").write_text(json.dumps({"note": "Procedural in-project art (gen.py), art-director approved 2026-11-23; no third-party licence.", "loops": prov}, indent=1) + "\n")


if __name__ == "__main__":
    main()
