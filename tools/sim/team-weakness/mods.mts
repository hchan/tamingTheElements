// Preload for what-if runs (no src edit):
//   TTE_MODS="cd:crimson-fire=15,def:crimson-fire.speed=12,hp:lavax=4500,dmg:lavax=900,life:lavax=600" \
//     tsx --import ./tools/sim/team-weakness/mods.mts <harness.mts> ...
// mutates the runtime-mutable data tables before the harness runs. cd: ARCADE_COOLDOWN_TICKS slug; def: an ability def field
// (w/h are fractions of the hero box, speed px/tick, damage, maxActive); hp:/dmg: ARCADE_RACE_NUMBERS; life: ARCADE_2V2_LIFE_PM.
// Throwaway analysis only: a real change needs a SIM_VERSION bump and re-recorded goldens/baselines.
const R = process.cwd() + '/';
const mods = (process.env['TTE_MODS'] ?? '').split(',').filter(Boolean);
const an = await import(R + 'src/core/sim/arcade-numbers.ts');
const { ABILITY_DEFS } = await import(R + 'src/core/sim/systems/projectile.ts');
for (const m of mods) {
  const [lhs, rhs] = m.split('=') as [string, string];
  const [kind, key] = lhs.split(':') as [string, string];
  const v = Number(rhs);
  if (kind === 'cd') (an.ARCADE_COOLDOWN_TICKS as Record<string, number>)[key] = v;
  else if (kind === 'hp') (an.ARCADE_RACE_NUMBERS as any)[key] = [v, an.ARCADE_RACE_NUMBERS[key][1]];
  else if (kind === 'dmg') (an.ARCADE_RACE_NUMBERS as any)[key] = [an.ARCADE_RACE_NUMBERS[key][0], v];
  else if (kind === 'life') (an.ARCADE_2V2_LIFE_PM as Record<string, number>)[key] = v;
  else if (kind === 'def') {
    const [slug, field] = key.split('.') as [string, string];
    const arr = ABILITY_DEFS as any[];
    const i = arr.findIndex((x) => x.id === slug);
    if (i < 0) throw new Error('no def ' + slug);
    arr[i] = { ...arr[i], [field]: v };
  } else throw new Error('bad mod ' + m);
}
