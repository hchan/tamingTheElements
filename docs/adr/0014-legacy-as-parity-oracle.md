# ADR-0014: Legacy as parity oracle; aggressive gated retirement

Status: accepted

## Context

The legacy game is the only definition of correct behaviour, but it carries 7k vendored files and a credentials file.

## Decision

Tag `legacy-crafty-1.0` first. Keep legacy runnable as the oracle until parity sign-off. Each retirement is its own branch listing exactly the deleted paths and needs explicit user approval.

## Consequences

Safe, recoverable cleanup. Cost: the old code lingers until sign-off.
