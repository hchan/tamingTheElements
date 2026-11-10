# ADR-0007: DOM menus in vanilla TS, no jQuery

Status: accepted

## Context

Legacy menus are jQuery-driven HTML in one index.html with global handlers.

## Decision

Menus are DOM screens written in vanilla TypeScript under `src/ui`, each a small module, styled by one stylesheet.

## Consequences

No jQuery dependency, accessible markup, testable screens. Cost: menus are rewritten rather than ported verbatim.
