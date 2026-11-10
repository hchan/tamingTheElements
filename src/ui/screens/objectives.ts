import { advanceChapter, objectivesMet, progress } from '@core/index';
import type { SaveV1 } from '@core/index';
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

/** Returns the save with the chapter advanced; callers should only persist it when objectivesMet. */
export function advancedSave(save: SaveV1): SaveV1 {
  return { ...save, chapter: advanceChapter(save) };
}

export interface ObjectivesDeps {
  readonly store: SaveStore;
  readonly navigate: (route: string) => void;
}

function browserDeps(): ObjectivesDeps {
  return {
    store: createLocalSaveStore(browserStorage() ?? createMemoryStorage(), () => Date.now()),
    navigate: (route) => {
      window.location.hash = `#${route}`;
    },
  };
}

export function objectivesScreen(deps?: ObjectivesDeps): Screen {
  let node: HTMLElement | null = null;
  return {
    mount(container) {
      const d = deps ?? browserDeps();
      const page = el('div', 'menuPage');
      node = page;
      container.append(page);
      void d.store.load().then((r) => {
        if (node !== page) return;
        const save = r.ok ? r.value : null;
        const view = objectivesView(save);
        page.append(el('h1', 'heading', view.title));
        for (const line of view.lines) page.append(el('p', 'objectiveLine', line));
        if (view.canAdvance && save !== null) {
          const btn = el('button', 'clickable', view.advanceLabel);
          btn.addEventListener('click', () => {
            btn.disabled = true;
            void d.store.save(advancedSave(save)).then((s) => {
              if (s.ok) d.navigate('battleground');
              else btn.disabled = false;
            });
          });
          page.append(btn);
        }
        const back = el('a', 'menuLink', 'Back');
        back.setAttribute('href', '#main');
        page.append(back);
      });
    },
    unmount() {
      node?.remove();
      node = null;
    },
  };
}
