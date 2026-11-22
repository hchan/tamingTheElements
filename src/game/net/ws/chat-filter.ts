/**
 * "Hide rude words": masks a short word list with asterisks. DISPLAY ONLY: callers apply it to what is shown, never to what is sent.
 * The list is stored ROT13 so grep output of the source stays clean. Matching is on code points after a 1:1 fold (lower case, common
 * look-alike letters, leet digits), so a hit becomes exactly as many asterisks at exactly the same positions. Whole words only
 * (a plural `s` is allowed): "Scunthorpe" and "cockpit" are left alone.
 */
const WORDS_ROT13 = [
  'shpx', 'shpxre', 'shpxvat', 'fuvg', 'fuvggl', 'ovgpu', 'phag', 'qvpx', 'nffubyr', 'onfgneq', 'cvff', 'fyhg', 'juber', 'pbpx', 'gjng',
  'jnaxre', 'avttre', 'avttn', 'snttbg', 'ergneq', 'ergneqrq',
];

export function rot13(s: string): string {
  return s.replace(/[a-z]/gi, (c) => {
    const base = c <= 'Z' ? 65 : 97;
    return String.fromCharCode(((c.charCodeAt(0) - base + 13) % 26) + base);
  });
}

const WORDS: readonly (readonly string[])[] = WORDS_ROT13.map((w) => Array.from(rot13(w)));

const LEET: Readonly<Record<string, string>> = { '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', '@': 'a', $: 's' };
/** Cyrillic look-alikes of Latin letters. */
const LOOKALIKE: Readonly<Record<string, string>> = { а: 'a', е: 'e', о: 'o', р: 'p', с: 'c', х: 'x', у: 'y', і: 'i' };

/** One code point in, one code point out. */
function fold(ch: string): string {
  const lower = ch.toLowerCase();
  const c = Array.from(lower).length === 1 ? lower : ch;
  return LEET[c] ?? LOOKALIKE[c] ?? c;
}

const isWordChar = (c: string | undefined): boolean => c !== undefined && /[\p{L}\p{N}]/u.test(c);

export function maskRude(text: string): string {
  const orig = Array.from(text);
  const f = orig.map(fold);
  const hit = new Array<boolean>(orig.length).fill(false);
  for (const w of WORDS) {
    for (let i = 0; i + w.length <= f.length; i++) {
      if (isWordChar(f[i - 1]) || !w.every((c, k) => f[i + k] === c)) continue;
      const end = i + w.length;
      const plural = f[end] === 's' && !isWordChar(f[end + 1]);
      if (isWordChar(f[end]) && !plural) continue;
      for (let k = i; k < (plural ? end + 1 : end); k++) hit[k] = true;
    }
  }
  return orig.map((c, i) => (hit[i] ? '*' : c)).join('');
}
