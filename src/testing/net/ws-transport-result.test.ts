import { describe, expect, it } from 'vitest';
import { FakeSocket } from './fake-relay';
import { RETRY_MS, WebSocketTransport } from '../../game/net/ws/transport';
import { decodeFrame } from '../../game/net/ws/wire';

describe('WebSocketTransport RESULT and DESYNC retry', () => {
  const mk = () => {
    const clock = { ms: 0 };
    const sock = new FakeSocket();
    return { clock, sock, t: new WebSocketTransport(sock, () => clock.ms) };
  };

  it('endMatch stops the DESYNC and RESULT resend', () => {
    const { clock, sock, t } = mk();
    t.startMatch(1, false);
    t.sendDesync(1, 10, 1, 2);
    t.sendResult(1, 0, 0, 100, 5);
    expect(sock.sent).toHaveLength(2);
    t.endMatch();
    for (let i = 0; i < 4; i++) {
      clock.ms += RETRY_MS;
      t.tick();
    }
    expect(sock.sent).toHaveLength(2);
  });

  it('sendResult calls onResultSent before the frame goes out, so a synchronous answer finds the poll open', () => {
    const { sock, t } = mk();
    const log: string[] = [];
    t.onResultSent = () => { log.push('begin'); };
    sock.onSend = (b) => { log.push(decodeFrame(b)?.t === 'result' ? 'send' : 'other'); };
    t.startMatch(1, false);
    t.sendResult(1, 0, 0, 100, 5);
    expect(log).toEqual(['begin', 'send']);
  });
});
