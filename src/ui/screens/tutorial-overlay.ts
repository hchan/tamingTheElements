import { el } from '@ui/dom';

/**
 * The how-to-play overlay: a prompt card, a highlight ring over one action-bar slot and a Skip button, laid over the battle
 * (`#game`). Plain DOM, no Phaser: the game layer (`game/app/tutorial.ts`) feeds it the lesson and the slot's screen rect.
 */
export interface OverlayLesson {
  readonly title: string;
  readonly prompt: string;
}

export interface Box {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

const LOGICAL_W = 1280;
const LOGICAL_H = 720;
/** Breathing room around the slot, in CSS px. */
const RING_PAD = 4;

/**
 * Where to draw the ring for a slot given in logical px (1280x720, as `ActionBarView.screenSlots` reports): the 1280x720 box is
 * centred horizontally and bottom-anchored in the canvas (the wide and tall views add room around it). Pure, for tests.
 */
export function ringBox(slot: { x: number; y: number; size: number }, canvas: Box, parent: { left: number; top: number }): Box {
  const k = Math.min(canvas.width / LOGICAL_W, canvas.height / LOGICAL_H);
  const left = canvas.left + (canvas.width - LOGICAL_W * k) / 2 - parent.left + slot.x * k;
  const top = canvas.top + canvas.height - LOGICAL_H * k - parent.top + slot.y * k;
  const size = slot.size * k;
  return { left: left - RING_PAD, top: top - RING_PAD, width: size + RING_PAD * 2, height: size + RING_PAD * 2 };
}

export interface TutorialOverlay {
  readonly root: HTMLElement;
  setLesson(lesson: OverlayLesson | null, index: number, total: number): void;
  setRing(box: Box | null): void;
  /** Lessons finished: shows the closing card. */
  showDone(message: string): void;
}

export interface OverlayOptions {
  readonly onSkip: () => void;
  readonly reducedMotion: boolean;
}

const px = (v: number): string => `${String(Math.round(v * 10) / 10)}px`;

export function tutorialOverlay(o: OverlayOptions): TutorialOverlay {
  const root = el('div');
  root.id = 'tutorialOverlay';
  root.style.cssText = 'position:absolute;inset:0;z-index:6;pointer-events:none;font-family:inherit;color:#fff';

  const card = el('section');
  card.id = 'tutorialCard';
  card.setAttribute('role', 'region');
  card.setAttribute('aria-label', 'How to play');
  card.style.cssText =
    'position:absolute;left:50%;top:94px;transform:translateX(-50%);max-width:min(560px,92%);padding:10px 14px;background:rgba(10,10,14,.88);border:2px solid #d9b24c;border-radius:6px;pointer-events:auto;font-size:14px;line-height:1.35';
  const step = el('p', undefined, '');
  step.id = 'tutorialStep';
  step.style.cssText = 'margin:0 0 2px;font-size:11px;opacity:.8';
  const title = el('h2', undefined, '');
  title.id = 'tutorialTitle';
  title.style.cssText = 'margin:0 0 4px;font-size:16px';
  const prompt = el('p', undefined, '');
  prompt.id = 'tutorialPrompt';
  prompt.style.margin = '0 0 8px';
  // Screen readers hear each new lesson.
  prompt.setAttribute('aria-live', 'polite');
  const skip = el('button', 'menuButton clickable', 'Skip');
  skip.id = 'tutorialSkip';
  skip.setAttribute('type', 'button');
  skip.addEventListener('click', o.onSkip);
  card.append(step, title, prompt, skip);

  const ring = el('div');
  ring.id = 'tutorialRing';
  ring.setAttribute('aria-hidden', 'true');
  ring.style.cssText = `position:absolute;display:none;box-sizing:border-box;border:3px solid #ffd84a;border-radius:8px;box-shadow:0 0 10px 2px #ffd84a;${o.reducedMotion ? '' : 'animation:tutorialPulse 1s ease-in-out infinite;'}`;
  if (!o.reducedMotion) {
    const css = el('style', undefined, '@keyframes tutorialPulse{0%,100%{opacity:1}50%{opacity:.45}}');
    root.append(css);
  }
  root.append(ring, card);

  return {
    root,
    setLesson(lesson, index, total) {
      card.hidden = lesson === null;
      if (!lesson) return;
      step.textContent = `${String(index + 1)} of ${String(total)}`;
      title.textContent = lesson.title;
      prompt.textContent = lesson.prompt;
    },
    setRing(box) {
      if (!box) {
        ring.style.display = 'none';
        return;
      }
      ring.style.display = 'block';
      ring.style.left = px(box.left);
      ring.style.top = px(box.top);
      ring.style.width = px(box.width);
      ring.style.height = px(box.height);
    },
    showDone(message) {
      card.hidden = false;
      step.textContent = 'Done';
      title.textContent = 'Practice complete';
      prompt.textContent = message;
      skip.textContent = 'Back to Help';
      ring.style.display = 'none';
    },
  };
}
