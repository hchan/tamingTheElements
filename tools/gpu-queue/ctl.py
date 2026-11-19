#!/usr/bin/env python3
"""Job server wrapper for the shared GPU PC (runs in WSL, stdlib only, python 3.10+).

The ONLY pueue client. pueue (pinned release, private config under TTE_JOBS_HOME) queues; this file adds policy:
ownership by owner id, load view (CPU + GPU), thermal/RAM watchdog, the 23:00-07:00 art window, retention.
Client: tools/gpu-queue/jobs.ts (`pnpm gpu:*`). Idea: ideas/in-progress/gpu-job-server.md.

Call shape (over ssh): python3 ctl.py VERB [--owner ID] [args]   stdin line 1: "<token> [<admin token>]" (never argv).
Replies: one JSON object on stdout (with "proto"), human text on stderr.
Exit codes: 0 ok, 1 job/tool failure, 2 usage, 6 invalid queue, 77 not yours / admin needed / bad token,
97 server not set up, disk low or version mismatch.

Environment (all optional; tests set them):
  TTE_JOBS_HOME  default ~/tte-jobs          TTE_JOBS_PUEUE / TTE_JOBS_PUEUED  binaries (default $HOME/bin or PATH)
  TTE_JOBS_NOW   ISO local time for the clock TTE_JOBS_NVSMI  nvidia-smi    TTE_JOBS_PROC  default /proc
  TTE_JOBS_PY    python for gpu-queue.py (default ~/tte-gpu/venv/bin/python)
  TTE_JOBS_FAKE_TEMP  override GPU temp      TTE_JOBS_FAKE_FREE_GB  override free disk
  TTE_JOBS_GRACE seconds between SIGTERM and kill on cancel (default 30)   TTE_JOBS_NO_WATCHDOG=1  do not auto-start it
"""
import argparse, fcntl, hmac, json, os, re, secrets, shutil, signal, subprocess, sys, tarfile, time
from datetime import datetime, timedelta

PROTO = 1
LANES = {"gpu": 1, "cpu-short": 1, "cpu-full": 1}
ID_RE = re.compile(r"^[A-Za-z0-9_-]{1,48}$")
MIN_FREE_GB = 10
RETENTION_DAYS = 14
TEMP_ABORT, TEMP_RESUME = 83, 75
RAM_LOW_KB, RAM_OK_KB, RAM_LOW_SECS = 4 * 1024 * 1024, 6 * 1024 * 1024, 30
RETRY_SHORT_RC = (3, 4, 5, 7)
MAX_RETRIES = 6
UPLOAD_CAP = 200 * 1024 * 1024
FINAL = ("done", "failed", "cancelled", "lost")


class Exit(Exception):
    def __init__(self, code, msg=""):
        super().__init__(msg)
        self.code, self.msg = code, msg


def home():
    return os.environ.get("TTE_JOBS_HOME") or os.path.expanduser("~/tte-jobs")


def jobs_dir():
    return os.path.join(home(), "jobs")


def now():
    v = os.environ.get("TTE_JOBS_NOW")
    return datetime.fromisoformat(v) if v else datetime.now()


def window_open(dt):
    """Bulk art window, local time: 23:00-07:00."""
    return dt.hour >= 23 or dt.hour < 7


def next_window_start(dt):
    if window_open(dt):
        return dt
    return dt.replace(hour=23, minute=0, second=0, microsecond=0)


def fmt_dt(dt):
    return dt.strftime("%Y-%m-%d %H:%M:%S")


def emit(obj):
    obj = dict(obj, proto=PROTO)
    sys.stdout.write(json.dumps(obj) + "\n")


def say(msg):
    sys.stderr.write(msg + "\n")


# ---------- auth ----------
def read_secret(name):
    try:
        with open(os.path.join(home(), name)) as f:
            return f.read().strip()
    except OSError:
        return ""


