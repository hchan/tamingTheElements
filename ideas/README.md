# ideas/

One markdown file per idea, decision or planned work package, so the queue lives in the repo and not in anyone's memory.

Three folders say where an idea stands:

- `brainstorm/`: not started (`status: idea`, or `planned` once the owner approved it).
- `in-progress/`: being built (`status: in-progress`).
- `done/`: shipped (`status: done`); kept for history.

Move a file with `git mv` when its stage changes and update `status:` to match. Each file starts with front matter:

```
---
status: idea | planned | in-progress | done
added: YYYY-MM-DD
---
```

There is **no cap**: record every idea and todo, however many, including ones the assistant thinks of itself (owner decision 2026-11-12). `tests/repo/ideas-queue.test.ts` only checks that each status matches its folder. Detailed designs still belong in `docs/FUN-DESIGN.md`; an idea file links to its row.
