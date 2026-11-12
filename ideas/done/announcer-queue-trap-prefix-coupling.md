---
status: done
added: 2026-11-12
---
# Announcer: trap-line eviction keys off `key.startsWith('trap')`; setTouchText cache can go stale

Low severity, first-pass review of c30bb99 (`src/game/a11y/announcer.ts` ~line 150, `src/game/app/touch-controls.ts` `written` WeakMap).

- `Announcer.say` evicts "trap chatter" with `q.key.startsWith('trap')`. Any future non-trap key beginning with `trap` is evicted first, and
  trap keys are built by string template in `trapAnnouncement`; nothing ties the two. Add a `kind`/`low: true` field on `Announcement` (set in
  `trapAnnouncement`) and evict on that. The new test uses hand-written `trapMine1Placed` keys, so it would still pass if `trapAnnouncement`
  renamed its keys: add one that routes real `announcementsFor(trapPlaced...)` output through a full queue.
- `setTouchText` skips the write when `written.get(b) === shown`. If anything else rewrites `b.textContent` (a test, a future i18n pass,
  a screen-reader-driven re-render), the cache says "unchanged" and the label never recovers. Compare against `b.textContent` instead, or
  keep the cache but invalidate when `b.textContent !== written.get(b)`.
