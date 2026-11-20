# Ability icons

Six 64 px ability icons for abilities that had none: hurl_rock, lure_orb, skitter, slow, hoof_crash, talon_rake.

- Source: OpenGameArt "Painterly Spell Icons" parts 1-4 by J. W. Bjerk (eleazzaar), used under **CC-BY 3.0** (credit required, changes allowed).
  Attribution: `J. W. Bjerk (eleazzaar) -- www.jwbjerk.com/art -- find this and other open art at: http://opengameart.org`.
- Zip sha256: part1 `3b1516d8aed8eae8b46bbfe1581e823764157b66c962cd357c5d617b1b62d5b9`, part2 `814ec8056f3fbbd3bde69c5b347cda3e687e278dadf9c4550f11e689cad07f43`,
  part3 `24298cd13a1b48b899b6aab206735b54b2e7a14a4bd49e383cc4963c4643a81c`, part4 `bf0d20e6f3f8f427243d36a3178d76b866ebae1c32aa88d5540a61c76d8bdc79`.
- `adapt.py` (regrade: mute, vignette, grain, bronze border), `build-ability-icons.py` (4 candidates per slot), `install-ability-icons.py` (approved pick to `public/assets/img/hud/ability-icons/`, with `index.json` sha256 and `CREDITS.txt`).
- Approval: art-director, 2026-11-19, `beats_shipped: true`, picks rock-orange-3, light-eerie-3, haste-sky-3, fog-sky-3, wild-orange-3, slice-orange-3 (the approval record is committed as `provenance/approval.json`).
- Not wired to the HUD yet: ability slots draw the character sprite, and `hud:actions` (`src/game/hud/action-bar.ts`) has no per-ability cells. The in-game credits line is still to add.
- Pack pages: https://opengameart.org/content/painterly-spell-icons-part-1 (and -part-2, -part-3, -part-4). Licence: http://creativecommons.org/licenses/by/3.0/
- Run order (numpy and Pillow; the zips go in `<free-art>/oga-painterly-spell-icons/extracted/part1..4`): `python3 -I adapt.py <free-art> --regrade`, `build-ability-icons.py <free-art>`, then `install-ability-icons.py <free-art>/trackA <approval.json> [--check]` (`--check` is a dry run).
- These are generic UI icons, outside the roster24 hero-art gate. Do not wire them to the HUD before the CC-BY credit line is added to `src/ui/screens/about.ts`. `slow` has no ability id yet.
