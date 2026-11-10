export const meta = {
  name: 'full-review',
  description: 'Diff review against main: domain reviewers in parallel, then one adversarial verifier per finding',
  phases: [
    { title: 'Review', detail: 'one reviewer per domain, scoped to the diff against the base ref' },
    { title: 'Verify', detail: 'one independent refutation attempt per finding' },
  ],
}

// A Workflow script has no filesystem access: it returns its result and the calling skill or session reports it.
// Args (all optional): { base: 'main', only: ['core', 'tests'] }.
const BASE = typeof args?.base === 'string' && /^[\w./-]+$/.test(args.base) ? args.base : 'main'

const DOMAINS = [
  { key: 'core', agentType: 'determinism-reviewer', scope: 'src/core/**, tools/sim/**, tools/gen/**, tests/fixtures/**' },
  { key: 'app', agentType: 'phaser-code-reviewer', scope: 'src/game/**, src/ui/**, vite.config.ts, index.html, .github/**, tools/** except sim and gen' },
  { key: 'tests', agentType: 'test-reviewer', scope: 'tests/**, **/*.test.ts, vitest.config.ts, playwright*.config.ts' },
  { key: 'balance', agentType: 'gameplay-balance-analyst', scope: 'src/core/data/**, src/core/agents/**, tests/fixtures/balance/**' },
  { key: 'parity', agentType: 'parity-verifier', scope: 'docs/PARITY.md, tests/legacy/**, docs/legacy/**' },
  { key: 'assets', agentType: 'asset-pipeline-reviewer', scope: 'tools/assets/**, public/**, src/game/assets/**, imgWorkArea/**' },
  { key: 'docs', agentType: 'docs-reviewer', scope: 'every changed *.md, CLAUDE.md, docs/**, .claude/**' },
]

const FINDINGS = {
  type: 'object',
  required: ['findings'],
  properties: {
    findings: {
      type: 'array',
      items: {
        type: 'object',
        required: ['file', 'line', 'severity', 'summary', 'detail'],
        properties: {
          file: { type: 'string' },
          line: { type: 'number' },
          severity: { type: 'string', enum: ['blocker', 'major', 'minor', 'nit'] },
          summary: { type: 'string' },
          detail: { type: 'string' },
        },
      },
    },
  },
}

const VERDICT = {
  type: 'object',
  required: ['isReal', 'reasoning'],
  properties: { isReal: { type: 'boolean' }, reasoning: { type: 'string' } },
}

const only = Array.isArray(args?.only) ? args.only : null
const domains = only ? DOMAINS.filter(d => only.includes(d.key)) : DOMAINS

phase('Review')
const perDomain = await parallel(
  domains.map(d => () =>
    agent(
      `Review ONLY the changes in \`git diff ${BASE}\` (also check \`git status --porcelain\` for untracked files) that fall in your scope: ${d.scope}. ` +
        `If nothing in the diff is in scope, return an empty findings list. Read-only; never edit, commit or push; never open war/WEB-INF/user.properties. ` +
        `Report every real defect with exact file:line and severity blocker, major, minor or nit.`,
      { label: `review:${d.key}`, phase: 'Review', agentType: d.agentType, schema: FINDINGS },
    ).then(r => (r?.findings ?? []).map(f => ({ ...f, domain: d.key }))),
  ),
)

const raw = perDomain.filter(Boolean).flat()
log(`${raw.length} raw findings - verifying each independently`)

phase('Verify')
const verified = await parallel(
  raw.map(f => () =>
    agent(
      `Adversarially verify this finding in the repo checkout. Try to REFUTE it: read the file yourself and default to isReal=false if you cannot confirm it.\n` +
        `${f.file}:${f.line} [${f.severity}] ${f.summary}\n${f.detail}`,
      { label: `verify:${f.domain}:${f.file}`, phase: 'Verify', model: 'opus', schema: VERDICT },
    ).then(v => ({ ...f, verdict: v })),
  ),
)

const order = { blocker: 0, major: 1, minor: 2, nit: 3 }
const done = verified.filter(Boolean)
const confirmed = done.filter(f => f.verdict?.isReal).sort((a, b) => order[a.severity] - order[b.severity])
const refuted = done.filter(f => f.verdict && !f.verdict.isReal)

return { base: BASE, totalRaw: raw.length, totalConfirmed: confirmed.length, totalRefuted: refuted.length, confirmed, refuted }
