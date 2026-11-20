import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { JOBS, render, varsFor } from '../../tools/ci/nightly-install';

const tmpl = readFileSync('tools/ci/launchd/dev.tte.nightly-e2e.plist.tmpl', 'utf8');

describe('nightly launchd template', () => {
  it('has no host, user path, home, IP or key (placeholders only)', () => {
    expect(tmpl).not.toMatch(/\/Users\/|\/home\/|\/opt\/|\/usr\/|\.ssh|id_(?:rsa|ed25519)|\.pem|\b\d{1,3}(?:\.\d{1,3}){3}\b|@/);
    expect(tmpl).toContain('{{REPO}}');
    expect(tmpl).toContain('{{COREPACK}}');
  });
  it('renders both jobs with every placeholder filled and XML escaped', () => {
    for (const job of JOBS) {
      const text = render(tmpl, varsFor(job, { repo: '/r', corepack: '/c/corepack', path: '/a:/b&c', home: '/h', log: '/l.log' }));
      expect(text).toContain(`<string>${job.subcommand}</string>`);
      expect(text).toContain(`<integer>${String(job.hour)}</integer>`);
      expect(text).toContain('/b&amp;c');
      expect(text).not.toMatch(/\{\{/);
    }
    expect(JOBS.map((j) => `${String(j.hour)}:${String(j.minute)}`)).toEqual(['23:0', '6:0']);
  });
  it('throws on an unfilled placeholder', () => {
    expect(() => render('{{NOPE}}', {})).toThrow(/unfilled/);
  });
});
