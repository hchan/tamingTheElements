#!/usr/bin/env python3
"""Art yield ledger: tally art-director verdicts per slot from approval*.json files.

Read-only scan. Run: python3 -I tools/assets/roster24-art/yield-ledger.py DIR [DIR...] [--out FILE]

One approval file = one review round for the slots it lists. Slot names are
normalised (leading fx_/fx2_/fx3_, trailing round digit) so rerolls of the same
slot across files are tallied together. A slot is STUCK when it has 2+ failed
rounds and has never been approved. Output is a markdown table.
"""
import argparse
import json
import os
import re
import sys
from collections import Counter, defaultdict

LADDER = [
    "free CC0 asset + regrade",
    "i2i/ControlNet from a silhouette",
    "procedural Phaser particles",
]
FORBIDDEN_DIRS = {"public", "src", "tools"}
REASON_KEYS = ("note", "reason", "condition", "problem", "verdict_reason")


def norm_slot(name):
    s = re.sub(r"^fx\d*_", "", name.strip().lower())
    s = re.sub(r"(?<=[a-z])\d$", "", s)
    return s


def truthy(v):
    return bool(v) if not isinstance(v, str) else v.strip() != ""


def classify(e):
    """Return APPROVED / REVISE / REJECT for one slot entry."""
    if truthy(e.get("approved")):
        return "APPROVED"
    v = str(e.get("verdict", "")).upper()
    if "REVISE" in v:
        return "REVISE"
    if "REJECT" in v or "NONE" in v:
        return "REJECT"
    if any(truthy(e.get(k)) for k in ("best_of_bad", "best_revise", "fallback_best", "best_candidate", "revise")):
        return "REVISE"
    return "REJECT"


def reasons(e):
    out = []
    for k in REASON_KEYS:
        if isinstance(e.get(k), str) and e[k].strip():
            out.append(e[k].strip())
    r = e.get("revise")
    if isinstance(r, dict) and isinstance(r.get("problem"), str):
        out.append(r["problem"].strip())
    return out


def entries(path, data):
    """Yield (slot, entry dict) from one approval file; tolerate odd shapes."""
    if not isinstance(data, dict):
        return
    if isinstance(data.get("slots"), dict):
        inner = data["slots"]
        if inner:
            for k, v in inner.items():
                if isinstance(v, dict):
                    yield k, v
        else:  # whole-file verdict, no slots (e.g. weather)
            yield os.path.basename(os.path.dirname(path)), {
                "verdict": data.get("verdict", "REJECT"),
                "note": data.get("verdict", ""),
            }
        return
    for k, v in data.items():
        if isinstance(v, dict):
            yield k, v


def scan(dirs):
    files = []
    for d in dirs:
        for root, _, names in os.walk(d):
            for n in names:
                if n.startswith("approval") and n.endswith(".json"):
                    files.append(os.path.join(root, n))
    files.sort(key=lambda p: (os.path.getmtime(p), p))
    slots = defaultdict(lambda: {"rounds": 0, "APPROVED": 0, "REVISE": 0, "REJECT": 0, "last": "", "reasons": Counter()})
    for p in files:
        try:
            with open(p, encoding="utf-8") as fh:
                data = json.load(fh)
        except (OSError, ValueError):
            print(f"skip unreadable: {p}", file=sys.stderr)
            continue
        for name, e in entries(p, data):
            s = slots[norm_slot(name)]
            verdict = classify(e)
            s["rounds"] += 1
            s[verdict] += 1
            s["last"] = verdict
            for r in reasons(e):
                s["reasons"][r] += 1
    return slots, len(files)


def failed(s):
    return s["REVISE"] + s["REJECT"]


def is_stuck(s):
    return failed(s) >= 2 and s["APPROVED"] == 0


def next_rung(s):
    # 2 failed rounds -> rung 1; each further failed round climbs one rung
    return LADDER[min(max(failed(s) - 2, 0), len(LADDER) - 1)] if is_stuck(s) else ""


def render(slots, nfiles):
    lines = [f"# Art yield ledger ({nfiles} approval files, {len(slots)} slots)", "",
             "| slot | rounds | approved | revise | reject | last | repeated reasons | stuck | next method |",
             "|---|---|---|---|---|---|---|---|---|"]
    for name in sorted(slots, key=lambda n: (not is_stuck(slots[n]), -failed(slots[n]), n)):
        s = slots[name]
        rep = "; ".join(f"{r[:80]} (x{c})" for r, c in s["reasons"].items() if c >= 2) or "-"
        lines.append(f"| {name} | {s['rounds']} | {s['APPROVED']} | {s['REVISE']} | {s['REJECT']} | {s['last']} | {rep} | "
                     f"{'STUCK' if is_stuck(s) else ''} | {next_rung(s) or '-'} |")
    stuck = [n for n in slots if is_stuck(slots[n])]
    lines += ["", f"Stuck slots (2+ failed rounds, never approved): {', '.join(sorted(stuck)) or 'none'}"]
    return "\n".join(lines) + "\n"


def check_out(path):
    bad = set(os.path.realpath(path).split(os.sep)) & FORBIDDEN_DIRS
    if bad:
        sys.exit(f"refusing --out under {sorted(bad)}: {path}")


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("dirs", nargs="+")
    ap.add_argument("--out")
    a = ap.parse_args(argv)
    if a.out:
        check_out(a.out)
    slots, n = scan(a.dirs)
    text = render(slots, n)
    sys.stdout.write(text)
    if a.out:
        with open(a.out, "w", encoding="utf-8") as fh:
            fh.write(text)


if __name__ == "__main__":
    main()