def authenticate(line, need_admin=False):
    """`line` is the first stdin line. Returns is_admin. 97 if the server has no token, 77 on mismatch."""
    tok, adm = read_secret("token"), read_secret("admin.token")
    if not tok:
        raise Exit(97, "server not set up (no token)")
    parts = line.split()
    given = parts[0] if parts else ""
    if not hmac.compare_digest(given.encode(), tok.encode()):
        raise Exit(77, "bad token")
    is_admin = bool(adm) and len(parts) > 1 and hmac.compare_digest(parts[1].encode(), adm.encode())
    if need_admin and not is_admin:
        raise Exit(77, "admin token needed")
    return is_admin


# ---------- pueue ----------
def pueue_bin():
    return os.environ.get("TTE_JOBS_PUEUE") or os.path.join(home(), "bin", "pueue")


def pueued_bin():
    return os.environ.get("TTE_JOBS_PUEUED") or os.path.join(home(), "bin", "pueued")


def pq(*args, check=True):
    """Run pueue with the private config. Returns CompletedProcess (text)."""
    cmd = [pueue_bin(), "--config", os.path.join(home(), "pueue.yml"), *map(str, args)]
    try:
        r = subprocess.run(cmd, capture_output=True, text=True, timeout=60)
    except OSError as e:
        raise Exit(97, f"pueue not runnable: {e}")
    if check and r.returncode != 0:
        raise Exit(1, f"pueue {' '.join(map(str, args))} failed: {r.stderr.strip()}")
    return r


def kind_of(status):
    if isinstance(status, str):
        return status
    if isinstance(status, dict) and status:
        return next(iter(status))
    return "Unknown"


def pq_state():
    """{'tasks': {tid(int): {kind, group, label}}, 'groups': {name: info}} from `pueue status --json`."""
    r = pq("status", "--json", check=False)
    if r.returncode != 0:
        return None
    try:
        d = json.loads(r.stdout)
    except ValueError:
        return None
    tasks = {}
    for k, t in (d.get("tasks") or {}).items():
        tasks[int(k)] = {"kind": kind_of(t.get("status")), "group": t.get("group", "default"), "label": t.get("label")}
    return {"tasks": tasks, "groups": d.get("groups") or {}}


def ensure():
    """Idempotent: daemon alive, lanes exist."""
    st = pq_state()
    if st is None:
        subprocess.run([pueued_bin(), "--config", os.path.join(home(), "pueue.yml"), "-d"], capture_output=True)
        for _ in range(20):
            st = pq_state()
            if st is not None:
                break
            time.sleep(0.25)
        if st is None:
            raise Exit(97, "pueued did not start")
    for lane, n in LANES.items():
        if lane not in st["groups"]:
            pq("group", "add", lane)
            pq("parallel", "--group", lane, n)
    if os.environ.get("TTE_JOBS_NO_WATCHDOG") != "1":
        start_watchdog()


def start_watchdog():
    lock = os.path.join(home(), "watchdog.lock")
    try:
        fd = os.open(lock, os.O_CREAT | os.O_RDWR, 0o600)
        try:
            fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except OSError:
            return  # running
        fcntl.flock(fd, fcntl.LOCK_UN)
        os.close(fd)
        subprocess.Popen(["setsid", "-f", sys.executable, os.path.abspath(__file__), "watchdog"],
                         stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, stdin=subprocess.DEVNULL)
    except OSError:
        pass


# ---------- registry ----------
def jdir(jid):
    if not ID_RE.match(jid or ""):
        raise Exit(2, f"bad job id {jid!r}")
    return os.path.join(jobs_dir(), jid)


def read_meta(jid):
    try:
        with open(os.path.join(jdir(jid), "meta.json")) as f:
            return json.load(f)
    except (OSError, ValueError):
        return None


def write_meta(meta):
    d = jdir(meta["id"])
    os.makedirs(d, exist_ok=True)
    tmp = os.path.join(d, "meta.json.tmp")
    with open(tmp, "w") as f:
        json.dump(meta, f)
    os.replace(tmp, os.path.join(d, "meta.json"))


