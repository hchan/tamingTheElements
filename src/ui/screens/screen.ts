/** A screen owns its DOM between mount and unmount. */
export interface Screen {
  mount(container: HTMLElement): void;
  unmount(): void;
}

export type ScreenFactory = (param: string | null) => Screen;
