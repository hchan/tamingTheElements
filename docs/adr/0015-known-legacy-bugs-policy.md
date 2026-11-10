# ADR-0015: Known legacy bugs: reproduce for parity, lock with `it.fails`, fix on purpose (simVersion bump)

Status: accepted

## Context

Legacy has bugs (see docs/legacy/KNOWN-BUGS.md). Silent fixes would break parity and goldens.

## Decision

Characterization tests assert today's behaviour. The port reproduces sim-relevant bugs, with the correct behaviour written as `it.fails` tagged `// KNOWN-BUG:<slug>`. A fix WP flips it to `it`, bumps `SIM_VERSION` and re-records goldens. Bugs fixed by construction are marked intentional divergence.

## Consequences

Every behaviour change is deliberate and reviewable. Cost: bugs persist for a while.
