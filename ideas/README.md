# ideas/

One markdown file per idea, decision or planned work package, so the queue lives in the repo and not in anyone's memory.

Each file starts with front matter:

```
---
status: idea | planned | in-progress | done
added: YYYY-MM-DD
---
```

- `idea`: not decided. `planned`: owner-approved, not started. `in-progress`: being built. `done`: shipped (keep it for history, or delete it).
- The **open queue** is every file that is not `done`. There is **no cap**: record every idea and todo, however many (owner decision 2026-11-12). A repo test only checks each file has a valid status.
- Detailed designs still belong in `docs/FUN-DESIGN.md`; an idea file links to its row.
