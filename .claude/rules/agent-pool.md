---
paths:
  - ".claude/**"
---
# Agent pool Stop hook (opt-in)

`.claude/hooks/stop-agent-pool.sh` does nothing by default. The coordinator session enables it with `touch .claude/agent-pool.on` (gitignored) or by launching Claude Code with `TTE_AGENT_POOL=1`.
