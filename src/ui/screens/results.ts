import { levelFromXp } from '@core/index';
import type { MatchReport } from '@core/index';
import { el } from '../dom';
import type { Screen } from './screen';

export interface ResultsContext {
  readonly report: MatchReport;
  /** Chapter of the save after the match was applied. */
  readonly chapter: number;
  /** Whether the chapter objectives are met after the match was applied. */
  readonly objectivesMet: boolean;
}

export interface ResultsView {
  readonly heading: string;
  readonly avatarName: string | null;
  readonly xpLines: readonly string[];
  readonly captured: readonly { readonly name: string; readonly text: string }[];
  readonly banner: string | null;
  readonly continueHref: string;
}

const DEFEAT: ResultsView = {
  heading: 'You have been defeated...',
  avatarName: null,
  xpLines: [],
  captured: [],
  banner: null,
  continueHref: '#garrison',
};

/** Pure view-model matching the legacy Victory / YouJustDied scene strings. */
export function resultsView(ctx: ResultsContext): ResultsView {
  const { report } = ctx;
  if (!report.victory) return DEFEAT;
  const xpLines: string[] = [];
  const xp = report.xp;
  if (xp !== null) {
    xpLines.push(
      xp.gained > 0
        ? `XP gained : ${String(xp.gained)}`
        : `XP gained : ${String(xp.gained)} (this character has reached his max XP for this objective)`,
      `Current XP : ${String(xp.after)}`,
      xp.leveledUp
        ? `You are now Level : ${String(xp.levelAfter)}`
        : `Level : ${String(xp.levelAfter)}`,
    );
  }
  let banner: string | null = null;
  if (ctx.objectivesMet) {
    banner =
      ctx.chapter < 4
        ? `Your objectives have been met for this chapter. Click on Current Objectives under the Main Menu to begin the next chapter${ctx.chapter === 1 ? ' (Capture is unlocked in chapter 2)' : ''}`
        : 'Congratulations, you have have finished this game.  Thanks for playing!';
  }
  return {
    heading: 'Victory!',
    avatarName: xp?.characterName ?? null,
    xpLines,
    captured: report.captured.map((c) => ({
      name: c.characterName,
      text: `${c.characterName} Level : ${String(levelFromXp(c.experience))}`,
    })),
    banner,
    continueHref: ctx.objectivesMet ? '#main' : '#garrison',
  };
}

let pending: ResultsContext | null = null;

/** Hands the finished match to the victory/defeat routes (consumed on mount). */
export function setPendingResult(ctx: ResultsContext | null): void {
  pending = ctx;
}

function renderView(page: HTMLElement, view: ResultsView, victory: boolean): void {
  page.append(el('h1', victory ? 'heading victory' : 'heading defeat', view.heading));
  if (view.avatarName !== null) {
    const avatar = el('div', 'resultAvatar', view.avatarName);
    avatar.dataset['character'] = view.avatarName;
    page.append(avatar);
  }
  for (const line of view.xpLines) page.append(el('p', 'resultXp', line));
  if (view.captured.length > 0) {
    page.append(el('p', 'resultCapturedHeading', 'Captured:'));
    for (const c of view.captured) page.append(el('p', 'resultCaptured', c.text));
  }
  if (view.banner !== null) page.append(el('p', 'resultBanner', view.banner));
  const cont = el('a', 'menuLink', 'Continue');
  cont.setAttribute('href', view.continueHref);
  page.append(cont);
}

function resultsScreen(victory: boolean): Screen {
  let node: HTMLElement | null = null;
  return {
    mount(container) {
      const page = el('div', 'menuPage');
      node = page;
      const ctx = pending;
      pending = null;
      const view = !victory ? DEFEAT : ctx !== null ? resultsView(ctx) : { ...DEFEAT, heading: 'Victory!' };
      renderView(page, view, victory);
      container.append(page);
    },
    unmount() {
      node?.remove();
      node = null;
    },
  };
}

export const victoryScreen = (): Screen => resultsScreen(true);
export const defeatScreen = (): Screen => resultsScreen(false);
