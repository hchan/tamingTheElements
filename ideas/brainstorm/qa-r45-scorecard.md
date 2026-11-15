---
status: idea
added: 2026-11-14
---

# QA r45 scorecard (HEAD bcc93350, dev server, port 7946)

Scores 0-5 vs Street Fighter / MvC (r44 was 3.5 / 3.5 / 4).
- Fun: 3.5 (=). No sim change; tag swap and super cut-ins still the highlight. Hits in the earth/fire still frames show little contact feedback (see findings).
- Graphics: 3.5 (=). Fiara remains the weakest sprite; stages and cut-ins are strong.
- Readability: 4 (=). Phone 2v2 weather label and Tour badges are fixed; the phone first-run hint still covers a band of the arena.

Covered: menu, Help, 1v1 on fire/water/earth/air, 2v2 tag swap and super, Tour pick/card/fight, phone 667x375 (menu, picker, 1v1, 2v2, help, Tour), portrait 390x844. Page errors: 0.
e2e (E2E_PORT=7945): arcade-super 4/4, first-run-hint 3/3, tour-card 3/3, touch-fight-layout 27/27 all pass.
