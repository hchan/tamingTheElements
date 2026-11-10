# Security

## Exposed credentials (action required by the owner)

`war/WEB-INF/user.properties` contained plaintext credentials for the legacy App Engine login filter. It has been removed
from the current tree, but **it remains in git history, and this repository is public, so treat the credentials as
compromised.**

- [ ] Rotate or disable every credential that file contained (owner action).
- [ ] Decide whether to purge history (`git filter-repo`). This rewrites history and invalidates clones, so it is a separate
  decision. Rotation is what actually fixes the exposure.
- [ ] The secret scanner (gitleaks) will flag the historical commits until the findings are ignored by fingerprint.

## Reporting a vulnerability

Open a private security advisory on the GitHub repository, or contact the maintainer directly. Please do not file public
issues for vulnerabilities.

## Policy for contributors and agents

Never commit `.env*`, `*.tfvars`, `*.tfstate*`, keys or credentials. Use `*.example` files with dummy values.
