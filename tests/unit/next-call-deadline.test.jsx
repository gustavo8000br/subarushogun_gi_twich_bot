/** @vitest-environment jsdom */
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import CallDeadline from '../../apps/frontend/features/queues/call-deadline.jsx';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const catalog = Object.fromEntries(readFileSync(join(process.cwd(), 'apps/shared/localization/catalogs/panel/en.tsv'), 'utf8')
  .split('\n').filter((line) => line.includes('\t')).map((line) => { const i = line.indexOf('\t'); return [line.slice(0, i), line.slice(i + 1)]; }));
const t = (key, options) => (catalog[key] ?? key).replace(/\{(\w+)\}/g, (_, name) => options?.values?.[name] ?? '');

const confirmed = { callNotifiedAt: '2026-10-07T12:00:00.000Z', callDeadlineAt: '2026-10-07T12:10:00.000Z' };

afterEach(() => { cleanup(); vi.useRealTimers(); });

describe('Next called-entry deadline line', () => {
  it('does not start a countdown before Twitch confirms delivery', () => {
    vi.useFakeTimers();
    const spy = vi.spyOn(globalThis, 'setInterval');
    const { container } = render(<CallDeadline entry={{ callNotifiedAt: null, callDeadlineAt: null }} t={t} />);
    expect(container.textContent).toBe('Deadline has not started; waiting for delivery confirmation.');
    expect(spy).not.toHaveBeenCalled();
  });

  it('labels a confirmed call without an automatic timeout', () => {
    const { container } = render(<CallDeadline entry={{ callNotifiedAt: confirmed.callNotifiedAt, callDeadlineAt: null }} t={t} />);
    expect(container.textContent).toBe('No automatic deadline to start service.');
  });

  it('counts down from the persisted deadline and ticks once per second', () => {
    vi.useFakeTimers({ now: Date.parse('2026-10-07T12:02:11.000Z') });
    const { container } = render(<CallDeadline entry={confirmed} t={t} />);
    expect(container.textContent).toBe('Time to start service: 07:49 remaining.');
    act(() => { vi.advanceTimersByTime(1000); });
    expect(container.textContent).toBe('Time to start service: 07:48 remaining.');
  });

  it('marks expiry without inventing a no-show transition and stops ticking', () => {
    vi.useFakeTimers({ now: Date.parse('2026-10-07T12:09:59.000Z') });
    const clear = vi.spyOn(globalThis, 'clearInterval');
    const { container } = render(<CallDeadline entry={confirmed} t={t} />);
    act(() => { vi.advanceTimersByTime(1000); });
    expect(container.textContent).toBe('Deadline passed; waiting for the service status to update.');
    expect(container.querySelector('.call-deadline-expired')).not.toBeNull();
    expect(clear).toHaveBeenCalled();
  });

  it('is plain text: no live region, so a screen reader is not interrupted every second', () => {
    const { container } = render(<CallDeadline entry={confirmed} t={t} />);
    const line = container.querySelector('.call-deadline');
    expect(line.getAttribute('aria-live')).toBeNull();
    expect(line.getAttribute('role')).toBeNull();
  });

  it('server-renders without the time so hydration cannot mismatch', () => {
    const html = renderToStaticMarkup(<CallDeadline entry={confirmed} t={t} />);
    expect(html).not.toMatch(/\d\d:\d\d/);
  });

  it('clears its interval on unmount', () => {
    vi.useFakeTimers({ now: Date.parse('2026-10-07T12:02:11.000Z') });
    const { unmount } = render(<CallDeadline entry={confirmed} t={t} />);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('reports expiry exactly once, only after observing the countdown end', () => {
    vi.useFakeTimers({ now: Date.parse('2026-10-07T12:09:58.000Z') });
    const onExpire = vi.fn();
    const view = render(<CallDeadline entry={confirmed} t={t} onExpire={onExpire} />);
    act(() => { vi.advanceTimersByTime(5000); });
    view.rerender(<CallDeadline entry={{ ...confirmed }} t={t} onExpire={onExpire} />);
    expect(onExpire).toHaveBeenCalledTimes(1);
  });

  it('does not announce an entry that is already expired when it appears', () => {
    vi.useFakeTimers({ now: Date.parse('2026-10-07T13:00:00.000Z') });
    const onExpire = vi.fn();
    render(<CallDeadline entry={confirmed} t={t} onExpire={onExpire} />);
    act(() => { vi.advanceTimersByTime(3000); });
    expect(onExpire).not.toHaveBeenCalled();
  });
});