def all_meta():
    out = []
    try:
        names = sorted(os.listdir(jobs_dir()))
    except OSError:
        return out
    for n in names:
        m = read_meta(n)
        if m:
            out.append(m)
    return out


def reconcile(st=None):
    """Bring registry states in line with pueue; restart retries. Returns the (fresh) pueue state."""
    st = st or pq_state()
    if st is None:
        return None
    tasks = st["tasks"]
    for m in all_meta():
        if m["state"] in FINAL:
            continue
        t = tasks.get(m.get("tid"))
        if t is None:
            m.update(state="lost", reason="task vanished from pueue")
            write_meta(m)
            continue
        if m["state"] == "queued" and t["kind"] == "Running":
            m["state"] = "running"
            write_meta(m)
        elif m["state"] == "retry-wait" and t["kind"] == "Done":
            at = datetime.fromtimestamp(m.get("retry_at", time.time()))
            pq("restart", "--in-place", "--stashed", m["tid"])
            pq("enqueue", "--delay", fmt_dt(at), m["tid"])
            m["state"] = "queued"
            write_meta(m)
        elif m["state"] in ("queued", "running", "cancelling") and t["kind"] == "Done":
            if m["state"] == "cancelling":
                m["state"] = "cancelled"
            else:
                m.update(state="failed", reason="task ended without a result")
            write_meta(m)
    return st


def lane_view(st):
    """Per lane: running and queued task lists (owner, id, tid), queue ordered by tid (pueue starts lowest id first)."""
    by_tid = {m.get("tid"): m for m in all_meta()}
    lanes = {l: {"running": [], "queued": []} for l in LANES}
    for tid in sorted(st["tasks"]):
        t = st["tasks"][tid]
        lane = lanes.get(t["group"])
        if lane is None or t["kind"] in ("Done",):
            continue
        m = by_tid.get(tid, {})
        item = {"id": m.get("id"), "owner": m.get("owner", t.get("label")), "tid": tid}
        (lane["running"] if t["kind"] == "Running" else lane["queued"]).append(item)
    return lanes


# ---------- sensors ----------
def nvsmi(*args):
    try:
        r = subprocess.run([os.environ.get("TTE_JOBS_NVSMI", "nvidia-smi"), *args, "--format=csv,noheader,nounits"],
                           capture_output=True, text=True, timeout=20)
        return r.stdout if r.returncode == 0 else ""
    except (OSError, subprocess.SubprocessError):
        return ""


def num(s):
    try:
        return float(s.strip())
    except ValueError:
        return None


def gpu_info():
    out = nvsmi("--query-gpu=utilization.gpu,memory.used,memory.total,temperature.gpu,power.draw").strip().splitlines()
    f = [num(x) for x in out[0].split(",")] if out else []
    f += [None] * (5 - len(f))
    info = {"util": f[0], "mem_used_mb": f[1], "mem_total_mb": f[2], "temp": f[3], "power_w": f[4]}
    fake = os.environ.get("TTE_JOBS_FAKE_TEMP")
    if fake:
        info["temp"] = float(fake)
    apps = [l for l in nvsmi("--query-compute-apps=pid,used_memory").splitlines() if l.strip()]
    info["procs"] = len(apps)
    return info


def proc_file(name):
    try:
        with open(os.path.join(os.environ.get("TTE_JOBS_PROC", "/proc"), name)) as f:
            return f.read()
    except OSError:
        return ""


def mem_info():
    d = {}
    for line in proc_file("meminfo").splitlines():
        k, _, v = line.partition(":")
        p = v.split()
        if p and p[0].isdigit():
            d[k] = int(p[0])
    return {"avail_kb": d.get("MemAvailable"), "total_kb": d.get("MemTotal")}


def load_info():
    p = proc_file("loadavg").split()
    return {"load": [float(x) for x in p[:3]] if len(p) >= 3 else None, "nproc": os.cpu_count()}


