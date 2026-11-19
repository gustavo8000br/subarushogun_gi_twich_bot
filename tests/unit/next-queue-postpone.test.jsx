/** @vitest-environment jsdom */
import React from 'react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import QueueList from '../../apps/frontend/features/queues/queue-list.jsx';

// OPS-31 K72-01a ("Adiar"): the row, its order, its states, focus and the refresh affordance, with the real en catalog.
const catalog = Object.fromEntries(readFileSync(join(process.cwd(), 'apps/shared/localization/catalogs/panel/en.tsv'), 'utf8')
  .split('\n').filter((line) => line.includes('\t')).map((line) => { const i = line.indexOf('\t'); return [line.slice(0, i), line.slice(i + 1)]; }));
const t = (key, options) => (catalog[key] ?? key).replace(/\{(\w+)\}/g, (_, name) => String(options?.values?.[name] ?? ''));
const css = readFileSync(join(process.cwd(), 'apps/frontend/styles/panel.css'), 'utf8');

afterEach(cleanup);

const entry = (id, status, over = {}) => ({ id, userId: `uid-${id}`, userLogin: id, displayName: id.toUpperCase(), status, priorityClass: 'standard', position: status === 'waiting' ? 1 : null, version: 5, ...over });
const queue = (entries, over = {}) => ({
  id: 'q1', slug: 'arena', title: 'Arena', isOpen: true, lifecycleStatus: 'active', isArchived: false, queueMode: 'manual_only',
  rewardOrigin: 'none', remoteSyncStatus: 'local_only', entries, ...over,
});
const view = (queues, props = {}) => render(<QueueList queues={queues} locale="en" t={t} {...props} />);
const rowButtons = (id) => [...document.getElementById(`queue-entry-${id}`).querySelectorAll('button')].map((button) => button.textContent);

describe('Adiar button on the called row (A1, A8, A9)', () => {
  it('sits after "Resend call" and before "remove", in DOM = tab order, text only', () => {
    view([queue([entry('c', 'called')])]);
    expect(rowButtons('c')).toEqual(['start service', 'complete', 'Resend call', 'postpone', 'remove']);
    const button = screen.getByRole('button', { name: 'Postpone C: they go back to the waiting list' });
    expect(button.textContent).toBe('postpone');
    expect(button.querySelector('svg, img')).toBeNull();
    expect(button.getAttribute('type')).toBe('button');
  });

  it('calls the entry action with the version the operator saw (Enter/Space/click all end in a click)', () => {
    const onEntryAction = vi.fn();
    view([queue([entry('c', 'called', { version: 12 })])], { onEntryAction });
    fireEvent.click(screen.getByRole('button', { name: /^Postpone C/ }));
    expect(onEntryAction).toHaveBeenCalledTimes(1);
    expect(onEntryAction).toHaveBeenCalledWith('q1', 'c', 'postpone', { expectedVersion: 12 });
  });

  it('does not ask for confirmation (no dialog is opened)', () => {
    view([queue([entry('c', 'called')])], { onEntryAction: vi.fn() });
    fireEvent.click(screen.getByRole('button', { name: /^Postpone C/ }));
    expect(document.querySelector('dialog[open]')).toBeNull();
  });

  it('is absent for waiting and in-service people, and for archived or deleting queues', () => {
    view([queue([entry('w', 'waiting'), entry('s', 'in_progress')])]);
    expect(screen.queryByRole('button', { name: /^Postpone/ })).toBeNull();
    cleanup();
    for (const over of [{ isArchived: true }, { lifecycleStatus: 'deleting' }, { lifecycleStatus: 'deleted' }]) {
      view([queue([entry('c', 'called')], over)]);
      expect(screen.queryByRole('button', { name: /^Postpone/ }), JSON.stringify(over)).toBeNull();
      cleanup();
    }
  });

  it('stays enabled when calling is blocked (it does not talk to Twitch) and is disabled only while saving', () => {
    view([queue([entry('c', 'called')], { isOpen: false, remoteSyncStatus: 'pending' })], { queueCallRefreshRequired: true });
    expect(screen.getByRole('button', { name: /^Postpone C/ }).disabled).toBe(false);
    cleanup();
    view([queue([entry('c', 'called')])], { saving: true });
    expect(screen.getByRole('button', { name: /^Postpone C/ }).disabled).toBe(true);
  });
});

