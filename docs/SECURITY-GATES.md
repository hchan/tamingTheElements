# Security and quality gates

| Gate | Workflow | Blocking | Notes |
|---|---|---|---|
| CodeQL (`javascript-typescript`, `security-and-quality`) | `codeql.yml` | Report in Security tab | push to main, PRs, weekly. Scans `src`, `tools`, `tests`. Only the analyze job has `security-events: write`. |
| Secret scan (gitleaks 8.30.1, pinned binary + sha256) | `secrets.yml` | Yes | Full history and working tree, always `--redact`. |
| Dependency audit (`pnpm audit --prod`, OSV-Scanner on the lockfile) | `osv.yml` | No (`continue-on-error`) | Lockfile PRs, main, nightly. |
| Coverage floors for `src/core` | `ci.yml` job `coverage` | Yes | `pnpm test:coverage`; report uploaded as artifact `coverage-report`. |
| SBOM (CycloneDX, production deps) | `sbom.yml` | No | Weekly, on release, manual. Artifact `sbom-cyclonedx`. Local: `pnpm sbom`. |

## Secret scan baseline

Git history contains plaintext credentials for the legacy login filter (see [SECURITY.md](../SECURITY.md)). They are
baselined in `.gitleaksignore` by fingerprint (`commit:file:rule:line`, no values) so the scan is green today but fails on
any new finding in new commits or in the tree. Rules:

- Never add a fingerprint for a new finding. Remove the secret and rotate it instead.
- Never print scanner output without `--redact`, and never paste raw reports.
- Regenerating the baseline: run `gitleaks git --redact --report-format json --report-path <scratch file>` and copy only the
  `Fingerprint` field.

## Dependency audit policy

Non-blocking while the lockfile is young. Triage findings in the run summary: high or critical in a production dependency
that is reachable gets a fix or pin within 7 days; otherwise note it in the PR. Move the job to blocking (remove
`continue-on-error`) once a clean run is the norm.

## Coverage policy

Thresholds live in `vitest.config.ts` (`coverage.thresholds`), scoped to `src/core/**`. Floors are the measured value minus
about 3 points: lines 92 (measured 95.5), statements 91 (94.0), functions 91 (94.9), branches 69 (72.9). Raise them when
coverage improves; lowering needs a stated reason in the PR.

## Repository settings (owner steps, not done by these workflows)

Enable code scanning and private vulnerability reporting, and require the `Secrets`, `CodeQL` and `CI` checks on `main`.
