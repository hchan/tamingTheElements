import { describe, expect, it } from 'vitest';
import ai from '../../../../tests/fixtures/legacy/ai.json';
import { Cmd, cmdAxisX, cmdAxisY, type Command } from '../../sim/commands';
import { chooseMovement, MovementState, STUCK_LIMIT, type Box } from './movement';

/**
 * Tolerances versus the legacy fixture (tests/fixtures/legacy/ai.json):
 * - doMovement decisions match exactly (16 combinations).
 * - Delay milliseconds map to ticks at 20 ms (2000 ms = 100 ticks, 3000 ms = 150 ticks); the fixture's
 *   `delays` list is compared in ms, snapshots taken at 2020 ms / 3020 ms map to 101 / 152 ticks later.
 * - Blocked detection is one tick late (the agent reads the sim's collision result on the next
 *   observation), so scenarios call moveAway on two consecutive ticks where legacy needed one call.
 *   The first call's movement and the state after the second call equal the legacy `afterCall` row.
 * - moveTowards: non-random rows match legacy exactly (sign of the displacement). Where the step lands
 *   on the target axis legacy flips Math.random() and moves 0 or two steps; here `ai.pN` picks 0 or one
 *   step, so only the sign relation (0 or the same direction) is asserted, not the coin itself.
 */

const SELF: Box = { x: 500, y: 300, w: 80, h: 80 };
const SPEED = 7;

function target(dx: number, dy: number): Box {
  return { x: SELF.x + dx, y: SELF.y + dy, w: 80, h: 80 };
}

describe('doMovement decisions', () => {
  const table = ai.doMovement as unknown as Record<string, string[]>;
  for (const [key, expected] of Object.entries(table)) {
    it(key, () => {
      const m = /^(.*)\/selfMelee=(\w+)\/targetMelee=(\w+)\/ready=(\w+)$/.exec(key);
      const primary = m?.[1] === 'Fire Blast' ? 'range' : 'melee';
      const kind = chooseMovement({
        primary,
        selfMelee: m?.[2] === 'true',
        targetMelee: m?.[3] === 'true',
        ready: m?.[4] === 'true',
      });
      expect([kind]).toEqual(expected);
    });
  }

  it('does nothing for non range/melee primaries', () => {
    expect(chooseMovement({ primary: 'other', selfMelee: false, targetMelee: false, ready: true })).toBe('none');
  });
});

describe('moveTowardsTargetPlayer grid', () => {
  const { rows } = ai.moveTowards as unknown as { rows: number[][] };
  it('matches legacy direction, flips only on the target axis, draws only from aiInt', () => {
    expect(rows).toHaveLength(49);
    for (const [dx = 0, dy = 0, movedX = 0, movedY = 0] of rows) {
      let draws = 0;
      const st = new MovementState();
      const cmd = st.moveTowards(0, SELF, target(dx, dy), SPEED, () => {
        draws++;
        return 1;
      });
      const label = `dx=${String(dx)} dy=${String(dy)}`;
      const ax = cmdAxisX(cmd);
      const ay = cmdAxisY(cmd);
      let expectedDraws = 0;
      for (const [d, moved, got] of [
        [dx, movedX, ax],
        [dy, movedY, ay],
      ] as const) {
        if (Math.abs(d) === SPEED) {
          expectedDraws++;
          expect([0, 2 * Math.sign(d)], label).toContain(moved / SPEED);
          // coin = 1 maps to "+": from the target at +d, the final step is Math.sign(base*7 + 7).
          expect(got, label).toBe(Math.sign(Math.sign(d) * SPEED + SPEED));
        } else {
          expect(got, label).toBe(Math.sign(moved));
        }
      }
      expect(draws, label).toBe(expectedDraws);
      expect(st.pendingDelaysMs()).toEqual([]);
    }
  });

  it('coin 0 and 1 give the two off-axis outcomes (0 or one step the same way)', () => {
    for (const coin of [0, 1]) {
      const cmd = new MovementState().moveTowards(0, SELF, target(7, 100), SPEED, () => coin);
      expect(cmdAxisX(cmd)).toBe(coin === 1 ? 1 : 0);
      expect(cmdAxisY(cmd)).toBe(1);
    }
  });
});

interface Step {
  dx: number;
  dy: number;
  moveAwayX: string | null;
  moveAwayY: string | null;
  samePositionCount: number;
  delays: number[];
}

const SOLIDS: Record<string, (x: number, y: number) => boolean> = {
  open: () => false,
  blockedX: (x) => x > 503 || x < 497,
  blockedY: (_x, y) => y > 303 || y < 297,
  blockedBoth: () => true,
  stuckFiveTimes: () => true,
};

/** Applies a command the way the sim does (one axis at a time against the legacy `hit` solid). */
function applyCmd(pos: { x: number; y: number }, cmd: Command, solid: (x: number, y: number) => boolean): void {
  const nx = pos.x + cmdAxisX(cmd) * SPEED;
  if (!solid(nx, pos.y)) pos.x = nx;
  const ny = pos.y + cmdAxisY(cmd) * SPEED;
  if (!solid(pos.x, ny)) pos.y = ny;
}

function snap(st: MovementState, pos: { x: number; y: number }): Step {
  return {
    dx: pos.x - SELF.x,
    dy: pos.y - SELF.y,
    moveAwayX: st.moveAwayX,
    moveAwayY: st.moveAwayY,
    samePositionCount: st.samePositionCount,
    delays: st.pendingDelaysMs(),
  };
}

