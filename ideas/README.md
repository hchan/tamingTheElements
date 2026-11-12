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
- The **open queue** is every file that is not `done`. A repo test caps it (`tests/repo/ideas-queue.test.ts`), so finishing items comes before adding more. Raise the cap on purpose, with a reason in the commit.
- Detailed designs still belong in `docs/FUN-DESIGN.md`; an idea file links to its row.
