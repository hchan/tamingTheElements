---
status: idea
added: 2026-11-13
---
# Arcade 2v2 skew: fiara team loses 0/16 to curomo team

Found by the night verification run on b09a15d4. `pnpm sim:match --a fiara --b curomo --team-size 2 --seeds 16 --ruleset arcade --json`
(scripted agents, partners are the next race in the list) gives winsA 0, winsB 16 (CI95 0..0.194, meanTicks 7466, all KO).
Swapping sides (`--a curomo --b fiara`) gives 16/0, so it is not side bias. The same pairing in 1v1 Arcade is 7/9, and Classic 2v2 is 8/8.
`balance:compare` only covers 1v1 Classic, so this skew is not guarded. Check whether it is the partner pairing or a tag-team rule,
and consider adding a 2v2 Arcade row to the balance baseline.
