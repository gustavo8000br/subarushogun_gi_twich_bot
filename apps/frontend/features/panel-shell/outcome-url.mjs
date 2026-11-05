/* global URLSearchParams */
import { OUTCOME_CODES, UUID_PATTERN } from './post-action-route.mjs';

/**
 * Reads the post-action outcome from the URL (FT-23 AC 6). The only accepted data are ONE code from the closed list and
 * ONE queue UUID. Both parameters are always removed with `history.replaceState`, so a reload never replays the message and
 * nothing from the URL is ever reflected on the page: the caller receives a code from the closed list, never the raw text.
 * @param {Window|undefined} [win]
 * @returns {{code: string, queueId: string}|null}
 */
export function readOutcomeFromLocation(win = globalThis.window) {
  const location = win?.location;
  if (!location) return null;
  const params = new URLSearchParams(location.search ?? '');
  if (!params.has('outcome') && !params.has('queue')) return null;
  const codes = params.getAll('outcome');
  const queues = params.getAll('queue');
  params.delete('outcome');
  params.delete('queue');
  const rest = params.toString();
  win.history?.replaceState?.(win.history.state, '', `${location.pathname}${rest ? `?${rest}` : ''}${location.hash ?? ''}`);
  if (codes.length !== 1 || queues.length !== 1) return null;
  const [code] = codes;
  const [queueId] = queues;
  if (!OUTCOME_CODES.includes(code) || !UUID_PATTERN.test(queueId)) return null;
  return { code, queueId };
}
