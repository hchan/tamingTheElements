import re,sys,collections
for f in sys.argv[1:]:
    W=collections.defaultdict(float);G=collections.Counter();cell={}
    for l in open(f):
        m=re.match(r'(\S+) vs (\S+) \[.*?\] win ([\d.]+)%',l)
        a,b,w=m.group(1),m.group(2),float(m.group(3))
        W[a]+=w;G[a]+=1;W[b]+=100-w;G[b]+=1;cell[(a,b)]=w
    print(f, ' '.join(f"{r}:{W[r]/G[r]:.0f}" for r in sorted(W,key=lambda r:-W[r])))
    ext=sum(1 for v in cell.values() if v<=8.4 or v>=91.6); print('  extreme(<=8/>=92)',ext,'of',len(cell))