def free_gb():
    fake = os.environ.get("TTE_JOBS_FAKE_FREE_GB")
    if fake:
        return float(fake)
    os.makedirs(home(), exist_ok=True)
    s = os.statvfs(home())
    return s.f_bavail * s.f_frsize / 1e9


# ---------- watchdog ----------
def pause_state():
    try:
        with open(os.path.join(home(), "pause.json")) as f:
            return json.load(f)
    except (OSError, ValueError):
        return {}


def save_pause(p):
    tmp = os.path.join(home(), "pause.json.tmp")
    with open(tmp, "w") as f:
        json.dump(p, f)
    os.replace(tmp, os.path.join(home(), "pause.json"))


def mark_gpu_retry(reason, delay_s):
    for m in all_meta():
        if m.get("lane") == "gpu" and m["state"] == "running":
            m.update(state="retry-wait", reason=reason, retry_at=time.time() + delay_s)
            write_meta(m)


def watchdog_tick(ts=None):
    """One pass. Thermal: >83 C kill + pause the gpu group (jobs retried); RAM <4 GB for 30 s: pause --wait.
    Resume (`pueue start --group gpu`, never `start <tid>`) only when every reason cleared (<75 C, >6 GB, no admin pause)."""
    ts = time.time() if ts is None else ts
    reconcile()  # queued -> running first, so a thermal kill can mark the running job for retry
    p = pause_state()
    temp = gpu_info()["temp"]
    avail = mem_info()["avail_kb"]
    if temp is not None and temp > TEMP_ABORT and not p.get("thermal"):
        mark_gpu_retry("gpu over 83 C", 600)
        pq("kill", "--group", "gpu", check=False)  # kills and pauses the group
        p["thermal"] = True
    elif p.get("thermal") and (temp is None or temp < TEMP_RESUME):
        p["thermal"] = False
    if avail is not None and avail < RAM_LOW_KB:
        p.setdefault("ram_low_since", ts)
        if ts - p["ram_low_since"] >= RAM_LOW_SECS and not p.get("ram"):
            pq("pause", "--group", "gpu", "--wait", check=False)
            p["ram"] = True
    elif avail is not None and avail > RAM_OK_KB:
        p.pop("ram_low_since", None)
        p["ram"] = False
    was = p.get("paused_by_us", False)
    blocked = bool(p.get("thermal") or p.get("ram") or p.get("admin"))
    if blocked:
        p["paused_by_us"] = True
    elif was:
        pq("start", "--group", "gpu", check=False)
        p["paused_by_us"] = False
    save_pause(p)
    with open(os.path.join(home(), "watchdog.beat"), "w") as f:
        f.write(str(int(ts)))
    reconcile()
    return p


def cmd_watchdog(args):
    os.makedirs(home(), exist_ok=True)
    fd = os.open(os.path.join(home(), "watchdog.lock"), os.O_CREAT | os.O_RDWR, 0o600)
    try:
        fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except OSError:
        return {"running": True}
    n = 0
    while True:
        try:
            watchdog_tick()
            if n % 240 == 0:
                gc()
        except Exit as e:
            say(f"watchdog: {e.msg}")
        n += 1
        if args.once:
            return {"ticks": 1}
        time.sleep(15)


# ---------- verbs ----------
def safe_extract(fileobj, dest):
    total = 0
    with tarfile.open(fileobj=fileobj, mode="r|") as tf:
        for m in tf:
            name = os.path.normpath(m.name)
            if os.path.isabs(name) or name.startswith("..") or not (m.isfile() or m.isdir()):
                raise Exit(2, f"refused archive member {m.name!r}")
            total += max(m.size, 0)
            if total > UPLOAD_CAP:
                raise Exit(2, "upload over the 200 MB cap")
            tf.extract(m, dest, set_attrs=False)


def queue_is_bulk_first(path):
    try:
        with open(path) as f:
            jobs = json.load(f).get("jobs") or []
    except (OSError, ValueError):
        return False
    return bool(jobs and jobs[0].get("bulk"))


