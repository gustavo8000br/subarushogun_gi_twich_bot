// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { OUTCOME_CODES } from '../../apps/frontend/features/panel-shell/post-action-route.mjs';
import { readOutcomeFromLocation } from '../../apps/frontend/features/panel-shell/outcome-url.mjs';

const ID = '0b1f1ef0-0ac0-4e63-b71c-e608f5aa1b20';

function fakeWindow(search, extra = '') {
  const calls = [];
  const win = {
    location: { pathname: '/queues/', search, hash: extra },
    history: { state: { keep: true }, replaceState: (state, _title, url) => { calls.push({ state, url }); } },
  };
  return { win, calls };
}

describe('outcome URL parser (AC 6, UX-6)', () => {
  it.each(OUTCOME_CODES)('accepts the closed-list code %s with a UUID and removes both parameters', (code) => {
    const { win, calls } = fakeWindow(`?outcome=${code}&queue=${ID}`);
    expect(readOutcomeFromLocation(win)).toEqual({ code, queueId: ID });
    expect(calls).toEqual([{ state: { keep: true }, url: '/queues/' }]);
  });

  it.each([
    ['unknown code', `?outcome=queue_exploded&queue=${ID}`],
    ['markup code', `?outcome=%3Cscript%3Ealert(1)%3C%2Fscript%3E&queue=${ID}`],
    ['prototype name', `?outcome=constructor&queue=${ID}`],
    ['malformed uuid', '?outcome=queue_created&queue=not-a-uuid'],
    ['uuid with suffix', `?outcome=queue_created&queue=${ID}x`],
    ['missing queue', '?outcome=queue_created'],
    ['missing outcome', `?queue=${ID}`],
    ['duplicated outcome', `?outcome=queue_created&outcome=queue_created_local&queue=${ID}`],
  ])('ignores %s: no message, parameters removed, nothing reflected', (_name, search) => {
    const { win, calls } = fakeWindow(search);
    expect(readOutcomeFromLocation(win)).toBeNull();
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe('/queues/');
  });

  it('keeps unrelated parameters and the hash while removing only the two', () => {
    const { win, calls } = fakeWindow(`?a=1&outcome=queue_created&queue=${ID}&b=2`, '#top');
    readOutcomeFromLocation(win);
    expect(calls[0].url).toBe('/queues/?a=1&b=2#top');
  });

  it('does nothing (no replaceState) when neither parameter is present', () => {
    const { win, calls } = fakeWindow('?a=1');
    expect(readOutcomeFromLocation(win)).toBeNull();
    expect(calls).toEqual([]);
  });

  it('survives a missing history API', () => {
    expect(readOutcomeFromLocation({ location: { pathname: '/', search: `?outcome=queue_created&queue=${ID}`, hash: '' } })).toEqual({ code: 'queue_created', queueId: ID });
    expect(readOutcomeFromLocation(undefined)).toBeNull();
  });

  it('C23-03 (static): the raw outcome parameter is never interpolated into rendered output', () => {
    const urlSource = readFileSync('apps/frontend/features/panel-shell/outcome-url.mjs', 'utf8');
    const routeSource = readFileSync('apps/frontend/features/panel-shell/post-action-route.mjs', 'utf8');
    // The parameter is only ever compared against the closed list; it is never returned as text.
    expect(urlSource).toMatch(/OUTCOME_CODES\.includes\(/);
    expect(urlSource).not.toMatch(/return\s*\{\s*code:\s*(?:rawCode|params\.get)/);
    expect(urlSource).not.toMatch(/dangerouslySetInnerHTML|innerHTML|document\.write/);
    expect(routeSource).not.toMatch(/dangerouslySetInnerHTML|innerHTML/);
  });
});
