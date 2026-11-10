---
name: full-review
description: Run the code-reviewer, determinism-reviewer and docs-reviewer agents in parallel over the current diff against main and merge their findings into one severity-graded report. Use before handing a work package to the coordinator.
argument-hint: [base ref, default main]
allowed-tools: Bash(git diff *), Bash(git status *), Read, Grep, Glob, Agent
---

# full-review

Review the working tree against the base ref in `$ARGUMENTS` (default `main`).

## Procedure

1. Run `git diff <base> --stat` and `git status --porcelain` to classify changes: code (src, tools, config, CI), `src/core` or sim data, docs and `.claude` files.
2. In ONE message, launch the relevant agents in parallel, each told the base ref: `code-reviewer` if any code changed; `determinism-reviewer` if `src/core`, data, RNG or goldens changed; `docs-reviewer` if any markdown or `.claude` file changed. Skip an agent whose area is untouched and say so.
3. Merge results into one report grouped Blocker / Major / Minor / Nit, de-duplicated, each as `path:line - problem - fix`, tagged with the reviewing agent.
4. End with a single verdict: merge / merge after fixes / do not merge.
5. Do not edit files, commit or push. Scratch under `~/claudetmp/` only.
