# Security

## Exposed credentials (owner action required)

`war/WEB-INF/user.properties` contained plaintext credentials for the legacy App Engine login filter (the app is dead).
The legacy tree was deleted from the working tree on 2026-11-10, but **the file remains in git history and in the git tag
`legacy-crafty-1.0`, and this repository is public (0 forks), so treat those credentials as compromised.** The only real
exposure is that file.

- [ ] **Owner:** change or rotate every place those credentials were reused. Rotation is what fixes the exposure.
- [x] Triage of the 40 baselined gitleaks findings: all are in old `.svn/pristine/*.svn-base` copies of vendored npm
  packages and docs (for example an RSA key block inside a spec document and an access-token-shaped string in a
  `package.json`). They are false positives.
- [x] The working tree is clean for gitleaks (run with `--redact`). `.gitleaksignore` keeps the history baseline by
  fingerprint (no values); new findings still fail the `secrets.yml` gate.
- [x] GitHub secret scanning, push protection and Dependabot security updates were enabled on 2026-11-10.
- [x] `pnpm oracle:restore` extracts the legacy tree from the tag but excludes `user.properties`, so the file is never
  written to disk by the repo tooling; `.claude/settings.json` denies reading it.

### Why history was not purged

Purging (`git filter-repo`) was deliberately not done: it rewrites every commit hash, invalidates all clones and the legacy
tag, and does not undo exposure (the credentials were public and may already be copied). Rotation is the fix.

How the scanning gates work: [docs/SECURITY-GATES.md](docs/SECURITY-GATES.md). Restoring the legacy game:
[docs/legacy/ARCHIVE.md](docs/legacy/ARCHIVE.md).

## Reporting a vulnerability

Open a private security advisory on the GitHub repository, or contact the maintainer directly. Please do not file public
issues for vulnerabilities.

## Policy for contributors and agents

Never commit `.env*`, `*.tfvars`, `*.tfstate*`, keys or credentials. Use `*.example` files with dummy values.
