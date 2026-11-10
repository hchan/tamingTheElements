# ADR-0001: Phaser 4 + TS strict + Vite + Vitest + Playwright + pnpm/corepack

Status: accepted

## Context

The legacy game runs on a vendored Crafty.js, jQuery, Grunt/Gulp and NW.js, with no type checking and no automated tests.

## Decision

Rebuild on Phaser 4 (rendering/input/audio only), TypeScript in strict mode, Vite for dev and build, Vitest for unit tests, Playwright for e2e, and pnpm pinned through corepack.

## Consequences

One modern, reproducible toolchain with fast feedback. Cost: a full port, and Phaser is a large chunk that must be code-split from the initial bundle.
