---
status: done
added: 2026-11-14
---

# Round summary shows zeros after a flawless round (r15)

After a PERFECT K.O. the card reads DAMAGE 0 DEALT / 0 TAKEN and LONGEST COMBO 0 / 0 HITS (64-ko-3.png). The foe was set to 0 life by a test hook, so this may be an artefact: confirm with a real fight that dealt damage and combo are counted, otherwise the card looks broken.

## Done
Not a bug: a real fight (tests/e2e/round-result-real-fight.spec.ts, real Space presses next to the foe) records damage dealt and hits; the 0/0 was the hook-set KO with no hits. No code change.
