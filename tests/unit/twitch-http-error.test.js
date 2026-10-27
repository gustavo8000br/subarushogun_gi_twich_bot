import { describe, expect, it } from 'vitest';
import { twitchHttpError } from '../../apps/api/src/twitch/http-error.mjs';
import { twurpleHttpError } from '../helpers/twurple-real-instances.mjs';

// OPS-22 FT-24 (#82), AC 4: one shared normalization of Twitch HTTP failures.
describe('twitchHttpError', () => {
  it.each([401, 403, 404, 429, 500, 503])('reads statusCode %s from a real Twurple HttpStatusCodeError', (statusCode) => {
    expect(twitchHttpError(twurpleHttpError(statusCode))).toEqual({ httpStatus: statusCode, retryAfterSeconds: null });
  });

  it('keeps legacy and adapter errors that only expose status', () => {
    expect(twitchHttpError(Object.assign(new Error('x'), { status: 404 }))).toEqual({ httpStatus: 404, retryAfterSeconds: null });
  });

  it('prefers statusCode over status and carries a valid Retry-After', () => {
    expect(twitchHttpError({ statusCode: 429, status: 500, retryAfterSeconds: 17 })).toEqual({ httpStatus: 429, retryAfterSeconds: 17 });
  });

  it.each([
    [undefined],
    [null],
    [new Error('network')],
    [{ statusCode: '401' }],
    [{ statusCode: 42 }],
    [{ statusCode: 600 }],
    [{ status: 4.5 }],
  ])('returns no HTTP status for %s', (error) => {
    expect(twitchHttpError(error).httpStatus).toBeNull();
  });

  it('ignores an invalid Retry-After', () => {
    expect(twitchHttpError({ statusCode: 429, retryAfterSeconds: -1 }).retryAfterSeconds).toBeNull();
    expect(twitchHttpError({ statusCode: 429, retryAfterSeconds: Number.NaN }).retryAfterSeconds).toBeNull();
  });
});
