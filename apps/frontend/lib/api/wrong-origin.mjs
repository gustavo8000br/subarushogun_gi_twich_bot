// OPS-15 D-3 (LA-17): the API refuses a mutation whose Origin is not the "localhost" panel origin with this closed code
// (403). The client announces it so the panel can explain the real cause (open localhost) instead of the generic text.
export const WRONG_ORIGIN_CODE = 'ORIGIN_NOT_ALLOWED';
export const WRONG_ORIGIN_EVENT = 'panel:wrong-origin';

/** Announce a wrong-origin refusal to the page; a no-op outside a browser. */
export function announceWrongOrigin(target = globalThis.window) {
  try { target?.dispatchEvent?.(new globalThis.CustomEvent(WRONG_ORIGIN_EVENT)); } catch { /* Announcing is best effort. */ }
}
