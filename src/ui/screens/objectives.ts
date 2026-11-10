import { advanceChapter, objectivesMet, progress } from '@core/index';
import type { SaveV1 } from '@core/index';
import { codeLabel, getBindings } from '../../game/platform/input/bindings';
import { browserStorage, createLocalSaveStore } from '../../game/platform/storage/local-save-store';
import { createMemoryStorage } from '../../game/platform/storage/save-store';
import type { SaveStore } from '../../game/platform/storage/save-store';
import { el } from '../dom';
import type { Screen } from './screen';

export interface ObjectivesView {
  readonly title: string;
  readonly lines: readonly string[];
  readonly canAdvance: boolean;
  readonly advanceLabel: string;
}

/** Pure view-model for the objectives screen. */
export function objectivesView(save: SaveV1 | null): ObjectivesView {
  const started = save !== null && save.chapter !== 0;
  const lines = started ? progress(save).map((l) => l.text) : [];
  return {
    title: started ? `Chapter ${String(save.chapter)} Objectives` : 'Current Objectives',
    lines: started && lines.length === 0 ? ['No objectives at this time.'] : lines,
    canAdvance: started && objectivesMet(save),
    advanceLabel: 'Begin next chapter',
  };
}

export interface AbilityNotice {
  readonly title: string;
  readonly text: string;
  /** Ability sprite key (`assets/img/<key>.png`). */
  readonly sprite: string;
}

/**
 * Legacy TODO "show the Capture icon as a new ability on chapter 2 objectives". Capture is granted from chapter 2
 * (`abilitiesFor`); the notice is headed "Capture unlocked!" in chapter 2 and stays as a reminder afterwards.
 * `keyLabel` is the live binding of the Capture slot (default C).
 */
export function captureNotice(chapter: number, keyLabel: string): AbilityNotice | null {
  if (chapter < 2) return null;
  return {
    title: chapter === 2 ? 'Capture unlocked!' : 'Capture ability',
    text: `${chapter === 2 ? 'New ability gained: Capture. ' : ''}Press ${keyLabel} when the enemy is at 25% health or less to add it to your garrison.`,
    sprite: 'capture',
  };
}

/** Returns the save with the chapter advanced; callers should only persist it when objectivesMet. */
export function advancedSave(save: SaveV1): SaveV1 {
  return { ...save, chapter: advanceChapter(save) };
}

export interface ObjectivesDeps {
  readonly store: SaveStore;
  readonly navigate: (route: string) => void;
  /** Label of the live Capture key binding; defaults to the bindings in use. */
  readonly captureKey?: () => string;
}

function liveCaptureKey(): string {
  return codeLabel(getBindings().capture[0] ?? 'KeyC');
}

function browserDeps(): ObjectivesDeps {
  return {
    store: createLocalSaveStore(browserStorage() ?? createMemoryStorage(), () => Date.now()),
    navigate: (route) => {
      window.location.hash = `#${route}`;
    },
  };
}

function noticeBox(n: AbilityNotice): HTMLElement {
  const box = el('div', 'abilityNotice');
  box.id = 'captureNotice';
  box.setAttribute('role', 'status');
  const icon = el('img', 'abilityNoticeIcon');
  icon.src = new URL(`assets/img/${n.sprite}.png`, document.baseURI).href;
  icon.alt = '';
  icon.width = 48;
  icon.height = 48;
  const body = el('div');
  body.append(el('strong', undefined, n.title), el('div', undefined, n.text));
  box.append(icon, body);
  return box;
}

export function objectivesScreen(deps?: ObjectivesDeps): Screen {
  let node: HTMLElement | null = null;
  return {
    mount(container) {
      const d = deps ?? browserDeps();
      const page = el('div', 'menuPage');
      node = page;
      // The heading exists before the router focuses it; its text is filled in once the save has loaded.
      const heading = el('h1', 'heading', 'Current Objectives');
      page.append(heading);
      container.append(page);
      const show = (save: SaveV1 | null, justAdvanced: boolean): void => {
        const view = objectivesView(save);
        page.replaceChildren(heading);
        heading.textContent = view.title;
        for (const line of view.lines) page.append(el('p', 'objectiveLine', line));
        const notice = captureNotice(save?.chapter ?? 0, (d.captureKey ?? liveCaptureKey)());
        if (notice) page.append(noticeBox(notice));
        if (view.canAdvance && save !== null) {
          const btn = el('button', 'clickable', view.advanceLabel);
          btn.addEventListener('click', () => {
            btn.disabled = true;
            const next = advancedSave(save);
            void d.store.save(next).then((s) => {
              if (!s.ok) btn.disabled = false;
              // Chapter 2 is where Capture is gained: stay here so the notice is seen, then continue to the garrison.
              else if (next.chapter === 2) show(next, true);
              else d.navigate('battleground');
            });
          });
          page.append(btn);
        }
        if (justAdvanced) {
          const go = el('a', 'menuLink', 'Continue to the Garrison');
          go.id = 'continueToGarrison';
          go.setAttribute('href', '#garrison');
          page.append(go);
        }
        const back = el('a', 'menuLink', 'Back');
        back.setAttribute('href', '#main');
        page.append(back);
      };
      void d.store.load().then((r) => {
        if (node !== page) return;
        show(r.ok ? r.value : null, false);
      });
    },
    unmount() {
      node?.remove();
      node = null;
    },
  };
}
