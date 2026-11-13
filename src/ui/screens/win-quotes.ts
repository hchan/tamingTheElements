/**
 * Win quotes (view only): each hero has a few short, grim lines for the victory
 * screen, and the loser gets a reaction line. Chosen by presentation code from a
 * stable hash of the hero name and a caller-supplied number (XP, seed...), so the
 * same match always shows the same quote. No sim state, no Math.random.
 */

export const WIN_QUOTES: Readonly<Record<string, readonly string[]>> = {
  Curomo: ['The tide takes what it is owed.', 'Sink, and stay sunk.', 'Deep water forgets everyone.'],
  Cyclonius: ['Wind does not ask permission.', 'My father watched. He will not be ashamed.', 'Scattered, like the rest.'],
  Echo: ['It is over. I feel nothing.', 'You were loud. Now you are not.', 'Another voice gone quiet.'],
  Fiara: ['Ash is honest. So am I.', 'Burn clean, or not at all.', 'Truth leaves a scorch mark.'],
  Ishimi: ['The sea keeps what falls in.', 'Dissolve. It is kinder.', 'Slow wins, in the end.'],
  Lavax: ['Everything cools eventually.', 'The mountain was patient.', 'Stone remembers the fire.'],
  Morblass: ['The deep is not for you.', 'Little is known. Now less of you.', 'Go home to the surface.'],
  Pax: ['I once guarded this ground. Not this day.', 'The world is heavy enough.', 'Rest. The earth will have you.'],
  Rokcore: ['Peace comes after.', 'Stone does not hate. Stone endures.', 'It did not have to be this way.'],
  Sindarosa: ['Kneel to the old fire.', 'Your kind never lasted.', 'Molten born, and unmoved.'],
  Treenoc: ['Roots go deeper than rage.', 'I grow. You do not.', 'Slow, and still standing.'],
  Wispera: ['I never sleep. You should have.', 'Gone like breath on glass.', 'The air is quiet again.'],
};

export const LOSS_QUOTES: readonly string[] = [
  'The ground is cold. Rise, or stay.',
  'Not enough. Not yet.',
  'The elements are patient. Be patient too.',
];

const GENERIC: readonly string[] = ['The elements are not kind. They are fair.'];

/** FNV-1a over the key, folded with a number; integer maths only. */
export function quoteIndex(key: string, salt: number, count: number): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 0x01000193);
  h = Math.imul(h ^ (salt | 0), 0x01000193);
  return (h >>> 0) % count;
}

export function winQuote(hero: string | null, salt: number): string {
  const pool = (hero !== null ? WIN_QUOTES[hero] : undefined) ?? GENERIC;
  return pool[quoteIndex(hero ?? '', salt, pool.length)] ?? GENERIC[0] ?? '';
}

export function lossQuote(salt: number): string {
  return LOSS_QUOTES[quoteIndex('loss', salt, LOSS_QUOTES.length)] ?? '';
}
