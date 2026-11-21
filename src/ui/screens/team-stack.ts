import '../styles/team-stack.css';

/** One numbered team stack ("1 Starter / 2 Tag / 3 Tag"), rendered from plain props. No pick-model import. */

export interface StackHero {
  id: string;
  name: string;
  /** Short text such as "Melee, 120 life"; optional. */
  stats?: string;
  /** Ability chips: a short mark plus the full text for the title. */
  abilities?: readonly { mark: string; title: string }[];
}

export type StackRowState = 'mine' | 'suggested' | 'empty';

export interface StackRow {
  state: StackRowState;
  hero?: StackHero;
  /** DOM id of the row button (e.g. roster-partner). */
  id?: string;
  /** True on the one row the next pick fills (aria-pressed). */
  pressed?: boolean;
  /** Hidden and disabled (partner rows in 1v1). */
  hidden?: boolean;
}

export interface TeamStackProps {
  /** Side label shown as text, e.g. "P1". */
  side: string;
  rows: readonly StackRow[];
  /** This stack is the one the next tile click fills. */
  aimed: boolean;
  ready: boolean;
  onRowClick: (index: number) => void;
  onRowRemove: (index: number) => void;
}

export interface TeamStack {
  el: HTMLElement;
  update(props: TeamStackProps): void;
}

export function slotRole(i: number): string {
  return i === 0 ? 'Starter' : 'Tag';
}

/** Accessible name of a row. */
export function rowLabel(row: StackRow, i: number): string {
  const role = slotRole(i);
  const name = row.hero?.name ?? '';
  const slot = String(i + 1);
  if (row.state === 'mine' && name) return `Remove ${name} from slot ${slot} (${role})`;
  if (row.state === 'suggested' && name) return `Slot ${slot}, ${role}, suggested ${name}`;
  return `Slot ${slot}, ${role}, empty`;
}

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  cls: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

interface RowView {
  li: HTMLLIElement;
  btn: HTMLButtonElement;
  num: HTMLElement;
  role: HTMLElement;
  detail: HTMLElement;
}

function buildRow(): RowView {
  const li = el('li', 'tsItem');
  li.setAttribute('role', 'listitem');
  const btn = el('button', 'rosterSlot tsRow');
  btn.type = 'button';
  const num = el('span', 'tsNum');
  const role = el('span', 'tsRole');
  const detail = el('span', 'tsDetail');
  btn.append(num, role, detail);
  li.append(btn);
  return { li, btn, num, role, detail };
}

function fillDetail(d: HTMLElement, row: StackRow): void {
  d.replaceChildren();
  const hero = row.hero;
  if (row.state === 'empty' || !hero) {
    d.append(el('span', 'tsEmpty', 'Empty'));
    return;
  }
  d.append(el('span', 'tsName', hero.name));
  if (row.state === 'suggested') d.append(el('span', 'tsTag', 'Suggested'));
  if (hero.stats) d.append(el('span', 'tsStats', hero.stats));
  if (hero.abilities && hero.abilities.length > 0) {
    const abil = el('span', 'vsAbilities');
    for (const a of hero.abilities) {
      const chip = el('span', 'vsAbility', a.mark);
      chip.title = a.title;
      abil.append(chip);
    }
    d.append(abil);
  }
  if (row.state === 'mine') {
    const rm = el('span', 'tsRemove', 'Remove');
    rm.setAttribute('aria-hidden', 'true');
    d.append(rm);
  }
}

function paintRow(v: RowView, row: StackRow, i: number): void {
  const { li, btn } = v;
  li.hidden = row.hidden === true;
  btn.disabled = row.hidden === true;
  if (row.id) btn.id = row.id;
  else btn.removeAttribute('id');
  btn.dataset.state = row.state;
  btn.classList.toggle('tsSuggested', row.state === 'suggested');
  btn.classList.toggle('tsMine', row.state === 'mine');
  btn.classList.toggle('heroSlotEmpty', row.state === 'empty');
  if (row.hero) btn.dataset.hero = row.hero.id;
  else delete btn.dataset.hero;
  btn.setAttribute('aria-label', rowLabel(row, i));
  btn.setAttribute('aria-pressed', row.pressed === true ? 'true' : 'false');
  v.num.textContent = String(i + 1);
  v.role.textContent = slotRole(i);
  fillDetail(v.detail, row);
}

export function teamStack(initial: TeamStackProps): TeamStack {
  const root = el('div', 'teamStack');
  root.setAttribute('role', 'group');
  const head = el('div', 'tsHead');
  const side = el('span', 'tsSide');
  const aimTag = el('span', 'tsAim', 'Aimed');
  const readyTag = el('span', 'tsReady', 'Ready');
  head.append(side, aimTag, readyTag);
  const list = el('ul', 'tsList');
  list.setAttribute('role', 'list');
  root.append(head, list);

  const views: RowView[] = [];
  let props = initial;

  list.addEventListener('click', (e) => {
    const i = views.findIndex((v) => v.btn.contains(e.target as Node));
    if (i >= 0 && views[i]?.btn.disabled === false) props.onRowClick(i);
  });
  list.addEventListener('keydown', (e) => {
    if (e.key !== 'Delete' && e.key !== 'Backspace') return;
    const i = views.findIndex((v) => v.btn === e.target);
    if (i < 0 || props.rows[i]?.state !== 'mine') return;
    e.preventDefault();
    props.onRowRemove(i);
  });

  function update(next: TeamStackProps): void {
    props = next;
    while (views.length < next.rows.length) {
      const v = buildRow();
      views.push(v);
      list.append(v.li);
    }
    while (views.length > next.rows.length) views.pop()?.li.remove();
    next.rows.forEach((row, i) => {
      const v = views[i];
      if (v) paintRow(v, row, i);
    });
    side.textContent = next.side;
    aimTag.hidden = !next.aimed;
    readyTag.hidden = !next.ready;
    root.classList.toggle('tsAimed', next.aimed);
    root.classList.toggle('tsIsReady', next.ready);
    if (next.aimed) root.setAttribute('aria-current', 'true');
    else root.removeAttribute('aria-current');
    root.setAttribute(
      'aria-label',
      `${next.side} team${next.aimed ? ', aimed' : ''}${next.ready ? ', ready' : ''}`,
    );
  }

  update(initial);
  return { el: root, update };
}
