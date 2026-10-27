// Single place that builds REAL Twurple 8.2.0 objects from raw Helix JSON for contract tests.
// The constructors are marked @private in Twurple; keep every use of them here so a Twurple
// upgrade breaks one helper instead of many tests (OPS-22 FT-24, research note Q5).
import { HelixCustomRewardRedemption } from '@twurple/api';
import { HttpStatusCodeError } from '@twurple/api-call';

/** Synthetic Helix "Get Custom Reward Redemption" item; no real channel or viewer data. */
export function rawHelixRedemption(overrides = {}) {
  return {
    broadcaster_id: '100000001',
    broadcaster_login: 'fixture_channel',
    broadcaster_name: 'Fixture_Channel',
    id: 'fixture-redemption-1',
    user_id: '200000002',
    user_login: 'fixture_viewer',
    user_name: 'Fixture_Viewer',
    user_input: '',
    status: 'UNFULFILLED',
    redeemed_at: '2026-10-27T12:00:00Z',
    reward: { id: 'fixture-reward-1', title: 'Fixture reward', prompt: '', cost: 100 },
    ...overrides,
  };
}

/** Real `HelixCustomRewardRedemption` instance, as returned by `@twurple/api`. */
export function helixRedemption(overrides = {}) {
  return new HelixCustomRewardRedemption(rawHelixRedemption(overrides), /** @type {any} */ ({}));
}

/** Real `HttpStatusCodeError` as thrown by `@twurple/api-call` (exposes `statusCode`, never `status`). */
export function twurpleHttpError(statusCode, statusText = 'Fixture status') {
  return new HttpStatusCodeError(statusCode, statusText, 'https://api.twitch.tv/helix/fixture', 'GET', '{"error":"fixture"}', true);
}
