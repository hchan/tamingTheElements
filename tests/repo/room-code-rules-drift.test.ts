import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ROOM_CODE_RE, cleanRoomCode } from '../../src/game/net/relay';
import * as pkg from '../../src/core/relay/rooms-rules';

// The relay package (src/core/relay) and the browser client (src/game/net/relay.ts) each keep their own copy of the
// room-code rules, so the client bundle never imports the package; this test fails if they drift apart (docs/RELAY-PACKAGE.md).
const root = resolve(import.meta.dirname, '../..');

describe('room-code rules: relay package vs browser client', () => {
  it('accept the same code shapes', () => {
    const samples = [
      'abcdef',
      ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'.split('').flatMap((c) => [5, 6, 7].map((n) => c.repeat(n))),
    ];
    for (const s of samples) expect(ROOM_CODE_RE.test(s), s).toBe(pkg.isRoomCode(s));
  });

  it('normalise typed codes the same way', () => {
    for (const typed of [' abcdef ', 'ab 23 cd', 'ABCDEF', 'abc', 'ab1', 'abcdefg']) {
      const theirs = pkg.normalizeRoomCode(typed.replace(/\s+/g, ''));
      expect(cleanRoomCode(typed), typed).toBe(pkg.isRoomCode(theirs) ? theirs : undefined);
    }
  });

  it('keeps the browser client free of the relay package', () => {
    const src = readFileSync(resolve(root, 'src/game/net/relay.ts'), 'utf8');
    for (const m of src.matchAll(/\bfrom\s+'([^']+)'/g)) {
      expect(m[1]).not.toMatch(/core\/relay|@tamingtheelements\/relay/);
    }
  });
});
