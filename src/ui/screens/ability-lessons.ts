import { ARCADE_SNAG_SLOT, SNAG_DESCRIPTION, getCharacter, type CharacterId } from '@core/index';
import { actionKeyLabel, type Bindings } from '../../game/platform/input/bindings';
import { padButtonFor, padButtonLabel, type PadOverrides } from '../../game/platform/input/pad-bindings';

/**
 * Per-ability "try it" lessons for the released heroes (the legacy 14 plus RELEASED_ROSTER24): one line on what
 * the ability does, one tip to practise it, plus the key and pad prompt for the ability's box. Words only; data and helpers,
 * no UI yet. Heroes whose kit carries Snag (ARCADE_SNAG_SLOT) get the Snag lesson on that box instead of the ability's own.
 */

export interface AbilityLesson {
  readonly abilityId: string;
  /** What it does. */
  readonly line: string;
  /** What to try. */
  readonly tip: string;
}

const L = (abilityId: string, line: string, tip: string): AbilityLesson => ({ abilityId, line, tip });

const LESSON_LIST: readonly AbilityLesson[] = [
  // Water
  L('ice-shock', 'A quick close-range jab of ice that hurts and recovers fast.', "Step in close and chain it between the foe's attacks."),
  L('shards-of-ice', 'Shards burst out in every direction around you.', 'Use it when the foe circles you, so you do not need to aim.'),
  L('circus-of-slime', 'A ring of slime bursts out all round you.', 'Fire it when the foe closes in from any side.'),
  L('slime-blast', 'A slow glob of slime thrown at the foe.', 'Aim ahead of a moving foe and let it land.'),
  L('ice-blast', 'A bolt of ice that hurts and slows the foe for a few seconds.', 'Hit, then keep your distance while they crawl.'),
  L('icicles', 'A fast stream of small icicles.', 'Tap it again and again from range.'),
  // Fire
  L('fireball', 'A fireball that flies straight at the foe.', 'Line up your aim, then fire from mid range.'),
  L('fire-heal', 'Heals you a little. It takes a long time to be ready again.', 'Save it for a quiet moment, not the middle of a trade.'),
  L('crimson-fire', 'A wide gout of fire that covers a lot of ground.', 'Fire it down a lane the foe is about to step into.'),
  L('fire-dance', 'A burst of speed for a few seconds.', 'Press it, then dash around the foe to set up a shot.'),
  L('fire-blast', 'A big blast that hits hardest up close and fades with distance.', 'Wait for the foe to come close, then let it go.'),
  L('translucent-flame', 'Become translucent for a moment so attacks pass through you.', 'Press it just as the foe fires.'),
  L('ember-bite', 'A rapid chain of light bites that hurt a little and recover fast.', 'Stay close and keep biting between the foe\'s attacks.'),
  L('cinder-spray', 'A close ring of embers bursts out all round you.', 'Fire it when the foe closes in from any side.'),
  // Earth
  L('adrenaline', 'A short rush: you move faster and take less harm.', 'Press it before you close in.'),
  L('ground-shock', 'A slam that hits every foe around you.', 'Use it up close; it needs a moment to be ready again.'),
  L('rock-armour', 'Stone skin that cuts the harm you take for a few seconds.', 'Press it when the foe is about to start a combo.'),
  L('rock-pellet', 'A quick pellet of rock thrown at the foe.', 'Fire it in a steady rhythm from range.'),
  L('entangling-vines', 'Vines that root the foe where they stand.', "Throw it along the foe's path, then move in."),
  L('strangling-branches', 'A short, fast lash of branches.', 'Stay close and keep lashing.'),
  // Air
  L('tornado', 'Sends a spinning tornado out ahead of you.', 'Fire it in front of the foe so they run into it.'),
  L('wind-cone', 'A cone of wind that hits across a wide arc.', 'Fire it when the foe is a little off your aim.'),
  L('fade', 'Fade out for a few seconds so attacks go through you.', 'Press it when a hit is about to land.'),
  L('hurricane', 'A hurricane that follows you and hurts anyone inside it.', 'Press it, then stay close to the foe.'),
  L('sonar-blast', 'A pulse of sound that flies out and hits the foe.', 'Aim along the line to the foe and fire.'),
  L('steal-health', 'A strike that heals you for the harm it does.', 'Land it when you are hurt, then keep landing it.'),
  // Story-only heroes (the dummy target and the Eternal Void), still in the released range
  L('stick', 'A stick thrown at the foe.', 'Fire it from range.'),
  L('chaos-bolt', 'A fast bolt of chaos.', 'Fire it down the line to the foe.'),
  L('chaos-orb', 'A heavy orb of chaos that hits very hard.', 'Time it for when the foe cannot step aside.'),
];

/** Lessons keyed by ability id, for every ability of every released hero. */
export const ABILITY_LESSONS: ReadonlyMap<string, AbilityLesson> = new Map(LESSON_LIST.map((l) => [l.abilityId, l]));

/** The Snag lesson, shown on the box that holds the rope for the heroes in ARCADE_SNAG_SLOT. */
export const SNAG_LESSON: AbilityLesson = L('snag', SNAG_DESCRIPTION, 'Throw it at a foe who is not guarding, then strike while they are rooted.');

/** The lesson for each ability box of `hero` (box 0 then box 1); the Snag box carries the Snag lesson. */
export function lessonsFor(hero: CharacterId): readonly (AbilityLesson | undefined)[] {
  const snagSlot = ARCADE_SNAG_SLOT[hero];
  return getCharacter(hero).abilities.map((aid, slot) => (slot === snagSlot ? SNAG_LESSON : ABILITY_LESSONS.get(aid)));
}

/**
 * "1 / A": the keyboard key and the gamepad button for ability box `slot` (0 or 1), from the live bindings and pad overrides,
 * so rebinds show. A missing key reads "unbound".
 */
export function promptFor(slot: 0 | 1, bindings: Bindings, padOverrides: PadOverrides): string {
  const key = actionKeyLabel(bindings, slot === 0 ? 'slot1' : 'slot2') ?? 'unbound';
  const pad = padButtonLabel(padButtonFor(padOverrides, slot === 0 ? 'primary' : 'secondary'));
  return `${key} / ${pad}`;
}
