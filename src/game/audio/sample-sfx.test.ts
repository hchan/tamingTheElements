import { describe, expect, it } from 'vitest';
import { VOLUME_KEY } from '../platform/volume-setting';
import { MAX_SAMPLE_VOICES, createSampler, type SampleContext } from './sample-sfx';
import { SFX_MUTE_KEY, createSfx } from './sfx';

function fakeCtx() {
  const started: { buffer: unknown; gain: number }[] = [];
  const live: { onended: (() => void) | null }[] = [];
  const ctx: SampleContext & { resume(): Promise<void> } = {
    destination: { kind: 'dest' },
    createGain: () => ({ gain: { value: 1 }, connect() {}, disconnect() {} }),
    createBufferSource() {
      let gainNode: { gain: { value: number } } | undefined;
      const src = {
        buffer: null as unknown,
        onended: null as (() => void) | null,
        connect(d: unknown) { gainNode = d as { gain: { value: number } }; },
        disconnect() {},
        start() { started.push({ buffer: src.buffer, gain: gainNode?.gain.value ?? -1 }); live.push(src); },
      };
      return src;
    },
    decodeAudioData: (data) => Promise.resolve({ duration: data.byteLength }),
    resume: () => Promise.resolve(),
  };
  return { ctx, started, live };
}

const bytes = (n: number): Promise<ArrayBuffer> => Promise.resolve(new ArrayBuffer(n));
const ENTRIES = [{ id: 'sfx_water_hit', url: 'audio/sfx_water_hit.ogg' }];

describe('sampler', () => {
  it('plays a decoded sample through a gain, and reports no sample for other cues', async () => {
    const { ctx, started } = fakeCtx();
    const s = createSampler(ctx, () => bytes(7), ENTRIES);
    expect(s.play('hit', 'water', 1)).toBe(false); // still decoding: the synth covers it
    await s.settled;
    expect(s.loaded()).toBe(1);
    expect(s.play('hit', 'water', 0.4)).toBe(true);
    expect(started).toEqual([{ buffer: { duration: 7 }, gain: 0.4 }]);
    expect(s.play('hit', 'fire', 1)).toBe(false);
    expect(s.play('hit', 'water', 0)).toBe(false);
  });

  it('survives a failed fetch or decode, leaving that cue to the synth', async () => {
    const { ctx } = fakeCtx();
    const s = createSampler(ctx, () => Promise.reject(new Error('404')), ENTRIES);
    await s.settled;
    expect(s.loaded()).toBe(0);
    expect(s.play('hit', 'water', 1)).toBe(false);
  });

  it('limits simultaneous samples and recovers as they end', async () => {
    const { ctx, live } = fakeCtx();
    const s = createSampler(ctx, () => bytes(1), ENTRIES);
    await s.settled;
    for (let i = 0; i < MAX_SAMPLE_VOICES; i++) expect(s.play('hit', 'water', 1)).toBe(true);
    expect(s.play('hit', 'water', 1)).toBe(false);
    live[0]?.onended?.();
    expect(s.play('hit', 'water', 1)).toBe(true);
  });
});

describe('playSfx with samples', () => {
  const settle = (): Promise<void> => new Promise((r) => setTimeout(r, 0));
  function setup(store: Record<string, string> = {}, samplesFail = false) {
    const { ctx, started } = fakeCtx();
    const listeners = new Map<string, () => void>();
    const synthPlays: string[] = [];
    const sfx = createSfx({
      makeContext: () => ctx as never,
      loadSynth: () => Promise.resolve({ createSynth: () => ({ active: () => 0, play: (k, e) => { synthPlays.push(`${k}:${e}`); return true; } }) }),
      loadSamples: (c) => samplesFail ? Promise.reject(new Error('x')) : Promise.resolve(createSampler(c as unknown as SampleContext, () => bytes(1), ENTRIES)),
      storage: { getItem: (k) => store[k] ?? null },
      target: { addEventListener: (t, l) => { listeners.set(t, l); }, removeEventListener: (t) => { listeners.delete(t); } },
    });
    return { sfx, listeners, synthPlays, started };
  }

  it('is silent before the first gesture, then plays the sample and falls back to the synth for the rest', async () => {
    const t = setup();
    t.sfx.play('hit', 'water');
    expect(t.started).toEqual([]);
    expect(t.synthPlays).toEqual([]);
    t.listeners.get('pointerdown')?.();
    await settle();
    t.sfx.play('hit', 'water');
    t.sfx.play('cast', 'water');
    expect(t.started).toHaveLength(1);
    expect(t.synthPlays).toEqual(['cast:water']);
  });

  it('scales the sample by the sfx volume and honours mute', async () => {
    const t = setup({ [VOLUME_KEY]: JSON.stringify({ music: 1, sfx: 0.25 }) });
    t.listeners.get('keydown')?.();
    await settle();
    t.sfx.play('hit', 'water');
    expect(t.started[0]?.gain).toBe(0.25);
    const m = setup({ [SFX_MUTE_KEY]: '1' });
    m.listeners.get('keydown')?.();
    await settle();
    m.sfx.play('hit', 'water');
    expect(m.started).toEqual([]);
    expect(m.synthPlays).toEqual([]);
  });

  it('uses the synth when the samples chunk fails to load', async () => {
    const t = setup({}, true);
    t.listeners.get('keydown')?.();
    await settle();
    t.sfx.play('hit', 'water');
    expect(t.started).toEqual([]);
    expect(t.synthPlays).toEqual(['hit:water']);
  });
});
