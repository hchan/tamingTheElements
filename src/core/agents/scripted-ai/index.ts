import { ABILITIES_A } from '../../data/abilities-a';
import { ABILITIES_B } from '../../data/abilities-b';
import { elementRelation } from '../../data/elements';
import type { CharacterDef, AbilityDef } from '../../data/types';
import type { Aabb } from '../../math/aabb';
import { Cmd, type Command, NO_COMMAND } from '../../sim/commands';
import { arcadePlayfield } from '../../data/arcade';
import { DEFAULT_ARENA } from '../../sim/world';
import { EntityFlag } from '../../sim/state';
import { stateRecord, type Agent, type AgentState, type ObservationView } from '../agent';
import { AgentRng } from '../agent-rng';
import { AttackAgent, type AttackAbility, type AttackAgentOptions, type AttackProfile, type Facing } from './attack';
import { ArcadeTactics } from './arcade';
import type { ArcadeAiLevel, Style } from './arcade-ai';
import { chooseMovement, MovementState } from './movement';

export * from './arcade';
export * from './attack';
export * from './movement';

export interface ScriptedProfile extends AttackProfile {
  /** Own character has the legacy MeleeCharacter component. */
  readonly selfMelee: boolean;
  readonly targetMelee: boolean;
  /** Per-tick step of the character (legacy characterSpeed). */
  readonly speed: number;
  /** Own element at a disadvantage against the opponent's (the Arcade AI's weather rule); absent: false. */
  readonly unfavourable?: boolean;
}

export interface ScriptedAIOptions extends AttackAgentOptions {
  /** Walkable area the movement keeps inside; defaults to the sim's DEFAULT_ARENA. */
  readonly arena?: Aabb;
  /** Arcade AI level (default Normal) and personality (RUSHDOWN, ZONER or TURTLE; default drawn per match), see arcade-ai.ts. */
  readonly level?: ArcadeAiLevel;
  readonly personality?: Style;
}

const ABILITY_DEFS: readonly AbilityDef[] = [...ABILITIES_A, ...ABILITIES_B];
const EXPLOSION_MELEE = new Set(['ground-shock', 'hurricane']);
/** Only Pax requires the legacy MeleeCharacter component (characters.js). */
const MELEE_CHARACTER = 'pax';

/** Maps an ability definition to the attack agent's view of it. */
export function attackAbilityOf(def: AbilityDef): AttackAbility {
  const type = def.kind === 'range' ? 'range' : def.kind === 'melee' ? 'melee' : def.kind === 'heal' ? 'heal' : 'other';
  return {
    type,
    maxActive: def.maxActive,
    ...(type === 'melee' && {
      w: def.w ?? 0,
      h: def.h ?? 0,
      reach: EXPLOSION_MELEE.has(def.id) ? ('explosion' as const) : ('directional' as const),
    }),
  };
}

/** Builds the profile for `self` fighting `opponent`; slot 0 is the primary and slot 1 the secondary, as in the sim. */
export function scriptedProfileFor(self: CharacterDef, opponent: CharacterDef): ScriptedProfile {
  const abilityAt = (slot: number): AttackAbility | undefined => {
    const id = self.abilities[slot];
    const def = id === undefined ? undefined : ABILITY_DEFS.find((d) => d.id === id);
    return def === undefined ? undefined : attackAbilityOf(def);
  };
  const primary = abilityAt(0) ?? { type: 'other', maxActive: 0 };
  const secondary = abilityAt(1);
  return {
    primary,
    ...(secondary !== undefined && { secondary }),
    selfMelee: self.id === MELEE_CHARACTER,
    targetMelee: opponent.id === MELEE_CHARACTER,
    speed: self.speed,
    unfavourable: elementRelation(self.element, opponent.element) === 'dis',
  };
}

const MOVE_MASK = Cmd.up | Cmd.down | Cmd.left | Cmd.right;

/**
 * The sim fires along the facing it derives from the movement bits (x wins over y), so a shot forces
 * the legacy attack facing onto the movement command: the facing axis is overridden, the other kept
 * for e/w, and dropped for n/s (otherwise x would win).
 */
