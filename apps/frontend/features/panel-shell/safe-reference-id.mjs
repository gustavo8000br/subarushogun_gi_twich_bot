// The single allowlist for a server-made error reference id (the same value the API logs). Anything else is never rendered.
export const SAFE_REFERENCE_PATTERN = /^[A-Za-z0-9_.-]{1,64}$/;

export function safeReferenceId(error) {
  return typeof error?.referenceId === 'string' && SAFE_REFERENCE_PATTERN.test(error.referenceId)
    ? error.referenceId : null;
}

// E7: the overview load failure shows an id only when the server answered with a 5xx; a timeout or a network
// failure (no server answer) never gets an id, so nothing is invented.
export function loadFailureReferenceId(error) {
  if (error?.timedOut) return null;
  return Number.isInteger(error?.status) && error.status >= 500 ? safeReferenceId(error) : null;
}
