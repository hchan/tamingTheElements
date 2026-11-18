---
status: idea
added: 2026-11-18
---

# Smoother abilities for existing heroes, and new abilities for new heroes

Owner request (2026-11-18): abilities should feel smoother (wind-up, motion, hit and finish read as one flowing move, not stepped or abrupt) for the existing heroes, and the new heroes need new abilities of their own.

## Two parts

1. **Smoother abilities, existing heroes.** Audit each existing ability's presentation: animation frames, projectile and effect motion, easing, hit-stop, recovery. Fix the choppy ones. Render-side first; any change to sim timing (startup, active or recovery ticks) is a sim change and needs a SIM_VERSION bump, golden and balance re-record with a stated reason, and one sim agent at a time. Start from the audit style of [hero-art-audit-2026-11-15](hero-art-audit-2026-11-15.md).
2. **New abilities for new heroes.** Design and add abilities for the new heroes (roster24 and any later ones): data, sim logic, events, tests, goldens, balance, docs. Gameplay changes need design approval first; use the add-ability skill. Links: [hero-special-move-presentation-art](hero-special-move-presentation-art.md), [roster24-ability-icons-fx-weather-art](roster24-ability-icons-fx-weather-art.md), [backline-support-abilities](backline-support-abilities.md).

## Art hand-off to the GPU session

**Another session takes the art side of this idea from here and sends generation to the 4060.** That session picks up the art parts only: ability icons, effect and projectile frames, cut-in portraits, animation frames. It follows the art rules in CLAUDE.md and the owner's art feedback (sheet first, Fiara's rigged and baked look, not too cartoony, nothing released without approval).

The sim and gameplay parts (ability data, timing, AI, balance) stay with the coordinating session so the two sessions do not edit the same files. Before taking art work, the GPU session should:

- move or copy a sub-idea into `in-progress/` (`git mv`, update `status:`) and name the ability or hero it is taking, so the other session sees it is claimed;
- leave `src/core` and the asset manifest to the coordinating session unless it says why.

## Decisions (owner delegated them to the coordinating session, 2026-11-18)

The owner said "you decide". These are judgement calls from reading `docs/ABILITY-AUDIT.md` and the ability data, not measurements; the audit (step 1) may reorder them.

**Smoothness, first batch (existing heroes).** Least smooth by design, because the cast has a delay, a body move or a long recovery that is easy to read as stepped:

1. Pax Ground Shock and Curomo Ice Shock: both have a 250 ms delay before the box appears; the wind-up needs a tell that eases into the hit.
2. Durrok Tusk Gore (180 px lunge) and Vortigal Stoop (200 px dive): the lunge distance should ease out, not snap.
3. Ouroth Wyrm Coil (hold, then throw 160 px) and Abyssor Abyssal Pull (drags the foe 120 px): the foe's motion should be continuous.
4. Echo Hurricane (area follows the caster, hits every 500 ms): the pulses should read as one spin, not six separate flashes.
5. Cyclonius Tornado (0 damage, 3 s column): the column needs a grow-in and fade-out.

Render-side only in the first pass (easing, frame holds, trail and dust, hit-stop). Any startup, active or recovery tick change is a separate sim work package.

**New abilities, first heroes.** The roster24 heroes already have two abilities each, so "new" means a third, role-filling slot, designed as data plus sim, with placeholder art until the art session delivers:

- Zephra (air, ranged): Skitter has no damage, so add a short air gust that knocks the foe back out of melee range (zoning).
- Umbrel (earth, ranged): add a spore cloud that lingers as a hazard (area denial), building on the wound status.
- Glimmaw (water, ranged): add a lure that pulls the foe's next projectile off line (a trick, not damage).
- Kindrel (fire, melee): add a short dash-strike to give the bite a gap-closer.

Each needs owner design approval at design time, but the owner pre-approved design changes in CLAUDE.md ("autoapprove all changes"), so report afterwards. Split into one idea per hero when started. Placeholder numbers are estimates until `mat.sh` fits them.

## QA, how the coordinator tests this itself

See [qa-ability-smoothness-and-new-abilities](qa-ability-smoothness-and-new-abilities.md).

- Size: L (split per hero or per ability when started).
- GPU-suitable: stills, icons, cut-ins and effect frames yes; timing and sim no.
- Owner-gated: yes for art look and for new ability design.
