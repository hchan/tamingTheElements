import { describe, expect, it } from 'vitest';
import { mergeIndex, planJobs } from '../../tools/assets/splash-gen/integrate';

const ok = { approved: 'bd_plate_fire_r2_45153_1536x640.png', reviewer: 'art-director', date: '2026-11-19', beats_shipped: true };
const yes = () => true;

describe('splash integrate', () => {
  it('plans a job per approval with slot, element, url and size', () => {
    const [j] = planJobs({ bd_plate_fire: ok }, '/x', yes);
    expect(j).toMatchObject({ slot: 'plate', element: 'fire', url: 'img/splash/plate-fire.webp', width: 1536, height: 640 });
    expect(j?.src).toBe('/x/bd_plate_fire_r2_45153_1536x640.png');
  });
  it('refuses empty, unapproved, mismatched or missing input', () => {
    expect(() => planJobs({}, '/x', yes)).toThrow(/no entries/);
    expect(() => planJobs({ bd_plate_fire: { ...ok, reviewer: 'me' } }, '/x', yes)).toThrow(/art-director/);
    expect(() => planJobs({ bd_plate_fire: { ...ok, beats_shipped: false } }, '/x', yes)).toThrow(/beats_shipped/);
    expect(() => planJobs({ bd_plate_water: ok }, '/x', yes)).toThrow(/naming/);
    expect(() => planJobs({ team: { elements_ok: {} } }, '/x', yes)).toThrow(/unsupported/);
    expect(() => planJobs({ bd_plate_fire: ok }, '/x', () => false)).toThrow(/not found/);
  });
  it('merges sorted and keeps earlier batches', () => {
    const jobs = planJobs({ bd_plate_fire: ok }, '/x', yes);
    const merged = mergeIndex({ win: { earth: 'img/splash/win-earth.webp' }, plate: { air: 'img/splash/plate-air.webp' } }, jobs);
    expect(JSON.stringify(merged)).toBe('{"plate":{"air":"img/splash/plate-air.webp","fire":"img/splash/plate-fire.webp"},"win":{"earth":"img/splash/win-earth.webp"}}');
  });
});

describe('splash index on disk', () => {
  it('lists exactly the webp files present and each exists', async () => {
    const { readdirSync, readFileSync, existsSync } = await import('node:fs');
    const dir = 'public/assets/img/splash';
    const idx = JSON.parse(readFileSync(`${dir}/splash.json`, 'utf8')) as Record<string, Record<string, string>>;
    const listed = Object.values(idx).flatMap((m) => Object.values(m)).sort();
    for (const u of listed) expect(existsSync(`public/assets/${u}`), u).toBe(true);
    const onDisk = readdirSync(dir).filter((f) => f.endsWith('.webp')).map((f) => `img/splash/${f}`).sort();
    expect(listed).toEqual(onDisk);
  });
  it('ships its approval record', async () => {
    const { readFileSync } = await import('node:fs');
    const a = JSON.parse(readFileSync('tools/assets/splash-gen/provenance/approval.json', 'utf8')) as Record<string, { reviewer: string }>;
    for (const v of Object.values(a)) expect(v.reviewer).toBe('art-director');
  });
});
