#!/usr/bin/env python3
"""Self-test for cut.py's --no-sam path on a synthetic image (numpy + pillow only). Run: python selftest.py [workdir]"""
import json
import subprocess
import sys
from pathlib import Path

import numpy as np
from PIL import Image

here = Path(__file__).resolve().parent


def main() -> None:
    work = Path(sys.argv[1]) if len(sys.argv) > 1 else Path.home() / "claudetmp" / "rig-assist-selftest"
    work.mkdir(parents=True, exist_ok=True)
    img = np.zeros((40, 40, 4), np.uint8)
    img[10:30, 10:20] = (200, 60, 60, 255)  # body
    img[12:28, 20:30] = (60, 60, 200, 255)  # arm, touching the body on its right
    Image.fromarray(img, "RGBA").save(work / "src.png")
    pts = {
        "arm": {"parent": "body", "polygon": [[20, 12], [30, 12], [30, 28], [20, 28]]},
        # The body polygon deliberately overlaps the arm; arm is listed first so it wins.
        "body": {"polygon": [[10, 10], [24, 10], [24, 30], [10, 30]]},
    }
    (work / "points.json").write_text(json.dumps(pts))
    out = work / "rig"
    subprocess.run(
        [sys.executable, "-I", str(here / "cut.py"), str(work / "src.png"), str(work / "points.json"), str(out), "--no-sam", "--underlap", "4"],
        check=True,
    )

    rig = json.loads((out / "rig.json").read_text())
    parts = {p["id"]: p for p in rig["parts"]}
    assert set(parts) == {"arm", "body"}, parts
    assert parts["arm"]["parent"] == "body" and "parent" not in parts["body"]
    assert parts["arm"]["z"] > parts["body"]["z"], "first listed part is on top"
    for p in parts.values():
        assert all(isinstance(v, int) for v in p["pivot"] + p["at"]), p

    sys.path.insert(0, str(here))
    import cut

    masks = {k: cut.polygon_mask(v["polygon"], 40, 40) for k, v in pts.items()}
    own = cut.make_disjoint(masks, list(pts), img[..., 3])
    assert not (own["arm"] & own["body"]).any(), "masks overlap"
    assert (own["arm"] | own["body"]).sum() == (img[..., 3] > 0).sum(), "every opaque pixel is in exactly one part"

    # Underlap: body (below the arm) grew 4 px beneath the arm over the arm's 16 rows; the arm (top) did not grow.
    body = np.asarray(Image.open(out / "parts" / "body.png"))
    arm = np.asarray(Image.open(out / "parts" / "arm.png"))
    assert (body[..., 3] > 0).sum() == own["body"].sum() + 4 * 16, "body underlaps 4 px x 16 rows beneath the arm"
    assert (arm[..., 3] > 0).sum() == own["arm"].sum(), "the top part has nothing to hide under"
    assert tuple(body[12 - 10, -1]) == (200, 60, 60, 255), "hidden area is edge-extended body colour"

    # Pivot: the arm touches the body along x=20, y 12..28: centroid (20.5, 20.5) rounds to (20, 20); arm origin is (20, 12).
    assert parts["arm"]["pivot"] == [0, 8], parts["arm"]
    print("selftest ok")


if __name__ == "__main__":
    main()