describe('Adiar while saving (A5)', () => {
  it('marks only the clicked button busy, keeping its text, and disables the neighbours', () => {
    view([queue([entry('c', 'called'), entry('d', 'called')])], { saving: true, queueAction: { queueId: 'q1', entryId: 'c', action: 'postpone', status: 'saving', key: '' } });
    const busy = screen.getByRole('button', { name: /^Postpone C/ });
    expect(busy.getAttribute('aria-busy')).toBe('true');
    expect(busy.textContent).toBe('postpone');
    expect(screen.getByRole('button', { name: /^Postpone D/ }).getAttribute('aria-busy')).toBeNull();
    expect([...document.querySelectorAll('.queue-entry-actions button')].every((button) => button.disabled)).toBe(true);
  });

  it('does not mark busy for another action on the same person', () => {
    view([queue([entry('c', 'called')])], { saving: true, queueAction: { queueId: 'q1', entryId: 'c', action: 'attend', status: 'saving', key: '' } });
    expect(screen.getByRole('button', { name: /^Postpone C/ }).getAttribute('aria-busy')).toBeNull();
  });
});

describe('Adiar results and focus (A1, A6, A7)', () => {
  it('moves focus to the "call" button of the same person once they are waiting', () => {
    const waiting = [queue([entry('c', 'waiting', { position: 2 })])];
    const action = { queueId: 'q1', entryId: 'c', action: 'postpone', status: 'confirmed', key: 'panel.queue.entry_action_result.postponed', values: { user: 'C', position: 2 } };
    const { rerender } = render(<QueueList queues={[queue([entry('c', 'called')])]} locale="en" t={t} />);
    rerender(<QueueList queues={waiting} locale="en" t={t} queueAction={action} />);
    expect(document.activeElement).toBe(document.getElementById('queue-entry-call-c'));
    expect(document.getElementById('queue-feedback-q1').textContent).toBe("C's turn was postponed. They stay in the queue, now at position 2.");
    expect(document.getElementById('queue-feedback-q1').getAttribute('role')).toBe('status');
  });

  it('falls back to the row, then to the message region, when "call" is disabled', () => {
    const action = { queueId: 'q1', entryId: 'c', action: 'postpone', status: 'confirmed', key: 'panel.queue.entry_action_result.postponed', values: { user: 'C', position: 1 } };
    view([queue([entry('c', 'waiting')])], { queueAction: action, queueCallRefreshRequired: true });
    expect(document.getElementById('queue-entry-call-c').disabled).toBe(true);
    expect(document.activeElement).toBe(document.getElementById('queue-entry-c'));
    cleanup();
    view([queue([])], { queueAction: action });
    expect(document.activeElement).toBe(document.getElementById('queue-feedback-q1'));
  });

  it('returns focus to the postpone button after a failed attempt, and does not steal focus after other actions', () => {
    const failed = { queueId: 'q1', entryId: 'c', action: 'postpone', status: 'error', key: 'panel.error.entry_version_stale' };
    view([queue([entry('c', 'called')])], { queueAction: failed });
    expect(document.activeElement).toBe(document.getElementById('queue-entry-postpone-c'));
    cleanup();
    document.body.focus();
    view([queue([entry('c', 'called')])], { queueAction: { ...failed, action: 'attend' } });
    expect(document.activeElement).toBe(document.body);
  });

  it.each([
    ['panel.error.entry_version_stale', "This person's status changed since the queue was loaded. Refresh the panel and try again."],
    ['panel.queue.entry_action_result.uncertain', 'The action may have been recorded. Refresh the queue before trying again.'],
  ])('shows %s as an alert with "Refresh queue" that reloads the list for the entry-action purpose', (key, text) => {
    const onRefreshProjection = vi.fn();
    view([queue([entry('c', 'called')])], { onRefreshProjection, queueAction: { queueId: 'q1', entryId: 'c', action: 'postpone', status: 'error', key, referenceId: 'ref-123' } });
    const region = document.getElementById('queue-feedback-q1');
    expect(region.getAttribute('role')).toBe('alert');
    expect(region.textContent).toContain(text);
    expect(region.textContent).toContain('Reference: ref-123');
    fireEvent.click(screen.getByRole('button', { name: 'Refresh queue' }));
    expect(onRefreshProjection).toHaveBeenCalledWith({ purpose: 'entry-action' });
  });

  it('offers no "Refresh queue" for an ordinary failure', () => {
    view([queue([entry('c', 'called')])], { queueAction: { queueId: 'q1', entryId: 'c', action: 'postpone', status: 'error', key: 'panel.queue.action_result.failed' } });
    expect(screen.queryByRole('button', { name: 'Refresh queue' })).toBeNull();
  });
});

describe('live regions and size (item 2)', () => {
  it('does not wrap the history list in a live region (it re-read the whole list); loading and error keep their own roles', () => {
    view([queue([])]);
    const content = document.querySelector('.queue-history .history-content');
    expect(content.hasAttribute('aria-live')).toBe(false);
  });

  it('keeps every row button at least 44 px high and 44 px wide in the stylesheet', () => {
    const rule = css.match(/\.queue-entry-actions button \{[^}]*\}/)[0];
    expect(rule).toMatch(/min-height: 44px/);
    expect(rule).toMatch(/min-width: 44px/);
  });
});