describe('moveAwayFromTargetPlayer timers', () => {
  const rows = ai.moveAway as unknown as Record<string, Record<string, Step & { checkActive: boolean | null }>[]>;
  const T = { x: SELF.x + 60, y: SELF.y + 20, w: 80, h: 80 };

  for (const name of ['open', 'blockedX', 'blockedY', 'blockedBoth']) {
    it(`${name}: first step, edge flags and Delay values as ticks`, () => {
      const solid = SOLIDS[name] as (x: number, y: number) => boolean;
      const legacy = rows[name] as Record<string, Step & { checkActive: boolean | null }>[];
      const st = new MovementState();
      const pos = { x: SELF.x, y: SELF.y };
      let tick = 0;
      const call = (): void => {
        st.advance(tick, pos, T);
        const cmd = st.moveAway(tick, { ...pos, w: 80, h: 80 }, T);
        st.noteSent(cmd);
        applyCmd(pos, cmd, solid);
        tick++;
      };
      call();
      const first = legacy[0]?.['afterCall'] as Step;
      expect([pos.x - SELF.x, pos.y - SELF.y]).toEqual([first.dx, first.dy]);
      call(); // one tick later the blocked result is visible
      const second = snap(st, pos);
      expect(second.moveAwayX).toBe(first.moveAwayX);
      expect(second.moveAwayY).toBe(first.moveAwayY);
      expect(second.delays).toEqual(first.delays);
      expect(st.checkActive).toBe(true);
      // Jump to 2020 ms after the first call: the 2000 ms check has fired, the 3000 ms clears are pending.
      st.advance(101, pos, T);
      const mid = legacy[1]?.['after2020'] as Step;
      expect(st.moveAwayX).toBe(mid.moveAwayX);
      expect(st.moveAwayY).toBe(mid.moveAwayY);
      expect(st.samePositionCount).toBe(mid.samePositionCount);
      expect(st.pendingDelaysMs()).toEqual(mid.delays);
      expect(st.checkActive).toBe(false);
      // 3020 ms after the first call (the clears were armed one tick later, so allow tick 152).
      st.advance(152, pos, T);
      const end = legacy[2]?.['after3020'] as Step;
      expect(st.moveAwayX).toBe(end.moveAwayX);
      expect(st.moveAwayY).toBe(end.moveAwayY);
      expect(st.pendingDelaysMs()).toEqual(end.delays);
    });
  }

  it('stuckFiveTimes: five same-position checks force a y escape and reset the count', () => {
    const legacy = rows['stuckFiveTimes'] as Record<string, Step & { checkActive: boolean | null }>[];
    const st = new MovementState();
    const pos = { x: SELF.x, y: SELF.y };
    let base = 0;
    const call = (tick: number): void => {
      st.advance(tick, pos, T);
      const cmd = st.moveAway(tick, { ...pos, w: 80, h: 80 }, T);
      st.noteSent(cmd);
      applyCmd(pos, cmd, SOLIDS['blockedBoth'] as (x: number, y: number) => boolean);
    };
    for (let cycle = 0; cycle < STUCK_LIMIT; cycle++) {
      call(base);
      call(base + 1);
      const first = legacy[cycle * 3]?.['afterCall'] as Step;
      expect(st.moveAwayX, `cycle ${String(cycle)}`).toBe(first.moveAwayX);
      expect(st.moveAwayY).toBe(first.moveAwayY);
      expect(st.pendingDelaysMs()).toEqual(first.delays);
      st.advance(base + 101, pos, T);
      const mid = legacy[cycle * 3 + 1]?.['after2020'] as Step;
      expect(st.samePositionCount, `cycle ${String(cycle)}`).toBe(mid.samePositionCount);
      expect(st.pendingDelaysMs()).toEqual(mid.delays);
      st.advance(base + 152, pos, T);
      const end = legacy[cycle * 3 + 2]?.['after3020'] as Step;
      expect(st.pendingDelaysMs()).toEqual(end.delays);
      expect(st.moveAwayX).toBe(end.moveAwayX);
      expect(st.moveAwayY).toBe(end.moveAwayY);
      base += 153;
    }
  });

  it('a moving enemy never accumulates same-position counts', () => {
    const st = new MovementState();
    const pos = { x: SELF.x, y: SELF.y };
    for (let tick = 0; tick < 400; tick++) {
      st.advance(tick, pos, T);
      const cmd = st.moveAway(tick, { ...pos, w: 80, h: 80 }, T);
      st.noteSent(cmd);
      applyCmd(pos, cmd, SOLIDS['open'] as (x: number, y: number) => boolean);
    }
    expect(st.samePositionCount).toBe(0);
    expect(st.moveAwayX).toBeNull();
    expect(st.moveAwayY).toBeNull();
  });

  it('does not read "blocked" when the last command had no component on the axis', () => {
    const st = new MovementState();
    const pos = { x: SELF.x, y: SELF.y };
    st.moveAway(0, { ...pos, w: 80, h: 80 }, T);
    st.noteSent(Cmd.up); // no x component sent
    st.moveAway(1, { ...pos, w: 80, h: 80 }, T);
    expect(st.moveAwayX).toBeNull();
  });
});
