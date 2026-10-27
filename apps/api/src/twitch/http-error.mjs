/**
 * Single normalization of Twitch HTTP failures (OPS-22 FT-24, AC 4).
 *
 * Twurple's `HttpStatusCodeError` exposes `statusCode`; errors built by this project's
 * adapters expose `status`. Reading only `status` made real 401/403/404 responses look
 * transient. `retryAfterSeconds` is kept only when a caller attached a valid value;
 * Twurple 8.2.0 does not expose response headers on its error.
 *
 * @param {unknown} error
 * @returns {{httpStatus: number|null, retryAfterSeconds: number|null}}
 */
export function twitchHttpError(error) {
  const source = /** @type {{statusCode?: unknown, status?: unknown, retryAfterSeconds?: unknown}|null|undefined} */ (
    error && typeof error === 'object' ? error : undefined);
  const candidate = source?.statusCode ?? source?.status;
  const httpStatus = Number.isInteger(candidate) && Number(candidate) >= 100 && Number(candidate) <= 599 ? Number(candidate) : null;
  const retryAfter = source?.retryAfterSeconds;
  const retryAfterSeconds = typeof retryAfter === 'number' && Number.isFinite(retryAfter) && retryAfter >= 0 ? retryAfter : null;
  return { httpStatus, retryAfterSeconds };
}
