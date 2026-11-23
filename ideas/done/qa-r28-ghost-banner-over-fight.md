---
status: done
added: 2026-11-14
---

# QA r28: faded ROOTED/ENTER text ghosts over the FIGHT! banner

mark-fiara-1.png, mark-cyclonius-1.png, mark-curomo-1.png and mark-void-1.png (4 runs): faded "ROOTED" and "...NTER" floaters sit on the FIGHT! banner and read as "ROOTEDNTER". Seen under manual=1 stepping, so a stepping artifact is possible, but the banner-lane fix may not cover this floater layer. The top-left SNAGGED and STUN chips also appear doubled at the start of the fight.

Progress 2026-11-14: closed as a harness artifact. The QA script (manual=1) teleports both fighters to the arena centre with place() as the round starts, so the real Snag ROOTED and counter floaters (which spawn at the fighters) sit under the centre FIGHT! banner; the early SNAGGED/STUN chips come from stepping 100 ticks with forced inputs. In normal play fighters start at opposite sides. No code change.

Verified 2026-11-22 on main with real-game headless screenshots in .scratch/shots (r25-tour-win, r27-ko-20, r28-fight-snag-2).
