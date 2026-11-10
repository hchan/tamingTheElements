# ADR-0012: Hash router with an explicit route table (for Pages/itch iframes)

Status: accepted

## Context

Legacy calls `main[hash]()` for unknown hashes, so any hash can invoke any method, and `#constructor` throws.

## Decision

A hash router with an explicit table of route names to screens. Unknown hashes go to a not-found or home route. Hash routing works on GitHub Pages and in itch.io iframes without server rewrites.

## Consequences

Fixes the legacy bug by construction. Cost: each new screen must be registered.