def cmd_submit(args, stdin, is_admin):
    if args.now and not is_admin:
        raise Exit(77, "--now is admin only")
    if not ID_RE.match(args.owner or ""):
        raise Exit(2, "bad owner id")
    if free_gb() < MIN_FREE_GB:
        raise Exit(97, f"disk low: under {MIN_FREE_GB} GB free")
    dt = now()
    jid = f"g-{dt.strftime('%Y%m%d%H%M%S')}-{secrets.token_hex(2)}"
    d = jdir(jid)
    os.makedirs(os.path.join(d, "in"))
    try:
        safe_extract(stdin, os.path.join(d, "in"))
        queue = os.path.join(d, "in", "queue.json")
        if not os.path.isfile(queue):
            raise Exit(6, "archive has no queue.json")
        script = os.path.join(home(), "bin", "gpu-queue.py")
        if not os.path.isfile(script):
            raise Exit(97, "gpu-queue.py not installed (gpu:setup)")
        py = os.environ.get("TTE_JOBS_PY") or os.path.expanduser("~/tte-gpu/venv/bin/python")
        dry = subprocess.run([py, script, queue, os.path.join(d, "work"), "--dry-run"], capture_output=True, text=True, cwd=d)
        if dry.returncode != 0:
            say((dry.stdout + dry.stderr).strip())
            raise Exit(6 if dry.returncode == 6 else 1, "dry-run failed")
    except Exit:
        shutil.rmtree(d, ignore_errors=True)
        raise
    eta = (dry.stdout.strip().splitlines() or [""])[-1]
    bulk = queue_is_bulk_first(queue)
    delay = None
    if bulk and not window_open(dt) and not args.now:
        delay = fmt_dt(next_window_start(dt))
    st = pq_state() or {"tasks": {}, "groups": {}}
    ahead = sum(len(v) for v in lane_view(st)["gpu"].values())
    cmd = ["add", "--group", "gpu", "--label", args.owner, "--print-task-id"]
    if delay:
        cmd += ["--delay", delay]
    cmd += ["--", "python3", os.path.abspath(__file__), "run-gpu", jid]
    r = pq(*cmd)
    m = re.search(r"\d+", r.stdout)
    if not m:
        raise Exit(1, "pueue add printed no task id")
    meta = {"id": jid, "owner": args.owner, "lane": "gpu", "tid": int(m.group()), "state": "queued", "created": time.time(),
            "bulk": bulk, "now": bool(args.now), "attempts": 0, "eta": eta, "start": delay or "now"}
    write_meta(meta)
    emit({"id": jid, "tid": meta["tid"], "place": ahead + 1, "ahead": ahead, "start": meta["start"], "eta": eta})
    return 0


def cmd_submit_raw(args):
    """cpu lanes (built, not used by e2e yet): queue `bash ~/tte-offload/jobs/<id>/job.sh` in cpu-short or cpu-full."""
    if args.lane not in ("cpu-short", "cpu-full"):
        raise Exit(2, "lane must be cpu-short or cpu-full")
    if not ID_RE.match(args.owner or "") or not ID_RE.match(args.id or ""):
        raise Exit(2, "bad owner or id")
    script = os.path.join(os.environ.get("TTE_OFFLOAD_HOME") or os.path.expanduser("~/tte-offload"), "jobs", args.id, "job.sh")
    if not os.path.isfile(script):
        raise Exit(2, f"no job.sh for {args.id}")
    r = pq("add", "--group", args.lane, "--label", args.owner, "--print-task-id", "--", "bash", script)
    m = re.search(r"\d+", r.stdout)
    if not m:
        raise Exit(1, "pueue add printed no task id")
    write_meta({"id": "raw-" + args.id, "owner": args.owner, "lane": args.lane, "tid": int(m.group()), "state": "queued",
                "created": time.time(), "attempts": 0})
    emit({"id": "raw-" + args.id, "tid": int(m.group()), "lane": args.lane})
    return 0


