---
status: epic
added: 2026-11-16
---

# Epic: Ability, effect, weather and terrain art

Hit/ability effects, telegraphs, status animation, weather, arena tiles, traps and idle auras.

- Suggested order: Telegraph and hazard readability first (ability-telegraphs, fire/earth telegraphs, trap decal), then status and CC animation, then arenas and floor tags, then weather, then idle auras and dynamic weather.
- Size: XL overall; members are S to M.
- Dependencies: Phaser 4 skills (node_modules/phaser/skills); coordinate with the art-and-presentation epic (effect batches).
- Owner-gated: Art direction: owner found some recent fx too cartoony; dark fantasy means medieval (a genre, not a shade). Show real-game screenshots before calling done.

Member ideas, in suggested priority order (work them as separate small work packages):

- [ability-telegraphs](../in-progress/ability-telegraphs.md) (in progress): Show the danger zone of big abilities. Follow-up from ability-audit (static graphics pass, docs/ABILITY-AUDIT.md).
- [qa-r22-fire-earth-telegraph-still-weak](../brainstorm/qa-r22-fire-earth-telegraph-still-weak.md): Fire and earth hazard telegraphs still weak. Fire lightning warn marks (d-fire-d-hazard-warn.png) are thin orange squiggles with a tiny triangle on an orange lava floor, and read as decoration, n
- [trap-decal-edge-cut](../brainstorm/trap-decal-edge-cut.md): Trap decal is cut at the arena edge. A Spike trap decal placed near a wall is clipped by the arena edge (seen in WALL-3a screenshots).
- [shards-of-ice-no-hits](../brainstorm/shards-of-ice-no-hits.md): Curomo Shards of Ice scores no hits. pnpm ability:usage shows Curomo's slot 1 (shards-of-ice, omni) cast 175 times (2 seeds x 66 pairings) with 0 hitConfirmed events and 3% uptime, while 
- [buff-debuff-animation](../in-progress/buff-debuff-animation.md) (in progress): Better animation for buffs and debuffs, on the heroes and on the HUD. Owner request (2026-11-13): "I need better animation on the buffs and debuffs on the heroes and on the HUD."
- [crowd-control-animations](../in-progress/crowd-control-animations.md) (in progress): Crowd-control animations (dazed, snagged, iced, ...) and matching abilities. Owner idea (2026-11-14): the opponent needs a visible animation when dazed, snagged, iced and so on, and we should create the corresponding abilities.
- [pseudo-3d-ability-and-status-animations](../in-progress/pseudo-3d-ability-and-status-animations.md) (in progress): Pseudo-3D animations for abilities, specials and status effects. Owner, 2026-11-15: "maybe we can have SOME 3d ...
- [glow-aura-y-anchor](../brainstorm/glow-aura-y-anchor.md): Glow and aura y anchor. WALL-3a re-centred glow and aura on the drawn body in x only (Q11 decision);
- [pose-vfx-anchor-k2](../brainstorm/pose-vfx-anchor-k2.md): Pose VFX anchors at k=2. Pose-layer effects anchor on sim coordinates, not the k=2 fit box.
- [floor-tags-1](../in-progress/floor-tags-1.md) (in progress): FLOOR-TAGS-1: floor chips stay whole and off heads. Source: ideas/brainstorm/qa-r73-findings.md item 3 (chips such as "WATER +HP" cut off at the view edge or hidden under a drawn head).
- [own-element-tile-effects](../in-progress/own-element-tile-effects.md) (in progress): Hero standing on a tile of its own element. Owner request (2026-11-13): when a hero stands on a stage patch of its own element, show an animation, and one for each element:
- [grim-arena-environments](../in-progress/grim-arena-environments.md) (in progress): Grim arena environments (floor, props, atmosphere). Owner feedback on a real screenshot: the arena was a flat muddy-brown grid with random cracks, the rocks were brick boxes with text labels, and
- [tilemap-environments](../in-progress/tilemap-environments.md) (in progress): Randomised tilemap environments. Fire, water, air, earth arenas as seeded tile maps with better art.
- [qa-arena-art-and-stage-choice](../brainstorm/qa-arena-art-and-stage-choice.md): QA: arena art is flat and terrain labels read as UI stickers. Floors are repeated brick or water tiles with a silhouette crowd, no depth, lighting or parallax.
- [weather-particle-art](../in-progress/weather-particle-art.md) (in progress): Weather particle art pass (view only). Per element weather (Sun, Rain, Sandstorm, Gale) three grim, desaturated, textured Phaser 4 particle layers (haze behind, flecks in front) over four g
- [dynamic-weather-during-match](../brainstorm/dynamic-weather-during-match.md): Dynamic weather that changes during a match. Goal: weather that changes mid-match per element arena:
- [element-gems-powerups](../brainstorm/element-gems-powerups.md): Element gems and random power-ups. Owner idea (2026-11-14). Each element stage holds 3 gems, scattered at random on the map.
- [idle-element-auras](../brainstorm/idle-element-auras.md): Idle animation and element auras for every hero. Owner idea (2026-11-14): even when standing still, every elemental should animate, and each hero should have its own animation.
- [idle-echo-afterimage](../brainstorm/idle-echo-afterimage.md): Echo idle afterimage (IA3 remainder). IA3 (idle motifs in the pose layer) merged without Echo's afterimage.
