import { createHash } from 'node:crypto';

/**
 * Derives the OBS WebSocket v5 Identify authentication value.
 * @param {string} password
 * @param {string} salt
 * @param {string} challenge
 */
export function createObsWebSocketAuthentication(password, salt, challenge) {
  const secret = createHash('sha256').update(`${password}${salt}`).digest('base64');
  return createHash('sha256').update(`${secret}${challenge}`).digest('base64');
}
