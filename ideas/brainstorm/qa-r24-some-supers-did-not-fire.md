---
status: idea
added: 2026-11-14
---

# QA r24: Curomo, Fiara, Ishimi and Treenoc showed no super effect (low confidence)

After setMeter(0,3000) and KeyX, superFx() was null for these four, while Pax, Rokcore, Lavax, Morblass, Wispera and others fired. It could be a test artefact (meter or timing), so retry by hand before fixing. If real, super is unreachable for those heroes.

Also seen: intermittent 30-40 s arena load waits (ishimi, cyclonius, echo, sindarosa) while the machine was loaded; ishimi loaded fine when retried alone, so this is probably load-related.
