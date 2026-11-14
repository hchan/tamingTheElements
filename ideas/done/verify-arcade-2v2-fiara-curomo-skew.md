---
status: done
added: 2026-11-13
---
# Arcade 2v2 skew: fiara team loses 0/16 to curomo team

Found by the night verification run on b09a15d4. `pnpm sim:match --a fiara --b curomo --team-size 2 --seeds 16 --ruleset arcade --json`
(scripted agents, partners are the next race in the list) gives winsA 0, winsB 16 (CI95 0..0.194, meanTicks 7466, all KO).
Swapping sides (`--a curomo --b fiara`) gives 16/0, so it is not side bias. The same pairing in 1v1 Arcade is 7/9, and Classic 2v2 is 8/8.
`balance:compare` only covers 1v1 Classic, so this skew is not guarded. Check whether it is the partner pairing or a tag-team rule,
and consider adding a 2v2 Arcade row to the balance baseline.

## Resolution (2026-11-14)

Not a tag-team rule and not a Fiara/Curomo imbalance: it is the harness partner pairing. `sim:match --team-size 2` gives each lead
the race half the list on, so Fiara is paired with Sindarosa (272 HP) and Curomo with Morblass, and Morblass beats Sindarosa 0/16 in
1v1 Arcade. With 32 seeds each and other partners (scripted, Arcade, 2v2): fiara+pax v curomo+pax 12/32, fiara+echo v curomo+echo 7/32,
fiara+lavax v curomo+lavax 1/32, fiara+treenoc v curomo+wispera 15/32, fiara+morblass v curomo+sindarosa 15/32, fiara+sindarosa v
curomo+morblass 0/32. A 2v2 result depends on the partners; no balance data changed. A 2v2 baseline row would need a fixed partner
policy first.