def cmd_run_gpu(args):
    """The pueue task for one gpu job: runs gpu-queue.py, maps its exit code (retry table), records it in meta."""
    m = read_meta(args.id)
    if not m:
        raise Exit(1, "no such job")
    if m["state"] in ("cancelling", "cancelled"):
        m["state"] = "cancelled"
        write_meta(m)
        return 143
    d = jdir(args.id)
    m.update(state="running", attempts=m.get("attempts", 0) + 1, started=time.time())
    write_meta(m)
    py = os.environ.get("TTE_JOBS_PY") or os.path.expanduser("~/tte-gpu/venv/bin/python")
    cmd = [py, os.path.join(home(), "bin", "gpu-queue.py"), os.path.join("in", "queue.json"), "work"]
    if m.get("now"):
        cmd.append("--now")
    env = dict(os.environ, TTE_GPU_LOCK=os.path.expanduser("~/tte-gpu/gpu.lock"))
    child = subprocess.Popen(cmd, cwd=d, env=env)
    signal.signal(signal.SIGTERM, lambda *_: child.terminate())
    rc = child.wait()
    m = read_meta(args.id) or m
    m.update(rc=rc, finished=time.time())
    if m["state"] == "cancelling":
        m["state"] = "cancelled"
    elif rc == 0:
        m["state"] = "done"
    elif rc == 2 or rc in RETRY_SHORT_RC:
        if m["attempts"] > MAX_RETRIES:
            m.update(state="failed", reason=f"gave up after {MAX_RETRIES} retries (last rc {rc})")
        else:
            at = next_window_start(now() + timedelta(seconds=0)) if rc == 2 else now() + timedelta(minutes=10)
            if rc == 2 and window_open(now()):
                at = (now() + timedelta(hours=16)).replace(hour=23, minute=0, second=0, microsecond=0)
            m.update(state="retry-wait", reason=f"gpu-queue rc {rc}", retry_at=at.timestamp())
            m.pop("finished", None)
    else:
        m.update(state="failed", reason=f"gpu-queue rc {rc}")
    write_meta(m)
    return rc


def cmd_cancel(args, is_admin):
    m = read_meta(args.id)
    if not m:
        raise Exit(2, "no such job")
    if m["owner"] != args.owner and not (args.force and is_admin):
        raise Exit(77, "not your job")
    if args.force and not is_admin:
        raise Exit(77, "--force needs the admin token")
    if m["state"] in FINAL:
        emit({"id": m["id"], "state": m["state"]})
        return 0
    tid = m["tid"]
    st = pq_state() or {"tasks": {}}
    kind = (st["tasks"].get(tid) or {}).get("kind")
    if kind == "Running":
        m["state"] = "cancelling"
        write_meta(m)
        pq("kill", "--signal", "sigterm", tid, check=False)
        deadline = time.time() + float(os.environ.get("TTE_JOBS_GRACE", "30"))
        while time.time() < deadline:
            cur = pq_state()
            if cur is None or (cur["tasks"].get(tid) or {}).get("kind") != "Running":
                break
            time.sleep(0.5)
        else:
            pq("kill", tid, check=False)
    elif kind is not None:
        pq("remove", tid, check=False)
    m["state"] = "cancelled"
    write_meta(m)
    emit({"id": m["id"], "state": "cancelled"})
    return 0


def cmd_status(args):
    st = reconcile() or {"tasks": {}, "groups": {}}
    dt = now()
    beat = 0
    try:
        with open(os.path.join(home(), "watchdog.beat")) as f:
            beat = int(f.read())
    except (OSError, ValueError):
        pass
    emit({"time": fmt_dt(dt), "window_open": window_open(dt), "gpu": gpu_info(), **load_info(), "mem": mem_info(),
          "disk_free_gb": round(free_gb(), 1), "lanes": lane_view(st), "paused": {k: v for k, v in pause_state().items() if k in ("thermal", "ram", "admin")},
          "watchdog_age_s": int(time.time() - beat) if beat else None})
    return 0


def place_of(m, lanes):
    q = lanes.get(m.get("lane"), {}).get("queued", [])
    for i, it in enumerate(q):
        if it["tid"] == m.get("tid"):
            return i + 1
    return None