function applyFacing(move: Command, facing: Facing): Command {
  switch (facing) {
    case 'e':
      return (move & ~Cmd.left) | Cmd.right;
    case 'w':
      return (move & ~Cmd.right) | Cmd.left;
    case 'n':
      return (move & ~(Cmd.left | Cmd.right | Cmd.down)) | Cmd.up;
    case 's':
      return (move & ~(Cmd.left | Cmd.right | Cmd.up)) | Cmd.down;
  }
}

/** Scripted enemy: the legacy attack decisions plus the legacy movement, randomness from its own `AgentRng` only. */
export class ScriptedAI implements Agent {
  readonly id: string;
  private readonly profile: ScriptedProfile;
  private readonly attack: AttackAgent;
  private readonly activeCount: (slot: 0 | 1) => number;
  private readonly movement = new MovementState();
  private readonly arena: Aabb;
  private readonly rng = new AgentRng();
  private readonly arcade: ArcadeTactics;

  constructor(profile: ScriptedProfile, options: ScriptedAIOptions = {}) {
    this.profile = profile;
    this.arena = options.arena ?? DEFAULT_ARENA;
    this.id = options.id ?? 'scripted-ai';
    this.activeCount = options.activeCount ?? (() => 0);
    this.attack = new AttackAgent(profile, { ...options, id: this.id });
    this.arcade = new ArcadeTactics(options.level, options.personality, profile.unfavourable);
  }

  get state(): MovementState {
    return this.movement;
  }

  save(): AgentState {
    return { movement: this.movement.save(), attack: this.attack.save(), rng: this.rng.save(), arcade: this.arcade.save() };
  }

  load(state: AgentState): void {
    const rec = stateRecord(state, this.id);
    this.movement.load(rec['movement'] ?? null);
    this.attack.load(rec['attack'] ?? null);
    this.rng.load(rec['rng'] ?? null);
    this.arcade.load(rec['arcade'] ?? null);
  }

  observe(view: ObservationView): Command {
    const self = view.self;
    const target = view.opponent;
    if (self === undefined || target === undefined) return NO_COMMAND;
    this.movement.advance(view.tick, self, target);
    // Legacy skips the whole EnterFrame AI (attack and movement) while frozen.
    if ((self.flags & EntityFlag.frozen) !== 0) {
      this.movement.noteSent(NO_COMMAND);
      return NO_COMMAND;
    }
    const atk = this.attack.observe(view);
    const primary = this.profile.primary;
    const ready = (view.cooldowns[0] ?? 0) === 0 && this.activeCount(0) < primary.maxActive;
    const kind = chooseMovement({
      primary: primary.type,
      selfMelee: this.profile.selfMelee,
      targetMelee: this.profile.targetMelee,
      ready,
    });
    let move: Command = NO_COMMAND;
    if (kind === 'away') move = this.movement.moveAway(view.tick, self, target);
    else if (kind === 'towards') move = this.movement.moveTowards(view.tick, self, target, this.profile.speed, (n) => this.rng.int(view, n));
    // Refuse steps further out of the arena; the next moveAway call reads them as blocked axes.
    const walls = view.arcade === undefined ? this.arena : arcadePlayfield();
    const speed = this.profile.speed;
    // Only retreating is bounded: chasing stays within reach of the target, which the sim lets leave the arena.
    const retreat = kind === 'away';
    const wallX = retreat && ((move & Cmd.left) !== 0 ? self.x - speed < walls.x : (move & Cmd.right) !== 0 && self.x + self.w + speed > walls.x + walls.w);
    const wallY = retreat && ((move & Cmd.up) !== 0 ? self.y - speed < walls.y : (move & Cmd.down) !== 0 && self.y + self.h + speed > walls.y + walls.h);
    if (wallX) move &= ~(Cmd.left | Cmd.right);
    if (wallY) move &= ~(Cmd.up | Cmd.down);
    if ((atk & Cmd.primary) !== 0) move = applyFacing(move, this.attack.direction);
    // Arcade only (a no-op without `view.arcade`, drawing from its own stream): defence, spacing, combos, supers, weather.
    const shot = ready && primary.type === 'range' ? Cmd.primary : 0;
    const cmd = this.arcade.apply(view, (move & MOVE_MASK) | (atk & (Cmd.primary | Cmd.secondary)), shot);
    this.movement.noteSent(cmd, wallX, wallY);
    return cmd;
  }
}
