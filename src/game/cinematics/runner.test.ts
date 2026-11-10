import { describe, expect, it } from 'vitest';
import { CinematicRunner, type CinematicScript, type CinematicSink } from './runner';
import { INTRO_SCRIPT } from './scripts';

function recorder(): { log: string[]; sink: CinematicSink } {
  const log: string[] = [];
  return {
    log,
    sink: {
      background: (k) => log.push(`bg:${k}`),
      header: (t) => log.push(`header:${t}`),
      headerDone: () => log.push('headerDone'),
      caption: (t) => log.push(`caption:${t}`),
      sprite: (id) => log.push(`sprite:${id}`),
      tween: (id, _to, ms) => log.push(`tween:${id}:${String(ms)}`),
      done: (s) => log.push(`done:${String(s)}`),
    },
  };
}

const SCRIPT: CinematicScript = [
  { kind: 'sprite', id: 'a', key: 'k', rect: { x: 0, y: 0, w: 1, h: 1 }, alpha: 1 },
  { kind: 'tween', id: 'a', to: { alpha: 0 }, ms: 500 },
  { kind: 'header', text: 'H', ms: 100 },
  { kind: 'caption', text: 'C' },
  { kind: 'waitKey' },
  { kind: 'wait', ms: 50 },
];

describe('CinematicRunner', () => {
  it('runs instant steps immediately and blocks on the header', () => {
    const { log, sink } = recorder();
    new CinematicRunner(SCRIPT, sink);
    expect(log).toEqual(['sprite:a', 'tween:a:500', 'header:H']);
  });

  it('header time, key and wait release in order, then done', () => {
    const { log, sink } = recorder();
    const r = new CinematicRunner(SCRIPT, sink);
    r.advance(60);
    expect(log).toHaveLength(3);
    r.advance(60);
    expect(log.slice(3)).toEqual(['headerDone', 'caption:C']);
    r.advance(10_000); // time does not release a key wait
    expect(r.isDone).toBe(false);
    r.key();
    r.advance(49);
    expect(r.isDone).toBe(false);
    r.advance(1);
    expect(log.at(-1)).toBe('done:false');
  });

  it('a key press outside waitKey is ignored', () => {
    const { log, sink } = recorder();
    const r = new CinematicRunner(SCRIPT, sink);
    r.key();
    expect(log).toHaveLength(3);
  });

  it('skip ends once and later input is inert', () => {
    const { log, sink } = recorder();
    const r = new CinematicRunner(SCRIPT, sink);
    r.skip();
    r.skip();
    r.key();
    r.advance(1000);
    expect(log.filter((l) => l.startsWith('done'))).toEqual(['done:true']);
  });

  it('an empty script is done at once', () => {
    const { log, sink } = recorder();
    expect(new CinematicRunner([], sink).isDone).toBe(true);
    expect(log).toEqual(['done:false']);
  });

  it('the intro script plays through with keys and time', () => {
    const { log, sink } = recorder();
    const r = new CinematicRunner(INTRO_SCRIPT, sink);
    for (let i = 0; i < 4 && !r.isDone; i++) {
      r.advance(5000);
      r.key();
    }
    expect(r.isDone).toBe(true);
    expect(log.filter((l) => l.startsWith('header:'))).toEqual(['header:Homeworld: Pria', 'header:The Disturbance']);
  });
});
