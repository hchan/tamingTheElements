import { describe, expect, it, vi } from 'vitest';
import { ringBox, tutorialOverlay } from './tutorial-overlay';

describe('tutorial overlay', () => {
  it('maps a slot into the bottom-anchored, centred 1280x720 box', () => {
    const b = ringBox({ x: 100, y: 640, size: 60 }, { left: 0, top: 0, width: 640, height: 360 }, { left: 0, top: 0 });
    expect(b).toEqual({ left: 50 - 4, top: 320 - 4, width: 30 + 8, height: 30 + 8 });
    // A wider canvas centres the box; the parent offset is subtracted.
    const w = ringBox({ x: 0, y: 0, size: 72 }, { left: 10, top: 20, width: 1480, height: 720 }, { left: 10, top: 20 });
    expect(w.left).toBe(100 - 4);
  });

  it('shows the lesson, a ring, a working Skip and no banned words', () => {
    const onSkip = vi.fn();
    const o = tutorialOverlay({ onSkip, reducedMotion: false });
    document.body.append(o.root);
    o.setLesson({ title: 'Lesson 1: Attack', prompt: 'Hit the training foe.' }, 0, 4);
    o.setRing({ left: 1, top: 2, width: 30, height: 30 });
    expect(o.root.querySelector<HTMLElement>('#tutorialRing')?.style.display).toBe('block');
    expect(o.root.querySelector('#tutorialPrompt')?.getAttribute('aria-live')).toBe('polite');
    o.root.querySelector<HTMLButtonElement>('#tutorialSkip')?.click();
    expect(onSkip).toHaveBeenCalledTimes(1);
    o.showDone('Nice work.');
    expect(o.root.textContent).not.toMatch(/classic|arcade|ruleset|capture/i);
    o.root.remove();
  });

  it('drops the pulse under reduced motion', () => {
    const o = tutorialOverlay({ onSkip: () => undefined, reducedMotion: true });
    expect(o.root.querySelector('style')).toBeNull();
    expect(o.root.querySelector<HTMLElement>('#tutorialRing')?.style.animation).toBe('');
  });
});
