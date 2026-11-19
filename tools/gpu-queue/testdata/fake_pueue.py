#!/usr/bin/env python3
"""Fake pueue/pueued for ctl.py tests. State in $FAKE_PUEUE_STATE (json); every call is appended to state["log"].
Tests mutate the state file to simulate task progress. Not a faithful pueue: only the calls ctl.py makes."""
import json, os, sys

SP = os.environ["FAKE_PUEUE_STATE"]
argv = sys.argv[1:]
if argv[:1] == ["--config"]:
    argv = argv[2:]
name = os.path.basename(sys.argv[0])


def load():
    try:
        with open(SP) as f:
            return json.load(f)
    except OSError:
        return None


def save(s):
    with open(SP, "w") as f:
        json.dump(s, f)


if "--version" in argv:
    print(f"{name} 4.0.5")
    sys.exit(0)
if name.startswith("pueued"):
    if not os.path.exists(SP):
        save({"next": 0, "tasks": {}, "groups": {"default": {}}, "log": ["daemon-start"]})
    sys.exit(0)
if argv[:1] == ["add"] and "--help" in argv:
    print("--group --delay --label --print-task-id")
    sys.exit(0)
s = load()
if s is None:
    print("daemon not running", file=sys.stderr)
    sys.exit(1)
s["log"].append(argv)
cmd = argv[0]
if cmd == "status":
    print(json.dumps({"tasks": s["tasks"], "groups": s["groups"]}))
elif cmd == "group" and argv[1] == "add":
    s["groups"][argv[2]] = {}
elif cmd == "add":
    i = argv.index("--") if "--" in argv else len(argv)
    opts = argv[1:i]
    t = {"status": "Queued", "group": opts[opts.index("--group") + 1], "label": opts[opts.index("--label") + 1],
         "command": " ".join(argv[i + 1:])}
    if "--delay" in opts:
        t["delay"] = opts[opts.index("--delay") + 1]
    tid = s["next"]
    s["next"] += 1
    s["tasks"][str(tid)] = t
    print(tid)
elif cmd == "remove":
    s["tasks"].pop(argv[1], None)
elif cmd == "kill":
    ids = [a for a in argv[1:] if a.isdigit()]
    if "--group" in argv:
        g = argv[argv.index("--group") + 1]
        ids = [k for k, t in s["tasks"].items() if t["group"] == g and t["status"] == "Running"]
        s["groups"][g]["paused"] = True
    for k in ids:
        if k in s["tasks"]:
            s["tasks"][k]["status"] = {"Done": "Killed"}
elif cmd == "restart":
    s["tasks"][argv[-1]]["status"] = "Stashed"
elif cmd == "enqueue":
    s["tasks"][argv[-1]]["status"] = "Queued"
elif cmd == "pause" and "--group" in argv:
    s["groups"][argv[argv.index("--group") + 1]]["paused"] = True
elif cmd == "start" and "--group" in argv:
    s["groups"][argv[argv.index("--group") + 1]]["paused"] = False
elif cmd == "switch":
    a, b = argv[1], argv[2]
    s["tasks"][a], s["tasks"][b] = s["tasks"][b], s["tasks"][a]
save(s)
