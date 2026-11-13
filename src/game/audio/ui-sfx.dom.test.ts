// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { installUiSfx, uiCueFor, UI_DEFAULT_ELEMENT } from './ui-sfx';

function mount(html: string): HTMLElement {
  const root = document.createElement('div');
  root.innerHTML = html;
  document.body.append(root);
  return root;
}

describe('uiCueFor', () => {
  it('maps plain controls to click and pickers to confirm', () => {
    const r = mount(`<button id="a">Play</button><button id="b" aria-pressed="false">Fire</button>
      <input id="c" type="radio"><div role="tab" id="d">T</div><p id="e">text</p><button id="f" disabled>x</button>`);
    expect(uiCueFor(r.querySelector('#a'))).toEqual({ kind: 'click', element: UI_DEFAULT_ELEMENT });
    expect(uiCueFor(r.querySelector('#b'))?.kind).toBe('confirm');
    expect(uiCueFor(r.querySelector('#c'))?.kind).toBe('confirm');
    expect(uiCueFor(r.querySelector('#d'))?.kind).toBe('confirm');
    expect(uiCueFor(r.querySelector('#e'))).toBeUndefined();
    expect(uiCueFor(r.querySelector('#f'))).toBeUndefined();
    expect(uiCueFor(null)).toBeUndefined();
  });

  it('takes the voice from the nearest data-element and ignores unknown values', () => {
    const r = mount(`<div data-element="fire"><button id="a"><span id="s">Go</span></button></div><div data-element="bogus"><button id="b">x</button></div>`);
    expect(uiCueFor(r.querySelector('#s'))).toEqual({ kind: 'click', element: 'fire' });
    expect(uiCueFor(r.querySelector('#b'))?.element).toBe(UI_DEFAULT_ELEMENT);
  });
});

describe('installUiSfx', () => {
  it('plays one cue per control click until uninstalled', () => {
    const r = mount('<button id="a">Play</button><span id="t">no</span>');
    const calls: string[] = [];
    const off = installUiSfx(document, (k, e) => calls.push(`${k}:${e}`));
    r.querySelector<HTMLElement>('#a')?.click();
    r.querySelector<HTMLElement>('#t')?.click();
    expect(calls).toEqual([`click:${UI_DEFAULT_ELEMENT}`]);
    off();
    r.querySelector<HTMLElement>('#a')?.click();
    expect(calls).toHaveLength(1);
  });
});
