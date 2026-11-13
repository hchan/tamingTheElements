---
status: in-progress
added: 2026-11-13
---

# Arcade balance after Cleanse and the 2v2 time-over fix

Measured at SIM_VERSION 48: Arcade 1v1 tournament (16 seeds) is 43.8-53.4 percent (Cyclonius lowest, inside 40-60), so no 1v1 change.
Arcade 2v2 tournament (8 seeds, fixed partner teams: curomo+morblass, cyclonius+pax, echo+rokcore, fiara+sindarosa, ishimi+treenoc,
lavax+wispera) was 26.1-70.5 percent: the partner is the race half the list on, so a race's rate is its team's rate.

SIM_VERSION 49: data-only `ARCADE_2V2_LIFE_PM` retune (team-level pass with a damped log factor, then a per-race pass). Now 42.0-58.0 percent
(8-seed noise is about 5 pp). Fun report 2v2: time over 1.8 percent, round median 77.6 s, every band ok.

Next (optional): a 16-seed 2v2 run to separate noise from the remaining Morblass (42.0) and Fiara/Lavax (58.0) skew.