def cmd_list(args):
    st = reconcile() or {"tasks": {}, "groups": {}}
    lanes = lane_view(st)
    rows = []
    for m in all_meta():
        if not args.all and m["owner"] != args.owner:
            continue
        rows.append({"id": m["id"], "owner": m["owner"], "lane": m.get("lane"), "state": m["state"], "place": place_of(m, lanes),
                     "rc": m.get("rc"), "start": m.get("start"), "reason": m.get("reason")})
    emit({"jobs": rows})
    return 0


def cmd_log(args):
    jdir(args.id)
    m = read_meta(args.id) or {}
    p = os.path.join(jdir(args.id), "work", "progress.log")
    data = b""
    try:
        with open(p, "rb") as f:
            f.seek(args.offset)
            data = f.read()
    except OSError:
        pass
    emit({"state": m.get("state", "unknown"), "rc": m.get("rc"), "offset": args.offset + len(data), "text": data.decode("utf8", "replace")})
    return 0


def cmd_fetch(args):
    d = jdir(args.id)
    m = read_meta(args.id)
    if not m:
        raise Exit(2, "no such job")
    work = os.path.join(d, "work")
    if not os.path.isdir(work):
        raise Exit(2, "no results yet")
    m["fetched"] = time.time()
    write_meta(m)
    names = [n for n in ("out", "meta.jsonl", "progress.log") if os.path.exists(os.path.join(work, n))]
    sys.stdout.flush()
    with tarfile.open(fileobj=sys.stdout.buffer, mode="w|") as tf:
        for n in names:
            tf.add(os.path.join(work, n), arcname=n)
    return 0


def gc(days=None):
    days = RETENTION_DAYS if days is None else days
    cutoff = time.time() - days * 86400
    removed = []
    for m in all_meta():
        if m["state"] not in FINAL:
            continue
        end = max(m.get("fetched", 0), m.get("finished", 0)) or m.get("created", 0)
        if end and end < cutoff:
            shutil.rmtree(jdir(m["id"]), ignore_errors=True)
            removed.append(m["id"])
    pq("clean", check=False)
    return removed


def cmd_pause(args, resume):
    p = pause_state()
    p["admin"] = not resume
    save_pause(p)
    if resume:
        if not (p.get("thermal") or p.get("ram")):
            pq("start", "--group", "gpu")
            p["paused_by_us"] = False
            save_pause(p)
    else:
        pq("pause", "--group", "gpu", "--wait")
        p["paused_by_us"] = True
        save_pause(p)
    emit({"paused": p["admin"]})
    return 0


def cmd_reorder(args):
    a, b = read_meta(args.id), read_meta(args.before)
    if not a or not b:
        raise Exit(2, "no such job")
    pq("switch", a["tid"], b["tid"])
    a["tid"], b["tid"] = b["tid"], a["tid"]
    write_meta(a)
    write_meta(b)
    emit({"swapped": [a["id"], b["id"]]})
    return 0


