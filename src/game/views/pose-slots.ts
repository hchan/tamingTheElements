import { SLOTS } from './pose-layer-types';

/** The pose layer's per-character data, one entry per slot (entity id masked into SLOTS). Plain typed arrays, no behaviour. */
export class PoseSlots {
  readonly have = new Uint8Array(SLOTS);
  readonly moving = new Uint8Array(SLOTS);
  readonly team = new Int8Array(SLOTS).fill(-1);
  readonly elem = new Uint8Array(SLOTS);
  readonly lx = new Float64Array(SLOTS);
  readonly ly = new Float64Array(SLOTS);
  readonly phase = new Float64Array(SLOTS);
  readonly move = new Float64Array(SLOTS);
  readonly lean = new Float64Array(SLOTS);
  readonly guard = new Float64Array(SLOTS);
  readonly kind = new Uint8Array(SLOTS);
  readonly kindAt = new Float64Array(SLOTS);
  readonly kindFxAt = new Float64Array(SLOTS); // fxMs at pose start: the tag-in fade runs on it, past a hit-stop
  readonly kindDir = new Float64Array(SLOTS);
  readonly kindPower = new Float64Array(SLOTS);
  readonly edge = new Uint8Array(SLOTS);
  readonly edgeAt = new Float64Array(SLOTS);
  readonly face = new Uint8Array(SLOTS);
  /** The last horizontal mirror per slot: a big-frame (side-view) sheet keeps it while facing straight up or down (auto-face). */
  readonly hflip = new Uint8Array(SLOTS);
  /** The visual box (x, y, w, h) the character view drew last, before any pose (the KO ghost starts from it). */
  readonly base = new Float64Array(SLOTS * 4);
  readonly spriteOf: string[] = new Array<string>(SLOTS).fill('');
  /** Backward walk (Arcade): the eased amount, the foe's side while backing (+1 east, -1 west) and each character's sim x this frame. */
  readonly back = new Float64Array(SLOTS);
  readonly backSide = new Int8Array(SLOTS).fill(1);
  /** 1 while the baked `walkBack` row (Phase 2, played forward by distance) is shown: its art carries the lean, so no procedural back cue. */
  readonly bakedBack = new Uint8Array(SLOTS);
  readonly simX = new Float64Array(SLOTS);
  /** Idle-motif contribution last frame, per slot (test probe). */
  readonly mRot = new Float32Array(SLOTS);
  readonly mOy = new Float32Array(SLOTS);
  readonly mAlpha = new Float32Array(SLOTS).fill(1);
}
