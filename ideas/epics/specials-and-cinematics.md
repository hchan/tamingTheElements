---
status: epic
added: 2026-11-16
---

# Epic: Specials, supers and cinematics

Super moves, banners, KO punch-in, slot-3 signature specials and per-hero kits.

- Suggested order: Fix supers that whiff or do not fire (r24, r71), then banner/cinematic readability, then slot-3 signature moves (one per hero), then special-move presentation art.
- Size: XL (12 signature moves, each M with sim, goldens and balance).
- Dependencies: add-ability skill; effects art epic for visuals.
- Owner-gated: Gameplay changes need design approval (pre-approved by the owner in general; report afterwards).

Member ideas, in suggested priority order (work them as separate small work packages):

- [qa-r24-some-supers-did-not-fire](../brainstorm/qa-r24-some-supers-did-not-fire.md): QA r24: Curomo, Fiara, Ishimi and Treenoc showed no super effect (low confidence). After setMeter(0,3000) and KeyX, superFx() was null for these four, while Pax, Rokcore, Lavax, Morblass, Wispera and others fired.
- [qa-r71-rokcore-super-whiffs](../brainstorm/qa-r71-rokcore-super-whiffs.md): QA r71: Rokcore's super whiffs at range. Rokcore's super can miss a foe standing at range, so the full meter is spent for nothing.
- [qa-r3-super-cinematic-hides-action](../brainstorm/qa-r3-super-cinematic-hides-action.md): Super cinematic dims the stage, hides the foe and shows the wrong portrait. Fix: dim less, keep both fighters lit, use the caster's portrait, SF-style freeze and zoom on the pair.
- [qa-r26-super-banner-portrait-box](../brainstorm/qa-r26-super-banner-portrait-box.md): QA r26: super banner shows hero portrait in a hard black square; payoff reads small. Repro: hero=fiara&foe=rokcore, place heroes, step(1,1<<13,0), stepLive 6 and 20.
- [qa-r33-super-glow-subtle](../brainstorm/qa-r33-super-glow-subtle.md): SUPER-ready slot glow works but is subtle. The gold border on slot 9 is visible beside the dimmed Charge and Weather slots, a clear improvement.
- [qa-r19-ko-punch-in-not-visible-in-shots](../brainstorm/qa-r19-ko-punch-in-not-visible-in-shots.md): KO camera punch-in not visible in the seek frames (r19). The r17 punch-in fix landed (ko-fx-shot passes) but the shockSeek frames at 60/200/400 show the same framing as before the KO:
- [super-air-1](../in-progress/super-air-1.md) (in progress): SUPER-AIR-1: super title contrast at the cut-out. QA r73 item 4: the pale Air super name faded with the band, and its dark rim faded with it, so it read about 1.1:1 over the pale Air floor.
- [hero-special-move-presentation-art](../brainstorm/hero-special-move-presentation-art.md): Unique special (super) move presentation art per hero. Goal: for all 24 heroes (12 originals + 12 roster24) a unique special/super presentation:
- [action-bar-rethink-hero-kits](../brainstorm/action-bar-rethink-hero-kits.md): Rethink the action bar: common slots plus a per-hero kit with a signature trap or minion (HIGH PRIORITY, TONS of work). Owner request (2026-11-13): "your action bars still need rethinking ...
- [signature-slot3-fiara](../brainstorm/signature-slot3-fiara.md): Fiara slot 3: Ember Moth (minion, fire). Part of action-bar-rethink-hero-kits; design row in docs/design/signature-traps.md.
- [signature-slot3-treenoc](../brainstorm/signature-slot3-treenoc.md): Treenoc slot 3: Gnarlroot (minion, earth). Part of action-bar-rethink-hero-kits; design row in docs/design/signature-traps.md.
- [signature-slot3-cyclonius](../brainstorm/signature-slot3-cyclonius.md): Cyclonius slot 3: Dust Devil (minion, air). Part of action-bar-rethink-hero-kits; design row in docs/design/signature-traps.md.
- [signature-slot3-wispera](../brainstorm/signature-slot3-wispera.md): Wispera slot 3: Mote Swarm (minion, air). Part of action-bar-rethink-hero-kits; design row in docs/design/signature-traps.md.
- [signature-slot3-lavax](../brainstorm/signature-slot3-lavax.md): Lavax slot 3: Magma Vent (trap, fire). Part of action-bar-rethink-hero-kits; design row in docs/design/signature-traps.md.
- [signature-slot3-pax](../brainstorm/signature-slot3-pax.md): Pax slot 3: Grave Tusks (trap, earth). Part of action-bar-rethink-hero-kits; design row in docs/design/signature-traps.md.
- [signature-slot3-echo](../brainstorm/signature-slot3-echo.md): Echo slot 3: Resonance Chime (trap, air). Part of action-bar-rethink-hero-kits; design row in docs/design/signature-traps.md.
- [signature-slot3-curomo](../brainstorm/signature-slot3-curomo.md): Curomo slot 3: Brine Leech (minion, water). Part of action-bar-rethink-hero-kits; design row in docs/design/signature-traps.md.
- [signature-slot3-ishimi](../brainstorm/signature-slot3-ishimi.md): Ishimi slot 3: Bloat Slime (trap, water). Part of action-bar-rethink-hero-kits; design row in docs/design/signature-traps.md.
- [signature-slot3-morblass](../brainstorm/signature-slot3-morblass.md): Morblass slot 3: Rime Urchin (trap, water). Part of action-bar-rethink-hero-kits; design row in docs/design/signature-traps.md.
- [signature-slot3-rokcore](../brainstorm/signature-slot3-rokcore.md): Rokcore slot 3: Stone Husk (minion, earth). Part of action-bar-rethink-hero-kits; design row in docs/design/signature-traps.md.
- [signature-slot3-sindarosa](../brainstorm/signature-slot3-sindarosa.md): Sindarosa slot 3: Ashen Maw (trap, fire). Part of action-bar-rethink-hero-kits; design row in docs/design/signature-traps.md.
