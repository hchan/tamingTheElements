---
status: epic
added: 2026-11-12
---

# Epic: Balance and AI

Race and team balance findings, trap and Snag AI, tuning.

Member ideas (all in [../brainstorm/](../brainstorm/) unless moved; work them as one theme, in separate small work packages):

- [balance-outliers](../brainstorm/balance-outliers.md)
- [lavax-morblass-and-team-findings](../brainstorm/lavax-morblass-and-team-findings.md)
- [lavax-team-weakness](../brainstorm/lavax-team-weakness.md)
- [wispera-team-dominance](../done/wispera-team-dominance.md)
- [team-pair-synergy-more-seeds](../brainstorm/team-pair-synergy-more-seeds.md)
- [team-harness-random-partners](../brainstorm/team-harness-random-partners.md)
- [trap-balance-findings](../brainstorm/trap-balance-findings.md)
- [snag-trap-ai-combo](../brainstorm/snag-trap-ai-combo.md)
- [snag-trap-and-team-modes-findings](../brainstorm/snag-trap-and-team-modes-findings.md)
- [ai-trap-use](../done/ai-trap-use.md)
- [ai-tuning-more](../in-progress/ai-tuning-more.md)
- [tornado-combo-ai](../brainstorm/tornado-combo-ai.md)
- [arcade-low-races-analysis](../brainstorm/arcade-low-races-analysis.md)
- [arcade-stalemate-lavax-ishimi](../done/arcade-stalemate-lavax-ishimi.md)
- [classic-sindarosa-ishimi-gap](../brainstorm/classic-sindarosa-ishimi-gap.md)
- [super-damage-share](../brainstorm/super-damage-share.md)
- [ability-audit](../in-progress/ability-audit.md)
- [ability-usage-metrics](../done/ability-usage-metrics.md)
- [dead-ability-cleanup](../done/dead-ability-cleanup.md)
- [ice-blast-rework](../brainstorm/ice-blast-rework.md)
- [fire-heal-buff](../brainstorm/fire-heal-buff.md)
- [control-streak-8s-investigation](../brainstorm/control-streak-8s-investigation.md)

## Bundles (2026-11-17)

Groups of ideas that touch the same files, so one agent can take the whole bundle. Flags: SIM = sim-changing (needs an Opus plan, a SIM_VERSION bump and a golden re-record with a stated reason, one sim bundle at a time); OWNER-GATED = wait for the owner; PC = heavy generation, balance or e2e work can run on the GPU PC; needs browser/e2e = run Playwright (headless) before calling it done.

### BA-1 Team synergy harness and findings

- Members: [team-pair-synergy-more-seeds](../brainstorm/team-pair-synergy-more-seeds.md), [team-harness-random-partners](../brainstorm/team-harness-random-partners.md), [lavax-morblass-and-team-findings](../brainstorm/lavax-morblass-and-team-findings.md), [lavax-team-weakness](../brainstorm/lavax-team-weakness.md)
- Size: M
- Shared files: tools/sim/*, tests/ (harness only)
- Flags: PC-offloadable; not sim-changing until a data tweak follows (that tweak is a separate SIM bundle)
- Parallel: Parallel with everything.

### BA-2 Trap, snag and tornado AI

- Members: [trap-balance-findings](../brainstorm/trap-balance-findings.md), [snag-trap-ai-combo](../brainstorm/snag-trap-ai-combo.md), [snag-trap-and-team-modes-findings](../brainstorm/snag-trap-and-team-modes-findings.md), [tornado-combo-ai](../brainstorm/tornado-combo-ai.md), [ai-tuning-more](../in-progress/ai-tuning-more.md)
- Size: M
- Shared files: src/core/agents/*
- Flags: SIM, PC
- Parallel: Serial with AB-1 and AB-2.

### BA-3 Race outliers and super damage share

- Members: [balance-outliers](../brainstorm/balance-outliers.md), [arcade-low-races-analysis](../brainstorm/arcade-low-races-analysis.md), [classic-sindarosa-ishimi-gap](../brainstorm/classic-sindarosa-ishimi-gap.md), [super-damage-share](../brainstorm/super-damage-share.md)
- Size: M
- Shared files: src/core/sim/*, src/core/data/*, goldens, tests/fixtures/balance/baseline.json
- Flags: SIM, PC
- Parallel: Serial with every SIM bundle.

### BA-4 Ability rework candidates

- Members: [ice-blast-rework](../brainstorm/ice-blast-rework.md), [fire-heal-buff](../brainstorm/fire-heal-buff.md), [ability-audit](../in-progress/ability-audit.md), [control-streak-8s-investigation](../brainstorm/control-streak-8s-investigation.md)
- Size: M
- Shared files: src/core/data/abilities*, src/core/sim/*
- Flags: SIM, PC. The control-streak investigation is read-only first
- Parallel: Serial with every SIM bundle.
