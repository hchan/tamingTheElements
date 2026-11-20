import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

interface Route {
  job: string;
  placement: string;
  fallback?: string;
  note?: string;
}
const data = JSON.parse(readFileSync('tools/ci/offload-routes.json', 'utf8')) as { placements: string[]; routes: Route[] };

describe('offload-routes.json', () => {
  it('has unique jobs and known placements', () => {
    const jobs = data.routes.map((r) => r.job);
    expect(new Set(jobs).size).toBe(jobs.length);
    for (const r of data.routes) expect(data.placements).toContain(r.placement);
  });
  it('only pc-first rows have a fallback, and it is mac', () => {
    for (const r of data.routes) {
      if (r.placement === 'pc-first') expect(r.fallback).toBe('mac');
      else expect(r.fallback).toBeUndefined();
    }
  });
  it('keeps long browser jobs PC only', () => {
    const by = new Map(data.routes.map((r) => [r.job, r]));
    for (const j of ['e2e:full', 'e2e:flake', 'gate:long']) expect(by.get(j)?.placement).toBe('pc');
    expect(by.get('e2e:short')?.placement).toBe('pc-first');
    expect(by.get('gate:push')?.placement).toBe('pc-first');
  });
  it('keeps the plan routing for GPU and Mac jobs', () => {
    const by = new Map(data.routes.map((r) => [r.job, r]));
    for (const j of ['sdxl-base-1024', 'sd-turbo-20step']) expect(by.get(j)?.placement).toBe('pc');
    for (const j of ['sdxl-turbo-4step-512', 'img2img-512', 'visual', 'test:browser', 'golden:record', 'gate:commit']) {
      expect(by.get(j)?.placement).toBe('mac');
    }
  });
});
