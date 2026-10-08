import { describe, expect, it } from 'vitest';
import { getCallDeadlinePresentation } from '../../apps/web/call-deadline-presentation.mjs';

describe('called entry deadline presentation', () => {
  it('shows remaining time from the persisted deadline', () => {
    expect(getCallDeadlinePresentation({ callNotifiedAt: '2026-10-07T12:00:00.000Z', callDeadlineAt: '2026-10-07T12:10:00.000Z' }, Date.parse('2026-10-07T12:02:11.000Z')))
      .toEqual({ key: 'panel.entry.call.remaining', values: { time: '07:49' }, state: 'countdown' });
  });

  it('does not start a countdown before Twitch confirms delivery', () => {
    expect(getCallDeadlinePresentation({ callNotifiedAt: null, callDeadlineAt: null, callTimeoutMin: 10 }))
      .toEqual({ key: 'panel.entry.call.awaiting_delivery', values: {}, state: 'awaiting_delivery' });
  });

  it('labels a confirmed call without an automatic timeout', () => {
    expect(getCallDeadlinePresentation({ callNotifiedAt: '2026-10-07T12:00:00.000Z', callDeadlineAt: null, callTimeoutMin: null }))
      .toEqual({ key: 'panel.entry.call.no_deadline', values: {}, state: 'no_deadline' });
  });

  it('marks a persisted deadline as expired without inventing a no-show transition', () => {
    expect(getCallDeadlinePresentation({ callNotifiedAt: '2026-10-07T12:00:00.000Z', callDeadlineAt: '2026-10-07T12:10:00.000Z' }, Date.parse('2026-10-07T12:10:00.000Z')))
      .toEqual({ key: 'panel.entry.call.expired', values: {}, state: 'expired' });
  });
});
