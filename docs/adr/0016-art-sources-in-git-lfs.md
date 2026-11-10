# ADR-0016: Art sources in Git LFS; runtime = exported PNG/atlases

Status: accepted

## Context

`imgWorkArea` holds 87 xcf files (about 122 MB) plus vsd diagrams, which bloat the repository.

## Decision

Store xcf/vsd sources in Git LFS under `art/`. The runtime loads exported PNGs and packed atlases generated from `art/png`.

## Consequences

Small clones for code-only work. Cost: collaborators need LFS installed and there is a quota.
