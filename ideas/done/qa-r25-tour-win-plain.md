---
status: done
added: 2026-11-14
---

# Tour win screen is plain text with no payoff

Seeding `tte.tour.v1` to `{v:1,seed:7,hero:[curomo,pax,wispera],stage:8,continues:3,status:'won'}` and opening `#play` reloads as the team picker, not a win screen. Winning the final stage live gives a text-only result. There is no victory art, no run summary (time, continues used, KOs), no unlock and no clear next step. After nine stages this is a flat finish.

Also unverified: whether a "Play again" button exists after a live win. A saved 'won' run does not show it.

Idea: a short victory scene with the team, run stats, a title card, and clear Play again / Menu buttons. A saved 'won' run should reopen the same screen.
