/**
 * What players read for an elemental ability's name. Water's elemental is called "Cleanse" in core data (`ELEMENTAL_NAMES`), and the
 * common Cleanse slot (every hero, key =) now owns that word, so the view shows water's as "Tidecall". Display only: the sim keeps its
 * own table (pinned by core tests), and every view that prints a name goes through here (action bar, refusal line, announcer, guide).
 */

/** `CLEANSE_COOLDOWN_TICKS` in core data (10 s at 50 Hz; core's own test pins 500, the view test pins this copy). */
export const CLEANSE_COOLDOWN = 500;

const SHOWN: Readonly<Record<string, string>> = { Cleanse: 'Tidecall' };

export function elementalShown(name: string): string {
  return SHOWN[name] ?? name;
}
