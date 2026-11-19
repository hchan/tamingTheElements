# usage: python3 fit-roster.py ITERATIONS b2|b3  (run inside the repo; writes ~/claudetmp/<batch>-fit.txt)
import re, subprocess, collections, sys, os
ROOT = subprocess.check_output(['git', 'rev-parse', '--show-toplevel'], text=True).strip()
os.chdir(ROOT)
P = 'src/core/sim/arcade-numbers.ts'
BATCHES = {
    'b2': ['brazgor', 'glimmaw', 'durrok', 'zephra'],
    'b3': ['ouroth', 'abyssor', 'vortigal', 'umbrel'],
}
H = BATCHES[sys.argv[2]]


def get():
    t = open(P).read()
    return {h: [int(x) for x in re.search(h + r': \[(\d+), (\d+)\]', t).groups()] for h in H}


def put(v):
    t = open(P).read()
    for h in H:
        t = re.sub(h + r': \[\d+, \d+\]', f'{h}: [{v[h][0]}, {v[h][1]}]', t)
    open(P, 'w').write(t)


for it in range(int(sys.argv[1])):
    out = os.path.expanduser(f'~/claudetmp/{sys.argv[2]}-fit.txt')
    subprocess.run(['bash', 'tools/sim/low-races/mat.sh', out], env={**os.environ, 'NEW': ' '.join(H)}, check=True)
    W = collections.defaultdict(list)
    for l in open(out):
        m = re.match(r'(\S+) vs (\S+) \[.*?\] win ([\d.]+)%', l)
        a, b, w = m.group(1), m.group(2), float(m.group(3))
        W[a].append(w)
        W[b].append(100 - w)
    v = get()
    line = []
    for h in H:
        avg = sum(W[h]) / len(W[h])
        line.append(f'{h}:{avg:.1f}{v[h]}')
        f = 1 + (50 - avg) / 100 * 1.2
        f = max(.7, min(1.4, f))
        r = f ** 0.5
        v[h] = [round(v[h][0] * r), round(v[h][1] * r)]
    print(it, ' '.join(line), flush=True)
    put(v)
