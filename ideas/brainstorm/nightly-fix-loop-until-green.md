---
status: idea
added: 2026-11-26
---

# Nightly fix loop: keep going until no e2e errors (owner 2026-11-26: "it should")

Today (`tools/ci/nightly-fix.ts`, docs/TESTING.md "nightly fix"): at most 3 headless Sonnet rounds per failure (`MAX_VERIFY_ROUNDS`), more than `MAX_REAL_REDS` real reds = needs-human with no rounds, hard stop 07:00. The owner wants the 02:00 job to keep fixing until the e2e is clean, then push.

Plan (split agents: code+tests, docs, a dry-run check; no sim change, no browser run needed to build):
- Replace the per-failure round cap and the verify-round cap with: loop until every real red is green on the merged commit and `gate:commit` passes, or the 07:00 hard stop. Keep the 07:00 stop.
- Remove the "more than MAX_REAL_REDS = needs-human, no rounds" shortcut; work the reds in order (P0/P1 first), one at a time.
- Guards that stay (cost and safety, not a round count): `--max-budget-usd` per round, a per-night spend cap (suggest a constant in one module, tests import it), no-progress stop (same diff or same first error twice in a row stops that failure as needs-human), the weak-fix rejection (skip/fixme/only/retries), no push on a red gate or an incomplete night, and push exactly the verified merged sha (no force).
- Update docs/TESTING.md (the cap text; also the stale "01:00" LaunchAgent time: the installed collect job runs at 02:00) and CLAUDE.md "Fix means verified" (cap 3 stays for interactive loops; the nightly loops to 07:00).
- Tests: `tools/ci` nightly-fix unit tests pin the old caps; update them and add one for no-progress stop and one for the 07:00 stop (injected clock).
- Verify with `pnpm nightly:fix --dry-run` (prints prompts and commands, launches nothing).