def cmd_init(args):
    """First-time (or --rotate) setup, no token needed (the caller already has ssh): create tokens and the private pueue config."""
    os.makedirs(os.path.join(home(), "bin"), exist_ok=True)
    cfg = os.path.join(home(), "pueue.yml")
    if not os.path.exists(cfg):
        with open(cfg, "w") as f:
            f.write("shared:\n  pueue_directory: %s\n  use_unix_socket: true\n  unix_socket_path: %s\n"
                    % (os.path.join(home(), "pueue"), os.path.join(home(), "pueue.sock")))
    if read_secret("token") and not args.rotate:
        emit({"initialized": False})
        return 0
    out = {}
    for name, key in (("token", "token"), ("admin.token", "admin")):
        out[key] = secrets.token_hex(16)
        fd = os.open(os.path.join(home(), name), os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
        with os.fdopen(fd, "w") as f:
            f.write(out[key])
    emit({"initialized": True, **out})
    return 0


def cmd_selftest(args):
    problems = []
    v1 = pq("--version", check=False).stdout.strip()
    r2 = subprocess.run([pueued_bin(), "--version"], capture_output=True, text=True)
    if v1.split()[-1:] != r2.stdout.strip().split()[-1:]:
        problems.append(f"version mismatch: {v1!r} vs {r2.stdout.strip()!r}")
    h = pq("add", "--help", check=False).stdout
    for flag in ("--group", "--delay", "--label", "--print-task-id"):
        if flag not in h:
            problems.append(f"pueue add lacks {flag}")
    emit({"ok": not problems, "problems": problems, "version": v1})
    return 0 if not problems else 97


def build_parser():
    ap = argparse.ArgumentParser(prog="ctl.py")
    sp = ap.add_subparsers(dest="verb", required=True)
    for v in ("version", "ensure", "status", "selftest", "gc"):
        sp.add_parser(v)
    w = sp.add_parser("watchdog"); w.add_argument("--once", action="store_true")
    s = sp.add_parser("submit"); s.add_argument("--owner", required=True); s.add_argument("--now", action="store_true")
    r = sp.add_parser("submit-raw"); r.add_argument("--owner", required=True); r.add_argument("--lane", required=True); r.add_argument("id")
    g = sp.add_parser("run-gpu"); g.add_argument("id")
    c = sp.add_parser("cancel"); c.add_argument("--owner", required=True); c.add_argument("--force", action="store_true"); c.add_argument("id")
    l = sp.add_parser("list"); l.add_argument("--owner", default=""); l.add_argument("--all", action="store_true")
    lg = sp.add_parser("log"); lg.add_argument("id"); lg.add_argument("--offset", type=int, default=0)
    f = sp.add_parser("fetch"); f.add_argument("id")
    sp.add_parser("pause"); sp.add_parser("resume")
    i = sp.add_parser("init"); i.add_argument("--rotate", action="store_true")
    ro = sp.add_parser("reorder"); ro.add_argument("id"); ro.add_argument("--before", required=True)
    return ap


ADMIN_VERBS = ("pause", "resume", "reorder")


def main(argv=None, stdin=None):
    argv = sys.argv[1:] if argv is None else argv
    stdin = stdin or sys.stdin.buffer
    try:
        args = build_parser().parse_args(argv)
    except SystemExit as e:
        return 2 if e.code else 0
    try:
        if args.verb == "version":
            emit({})
            return 0
        if args.verb == "init":
            return cmd_init(args)
        if args.verb in ("run-gpu", "watchdog"):
            if args.verb == "run-gpu":
                return cmd_run_gpu(args)
            emit(cmd_watchdog(args))
            return 0
        line = stdin.readline().decode("utf8", "replace")
        is_admin = authenticate(line, need_admin=args.verb in ADMIN_VERBS or (args.verb == "cancel" and args.force))
        os.makedirs(jobs_dir(), exist_ok=True)
        if args.verb != "selftest":
            ensure()
        if args.verb == "submit":
            return cmd_submit(args, stdin, is_admin)
        if args.verb == "submit-raw":
            return cmd_submit_raw(args)
        if args.verb == "cancel":
            return cmd_cancel(args, is_admin)
        if args.verb == "status":
            return cmd_status(args)
        if args.verb == "list":
            return cmd_list(args)
        if args.verb == "log":
            return cmd_log(args)
        if args.verb == "fetch":
            return cmd_fetch(args)
        if args.verb == "gc":
            emit({"removed": gc()})
            return 0
        if args.verb == "ensure":
            emit({})
            return 0
        if args.verb in ("pause", "resume"):
            return cmd_pause(args, args.verb == "resume")
        if args.verb == "reorder":
            return cmd_reorder(args)
        if args.verb == "selftest":
            return cmd_selftest(args)
    except Exit as e:
        if e.msg:
            say(f"ctl: {e.msg}")
        return e.code
    return 2


if __name__ == "__main__":
    sys.exit(main())
