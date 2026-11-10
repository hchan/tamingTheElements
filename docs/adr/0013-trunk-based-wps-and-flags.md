# ADR-0013: Trunk-based WPs and typed default-off flags; sim flags in the replay header

Status: accepted

## Context

Work is split into many small work packages that must merge without breaking main.

## Decision

Short-lived branches merge to main (see docs/BRANCHING.md). Unfinished features sit behind typed flags that default to off. Flags that affect the sim are recorded in the replay header.

## Consequences

Main stays releasable and replays stay reproducible. Cost: flag hygiene and removal work.
