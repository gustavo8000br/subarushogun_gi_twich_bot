import { describe, expect, it } from 'vitest';
import { createObsWebSocketAuthentication } from '../helpers/obs-websocket-auth.mjs';

describe('OBS WebSocket authentication', () => {
  it('derives the identify authentication value from password, salt and challenge', () => {
    expect(createObsWebSocketAuthentication('secret', 'salt', 'challenge')).toBe('39cfhx7et2iyoMZvoQ6o3OPLNSKgtMmy48GQ7jnvsdE=');
  });
});
