import { abilityId } from './ids';
import { msToTicks, type AbilityDef, type AbilityKind } from './types';

/** Legacy w/h pixel sizes are expressed as fractions of this tile size. */
const TILE = 80;

type Row = readonly [
  slug: string,
  kind: AbilityKind,
  sprite: string,
  damage: number,
  cooldownMs: number,
  maxActive: number,
  speed: number,
  wPx: number,
  hPx: number,
  durationMs?: number,
];

// Legacy "Capture" damage is Number.MAX_VALUE (kills anything it hits), kept verbatim.
const ROWS: readonly Row[] = [
  ['capture', 'capture', 'capture', Number.MAX_VALUE, 5000, 1, 8, 40, 40],
  ['wind-cone', 'range', 'windCone', 13, 400, 4, 8, 25, 10],
  ['tornado', 'range', 'tornado', 0, 6000, 1, 8, 20, 60, 3000],
  ['stick', 'range', 'stick', 10, 2000, 1, 8, 25, 10],
  ['fire-blast', 'range', 'fireBlast', 40, 600, 2, 8, 75, 15],
  ['icicles', 'range', 'icicles', 10, 300, 3, 10, 10, 25],
  ['hurl-rock', 'range', 'hurlRock', 40, 500, 2, 8, 35, 35],
  ['sonar-blast', 'range', 'sonarBlast', 40, 600, 2, 8, 20, 20],
  ['fireball', 'range', 'fireball', 15, 600, 2, 8, 25, 12],
  ['crimson-fire', 'range', 'crimsonFire', 13, 400, 2, 10, 80, 40],
  ['rock-pellet', 'range', 'rockPellet', 20, 400, 3, 9, 40, 10],
  ['slime-blast', 'range', 'slimeBlast', 10, 1500, 3, 8, 40, 20],
  ['shards-of-ice', 'omni', 'shardsOfIce', 20, 10000, 8, 10, 40, 10],
  ['circus-of-slime', 'omni', 'circusOfSlimeIcon', 16, 10000, 4, 5, 40, 20],
  ['chaos-bolt', 'range', 'chaosBolt', 40, 600, 3, 10, 75, 15],
  ['chaos-orb', 'range', 'chaosOrb', 140, 5000, 1, 2, 75, 75],
  ['elemental-advantage-fire-cone', 'range', 'fireCone', 80, 1000, 3, 8, 100, 80, 3000],
];

function toDef([slug, kind, sprite, damage, cooldownMs, maxActive, speed, wPx, hPx, durationMs]: Row): AbilityDef {
  return {
    id: abilityId(slug),
    kind,
    sprite,
    damage,
    speed,
    w: wPx / TILE,
    h: hPx / TILE,
    maxActive,
    cooldownMs,
    cooldownTicks: msToTicks(cooldownMs),
    ...(durationMs === undefined ? {} : { durationMs, durationTicks: msToTicks(durationMs) }),
  };
}

/** Range and omni-directional abilities (set A), in legacy rangeAbilities order. */
export const ABILITIES_A: readonly AbilityDef[] = ROWS.map(toDef);
