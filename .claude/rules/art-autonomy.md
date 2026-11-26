---
paths:
  - "tools/assets/**"
  - "public/assets/**"
  - "ideas/**/*art*"
---
# Art autonomy (owner, 2026-11-19, permanent)

The owner delegated art decisions: "you decide with your reviewer agents", "be 100% autonomous", "you decide".

1. **Approval gate = the art-director agent** (`.claude/agents/art-director.md`), not the owner. Its `approval.json` (APPROVE: overall >= 4, no hard reject, beats shipped) is sufficient to integrate art into `public/assets/` via an in-repo `tools/` script. Do not wait for, or ask, the owner for art picks, contact-sheet sign-off, licence-use calls or method choices (SDXL-Turbo etc.); decide, record the decision in the idea file, report afterwards.
2. **Contact sheets** are still made (PIL, under `.scratch/`) and sent to the art-director; give the owner the paths in reports. Showing a sheet in chat is not required before shipping.
3. **Hard rules still apply:** full body, no human faces/hands on elementals, no text, originals beat redesigns (Fiara/Treenoc reference), roster24 hidden art stays unreleased unless the art-director approves AND the audit gate is passed, nothing under `public/` without approval.json, licences CC0/CC-BY only for third-party assets (record credits), GPU only via `pnpm gpu:*`.
4. **Commits (owner, 2026-11-19):** art-director-approved art that passed the gate and `/full-review` is committed locally (small commit, in its worktree, merged `--no-ff`) without a per-message ask; the project CLAUDE.md already authorises this. Pushes follow the normal push rule (gate:commit; gate:push is optional since 2026-11-20; the coordinator's hold while a full e2e is pending). **Still the owner's:** force-push, history rewrite, credentials, deleting legacy code or tags.
5. Run the full gate and `/full-review` on integrated art before reporting it done; then commit it (rule 4).
