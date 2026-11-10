# Security

## Exposed credentials (action required by the owner)

`war/WEB-INF/user.properties` contained plaintext credentials for the legacy App Engine login filter. It has been removed
from the current tree, but **it remains in git history, and this repository is public, so treat the credentials as
compromised.**

- [ ] Rotate or disable every credential that file contained (owner action).
- [ ] Decide whether to purge history (`git filter-repo`). This rewrites history and invalidates clones, so it is a separate
  decision. Rotation is what actually fixes the exposure.
- [x] The secret scanner (gitleaks) baselines the historical findings by fingerprint in `.gitleaksignore` (no values). New
  findings still fail. The baseline hides nothing from rotation: the credentials stay exposed until rotated.

How the scanning gates work: [docs/SECURITY-GATES.md](docs/SECURITY-GATES.md).

## Reporting a vulnerability

Open a private security advisory on the GitHub repository, or contact the maintainer directly. Please do not file public
issues for vulnerabilities.

## Policy for contributors and agents

Never commit `.env*`, `*.tfvars`, `*.tfstate*`, keys or credentials. Use `*.example` files with dummy values.
