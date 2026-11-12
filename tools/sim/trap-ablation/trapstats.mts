// usage: tsx trapstats.ts <seeds> <aiLevel> <out.json>
import { writeFileSync } from 'node:fs';
const R = new URL('../../../', import.meta.url).pathname; // repo root
const rm = await import(R + 'tools/sim/run-match.ts');
const { collectCommands } = await import(R + 'src/core/agents/agent.ts');
const { characterId } = await import(R + 'src/core/data/ids.ts');
const { DEFAULT_SIM_FLAGS } = await import(R + 'src/core/flags.ts');
const { SIM_VERSION } = await import(R + 'src/core/index.ts');
const { createMatch } = await import(R + 'src/core/sim/match.ts');
const { step } = await import(R + 'src/core/sim/step.ts');
const { SimEventKind } = await import(R + 'src/core/sim/events.ts');
const { TRAP_BOMB_DEF, TRAP_SPIKE_DEF } = await import(R + 'src/core/sim/systems/arcade/hit.ts');

const seeds = Number(process.argv[2] ?? 8);
const aiLevel = Number(process.argv[3] ?? 3);
const RACES: string[] = rm.RACES;
const KIND = ['', 'bomb', 'puddle', 'spike', 'gust'];
const REASON = ['overlap', 'timeout', 'doused'];
const mk = (): Record<string, any> => ({ games: 0, wins: 0, placed: 0, kinds: {}, hitsBomb: 0, hitsSpike: 0, dmgBomb: 0, dmgSpike: 0, dmgTotalDealt: 0, trapKOs: 0, overlap: 0, timeout: 0, doused: 0, matchTicks: 0, matchesWithTrap: 0 });
const rows: Record<string, Record<string, any>> = Object.fromEntries(RACES.map((r) => [r, mk()]));
const placeTicks: number[] = [];
let nMatches = 0;
for (let i = 0; i < RACES.length; i++) {
  for (let j = i + 1; j < RACES.length; j++) {
    for (let k = 0; k < seeds; k++) {
      const a = RACES[i]!;
      const b = RACES[j]!;
      const aIsTeam0 = k % 2 === 0;
      const xp = rm.xpForLevel(1);
      const ra = [{ character: characterId(a), xp }];
      const rb = [{ character: characterId(b), xp }];
      const world = createMatch({ simVersion: SIM_VERSION, seed: rm.matchSeed(1, k), flags: { ...DEFAULT_SIM_FLAGS, rulesetArcade: true }, chapter: 1, difficulty: 1, p1: aIsTeam0 ? ra : rb, p2: aIsTeam0 ? rb : ra });
      const s = world.state;
      const agentA = rm.makeTeamAgent('scripted', [a], b, aIsTeam0 ? 0 : 1, aiLevel);
      const agentB = rm.makeTeamAgent('scripted', [b], a, aIsTeam0 ? 1 : 0, aiLevel);
      const strip=(g:any)=>process.env.NOTRAP?({id:g.id,observe:(v:any,k:number)=>g.observe(v,k)&~(1<<6),save:()=>g.save(),load:(x:any)=>g.load(x)}):g;
      const agents = (aIsTeam0 ? [strip(agentA), strip(agentB)] : [strip(agentB), strip(agentA)]) as any;
      const raceOfTeam = aIsTeam0 ? [a, b] : [b, a];
      const raceOfEnt = (id: number): string => raceOfTeam[s.team[id] ?? 0]!;
      let winner = -2;
      let t = 0;
      let lastChange = 0;
      let hp = [-1, -1];
      const placed = new Set<string>();
      while (t < 18000 && winner === -2) {
        const events = step(world, collectCommands(world, agents));
        t++;
        const victims: number[] = [];
        for (const e of events) {
          if (e.kind === SimEventKind.trapPlaced) {
            const rn = raceOfEnt(e.sourceId);
            const r = rows[rn]!;
            r.placed++;
            placed.add(rn);
            const kn = KIND[e['trap'] ?? 0]!;
            r.kinds[kn] = (r.kinds[kn] ?? 0) + 1;
            placeTicks.push(t);
          } else if (e.kind === SimEventKind.trapTriggered) {
            rows[raceOfEnt(e.sourceId)]![REASON[e['reason'] ?? 0]!]++;
          } else if (e.kind === SimEventKind.hitConfirmed) {
            const att = e['attacker'] ?? e.sourceId;
            const amt = e['amount'] ?? 0;
            const r = rows[raceOfEnt(att)]!;
            r.dmgTotalDealt += amt;
            if (e['ability'] === TRAP_BOMB_DEF) { r.hitsBomb++; r.dmgBomb += amt; victims.push(e['target']); }
            if (e['ability'] === TRAP_SPIKE_DEF) { r.hitsSpike++; r.dmgSpike += amt; victims.push(e['target']); }
          } else if (e.kind === SimEventKind.matchEnded) {
            winner = e['winner'] ?? -1;
          }
        }
        for (const v of victims) {
          if ((s.hp[v] ?? 1) <= 0) rows[raceOfTeam[1 - (s.team[v] ?? 0)]!]!.trapKOs++;
        }
        const now = [0, 1].map((tm) => {
          let x = 0;
          for (let id = 0; id < 64; id++) if (s.kind[id] === 0 && s.team[id] === tm) x += Math.max(0, s.hp[id] ?? 0);
          return x;
        });
        if (now[0] !== hp[0] || now[1] !== hp[1]) lastChange = t;
        hp = now;
        if (t - lastChange >= 1500) break;
      }
      nMatches++;
      for (const [r, tm] of [[a, aIsTeam0 ? 0 : 1], [b, aIsTeam0 ? 1 : 0]] as const) {
        const x = rows[r]!;
        x.games++;
        x.matchTicks += t;
        if (winner === tm) x.wins++;
        if (placed.has(r)) x.matchesWithTrap++;
      }
    }
  }
}
writeFileSync(process.argv[4]!, JSON.stringify({ nMatches, rows, placeTicks }, null, 1));
console.log('done', nMatches);
