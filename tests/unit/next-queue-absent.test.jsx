/** @vitest-environment jsdom */
import React from 'react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import QueueList from '../../apps/frontend/features/queues/queue-list.jsx';

// OPS-31 K72-01b ("Ausentes" + "Restaurar"): the group, its states, the row, focus and the local notice region (real en catalog).
const parse = (locale) => Object.fromEntries(readFileSync(join(process.cwd(), `apps/shared/localization/catalogs/panel/${locale}.tsv`), 'utf8')
  .split('\n').filter((line) => line.includes('\t')).map((line) => { const i = line.indexOf('\t'); return [line.slice(0, i), line.slice(i + 1)]; }));
// Strict like the product catalog: a value the key does not declare is an error (the panel would show "Product text unavailable.").
const makeT = (catalog) => (key, options) => {
  const template = catalog[key] ?? key;
  const declared = new Set([...template.matchAll(/\{(\w+)\}/g)].map((match) => match[1]));
  for (const name of Object.keys(options?.values ?? {})) if (!declared.has(name)) throw new Error(`undeclared placeholder ${name} for ${key}`);
  return template.replace(/\{(\w+)\}/g, (_, name) => String(options?.values?.[name] ?? ''));
};
const en = parse('en');
const t = makeT(en);
const css = readFileSync(join(process.cwd(), 'apps/frontend/styles/panel.css'), 'utf8');

afterEach(cleanup);

const entry = (id, status, over = {}) => ({ id, userId: `uid-${id}`, userLogin: id, displayName: id.toUpperCase(), status, priorityClass: 'standard', position: status === 'waiting' ? 1 : null, version: 5, ...over });
const gone = (id, over = {}) => ({ id, userLogin: id, displayName: id.toUpperCase(), version: 6, finishedAt: '2030-03-01T10:00:00.000Z', ...over });
const absentOf = (entries, total = entries.length) => ({ total, entries });
const queue = (over = {}) => ({
  id: 'q1', slug: 'arena', title: 'Arena', isOpen: true, lifecycleStatus: 'active', isArchived: false, queueMode: 'manual_only',
  rewardOrigin: 'none', remoteSyncStatus: 'local_only', entries: [entry('w', 'waiting'), entry('c', 'called'), entry('s', 'in_progress')],
  absent: absentOf([gone('a'), gone('b'), gone('c2')]), ...over,
});
const view = (queues, props = {}) => render(<QueueList queues={queues} locale="en" t={t} {...props} />);
const group = () => document.querySelector('.queue-absent-group');
const restoreButtons = () => [...group().querySelectorAll('button[data-restore]')];

describe('group "Absent" in the live list (B1, B2, B3)', () => {
  it('is the last group, spans the full row, collapsed by default, with a visible counter and a plural screen-reader text', () => {
    view([queue()]);
    const groups = [...document.querySelectorAll('.queue-entry-groups > section')];
    expect(groups.map((node) => node.getAttribute('aria-label'))).toEqual(['Waiting', 'Called', 'In service', 'Absent']);
    expect(groups.at(-1)).toBe(group());
    const details = group().querySelector('details');
    expect(details.open).toBe(false);
    const summary = details.querySelector('summary');
    const chip = summary.querySelector('.queue-absent-count');
    expect(chip.textContent).toBe('3');
    expect(chip.getAttribute('aria-hidden')).toBe('true');
    expect(summary.textContent).toContain('Absent');
    expect(summary.querySelector('.queue-absent-sr').textContent).toBe('3 people absent');
    expect(css).toMatch(/\.queue-absent-group \{[^}]*grid-column: 1 \/ -1/);
  });

  it('lists the people in the order received (newest first) with name and a <time>, and a one-person text in singular', () => {
    view([queue({ absent: absentOf([gone('z', { finishedAt: '2030-03-02T12:00:00.000Z' }), gone('y', { finishedAt: null })]) })]);
    const rows = [...group().querySelectorAll('li')];
    expect(rows.map((row) => row.querySelector('.queue-absent-name').textContent.split(' · ')[0])).toEqual(['Z', 'Y']);
    expect(rows[0].querySelector('time').getAttribute('datetime')).toBe('2030-03-02T12:00:00.000Z');
    expect(rows[1].querySelector('time')).toBeNull();
    expect(rows[1].textContent).toContain('Date unavailable');
    cleanup();
    view([queue({ absent: absentOf([gone('solo')]) })]);
    expect(group().querySelector('.queue-absent-sr').textContent).toBe('1 person absent');
  });

  it('shows the empty state with counter 0 when total is 0, and no group at all when the field is missing or invalid', () => {
    view([queue({ absent: absentOf([]) })]);
    expect(group().querySelector('.queue-absent-count').textContent).toBe('0');
    expect(group().querySelector('details').open).toBe(false);
    expect(group().textContent).toContain('No one is absent');
    expect(restoreButtons()).toHaveLength(0);
    for (const absent of [undefined, null, { total: -1, entries: [] }, { total: 1, entries: [{ id: 1 }] }, 'x']) {
      cleanup();
      view([queue({ absent })]);
      expect(group(), JSON.stringify(absent)).toBeNull();
      expect(document.querySelectorAll('.queue-entry-groups > section')).toHaveLength(3);
    }
  });

  it('shows "Showing the 20 most recent of 25" only when there are more people than rows, with no inner scroll', () => {
    const twenty = Array.from({ length: 20 }, (_, i) => gone(`p${i}`));
    view([queue({ absent: absentOf(twenty, 25) })]);
    expect(restoreButtons()).toHaveLength(20);
    expect(group().textContent).toContain('Showing the 20 most recent of 25. Older ones stay in the recent history.');
    expect(css).not.toMatch(/\.queue-absent[^{]*\{[^}]*overflow-y/);
    cleanup();
    view([queue({ absent: absentOf(twenty, 20) })]);
    expect(group().textContent).not.toContain('Showing the');
  });

  it('is not rendered for archived or deleting queues, and only on the right queue when there are two (B8, B14)', () => {
    for (const over of [{ isArchived: true }, { lifecycleStatus: 'deleting' }, { lifecycleStatus: 'deleted' }]) {
      view([queue(over)]);
      expect(group(), JSON.stringify(over)).toBeNull();
      cleanup();
    }
    view([queue(), queue({ id: 'q2', title: 'Other', slug: 'other', entries: [], absent: absentOf([]) })]);
    const groups = [...document.querySelectorAll('.queue-absent-group')];
    expect(groups).toHaveLength(2);
    expect(groups[0].querySelector('.queue-absent-count').textContent).toBe('3');
    expect(groups[1].querySelector('.queue-absent-count').textContent).toBe('0');
  });

  it('reads the counter text with the plural of es and pt-BR (the counter never mixes keys)', () => {
    for (const locale of ['es', 'pt-BR']) {
      const tl = makeT(parse(locale));
      render(<QueueList queues={[queue({ absent: absentOf([gone('a')]) })]} locale={locale} t={tl} />);
      expect(group().querySelector('.queue-absent-sr').textContent).toBe(locale === 'es' ? '1 persona ausente' : '1 pessoa ausente');
      cleanup();
      render(<QueueList queues={[queue()]} locale={locale} t={tl} />);
      expect(group().querySelector('.queue-absent-sr').textContent).toBe(locale === 'es' ? '3 personas ausentes' : '3 pessoas ausentes');
      cleanup();
    }
  });
});

describe('"Restaurar" button on the row (B4, B11)', () => {
  it('has the visible word first in its accessible name, 44 px size, and sits in the shared row/actions classes', () => {
    view([queue()]);
    const button = screen.getByRole('button', { name: 'Restore A to the queue' });
    expect(button.textContent).toBe('restore');
    expect(button.closest('li').classList.contains('queue-entry-row')).toBe(true);
    expect(button.parentElement.classList.contains('queue-entry-actions')).toBe(true);
    expect(button.getAttribute('type')).toBe('button');
    expect(css).toMatch(/\.queue-entry-actions button \{[^}]*min-height: 44px[^}]*min-width: 44px/);
    expect(css).toMatch(/\.queue-absent-group summary \{[^}]*min-height: 44px/);
  });

  it('asks the provider to restore with the version of the absent entry, without a dialog', () => {
    const onEntryAction = vi.fn();
    view([queue({ absent: absentOf([gone('a', { version: 11 })]) })], { onEntryAction });
    fireEvent.click(screen.getByRole('button', { name: /^Restore A/ }));
    expect(onEntryAction).toHaveBeenCalledTimes(1);
    expect(onEntryAction).toHaveBeenCalledWith('q1', 'a', 'restore', { expectedVersion: 11 });
    expect(document.querySelector('dialog[open]')).toBeNull();
  });

  it('disables every restore button while saving, and marks only the clicked one busy keeping its text', () => {
    view([queue()], { saving: true, queueAction: { queueId: 'q1', entryId: 'b', action: 'restore', status: 'saving', key: '' } });
    expect(restoreButtons().every((button) => button.disabled)).toBe(true);
    expect(screen.getByRole('button', { name: /^Restore B/ }).getAttribute('aria-busy')).toBe('true');
    expect(screen.getByRole('button', { name: /^Restore B/ }).textContent).toBe('restore');
    expect(screen.getByRole('button', { name: /^Restore A/ }).getAttribute('aria-busy')).toBeNull();
  });

  it('keeps the tab order summary -> restore buttons in list order', () => {
    view([queue()]);
    const order = [...group().querySelectorAll('summary, button')].map((node) => node.tagName === 'SUMMARY' ? 'summary' : node.textContent);
    expect(order).toEqual(['summary', 'restore', 'restore', 'restore']);
  });
});

describe('local notice region of the group (B4, B5, B6, B7)', () => {
  it('keeps one status and one alert region always mounted inside the section, empty when nothing happened', () => {
    view([queue()]);
    const status = group().querySelector('[role="status"]');
    const alert = group().querySelector('[role="alert"]');
    expect(status).not.toBeNull();
    expect(alert).not.toBeNull();
    expect(status.textContent).toBe('');
    expect(alert.textContent).toBe('');
  });

  it('shows the restored text locally and does not repeat it in the card header (B4)', () => {
    const queueAction = { queueId: 'q1', entryId: 'a', action: 'restore', status: 'confirmed', key: 'panel.queue.entry_action_result.restored', values: { user: 'A', position: 2 } };
    view([queue({ absent: absentOf([gone('b')]) })], { queueAction });
    expect(group().querySelector('[role="status"]').textContent).toBe('A is no longer marked absent. They are back in the queue at position 2.');
    expect(document.getElementById('queue-feedback-q1')).toBeNull();
    expect(screen.getAllByText(/is no longer marked absent/)).toHaveLength(1);
  });

  it('does not take over the header region for other actions', () => {
    view([queue()], { queueAction: { queueId: 'q1', entryId: 'c', action: 'attend', status: 'confirmed', key: 'panel.queue.entry_action_result.saved' } });
    expect(document.getElementById('queue-feedback-q1')).not.toBeNull();
    expect(group().querySelector('[role="status"]').textContent).toBe('');
  });

  it.each([
    ['panel.error.entry_restore_intent_recorded', "A can't be restored: the refund or completion of the Channel Points is already recorded. To return, they need a new redemption or a manual entry."],
    ['panel.error.entry_restore_other_active', "A can't be restored: they already have another active entry in this queue. Check the lists above."],
  ])('shows the refusal %s as a local alert and swaps that row button for the same note (no new POST possible)', (key, text) => {
    const onEntryAction = vi.fn();
    view([queue()], { onEntryAction, queueAction: { queueId: 'q1', entryId: 'a', action: 'restore', status: 'error', key } });
    expect(group().querySelector('[role="alert"]').textContent).toContain(text);
    const row = document.getElementById('queue-absent-entry-a');
    expect(row.querySelector('button')).toBeNull();
    expect(row.textContent).toContain(text);
    expect(screen.queryByRole('button', { name: /^Restore A/ })).toBeNull();
    expect(screen.getByRole('button', { name: /^Restore B/ })).not.toBeNull();
    expect(document.activeElement).toBe(row);
    expect(document.getElementById('queue-feedback-q1')).toBeNull();
  });

  it('brings the button back after the next reload of the list (the refusal note is only until then)', () => {
    const action = { queueId: 'q1', entryId: 'a', action: 'restore', status: 'error', key: 'panel.error.entry_restore_other_active' };
    const { rerender } = render(<QueueList queues={[queue()]} locale="en" t={t} queueAction={action} />);
    expect(screen.queryByRole('button', { name: /^Restore A/ })).toBeNull();
    rerender(<QueueList queues={[queue({ absent: absentOf([gone('a'), gone('b'), gone('c2')]) })]} locale="en" t={t} queueAction={null} />);
    expect(screen.getByRole('button', { name: /^Restore A/ })).not.toBeNull();
  });

  it.each([
    ['panel.error.entry_version_stale', "This person's status changed since the queue was loaded. Refresh the panel and try again."],
    ['panel.queue.entry_action_result.uncertain', 'The action may have been recorded. Refresh the queue before trying again.'],
  ])('shows %s locally with "Refresh queue" and a safe reference, and returns focus to the row button', (key, text) => {
    const onRefreshProjection = vi.fn();
    view([queue()], { onRefreshProjection, queueAction: { queueId: 'q1', entryId: 'b', action: 'restore', status: 'error', key, referenceId: 'ref-77' } });
    const alert = group().querySelector('[role="alert"]');
    expect(alert.textContent).toContain(text);
    expect(alert.textContent).toContain('Reference: ref-77');
    fireEvent.click(within(alert).getByRole('button', { name: 'Refresh queue' }));
    expect(onRefreshProjection).toHaveBeenCalledWith({ purpose: 'entry-action' });
    expect(document.activeElement).toBe(document.getElementById('queue-absent-restore-b'));
    expect(document.getElementById('queue-feedback-q1')).toBeNull();
    expect(group().querySelectorAll('button[data-restore]')).toHaveLength(3); // the buttons stay: the action may not have happened
  });

  it('offers no "Refresh queue" for an ordinary failure', () => {
    view([queue()], { queueAction: { queueId: 'q1', entryId: 'a', action: 'restore', status: 'error', key: 'panel.queue.action_result.failed' } });
    expect(screen.queryByRole('button', { name: 'Refresh queue' })).toBeNull();
    expect(group().querySelector('[role="alert"]').textContent).toContain('Try again');
  });

  it('shows the reload-failed warning in the status region', () => {
    view([queue()], { queueAction: { queueId: 'q1', entryId: 'a', action: 'restore', status: 'warning', key: 'panel.queue.entry_action_result.refresh_failed' } });
    expect(group().querySelector('[role="status"]').textContent).toContain('could not refresh');
    expect(group().querySelector('[role="alert"]').textContent).toBe('');
  });
});

describe('focus after "Restaurar" (B4)', () => {
  const restored = { queueId: 'q1', entryId: 'b', action: 'restore', status: 'confirmed', key: 'panel.queue.entry_action_result.restored', values: { user: 'B', position: 2 } };

  it('stays in the group: on the restore button that took the place of the restored row', () => {
    const before = queue({ absent: absentOf([gone('a'), gone('b'), gone('c2')]) });
    const { rerender } = render(<QueueList queues={[before]} locale="en" t={t} onEntryAction={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /^Restore B/ })); // remembers the row position (index 1)
    rerender(<QueueList queues={[queue({ absent: absentOf([gone('a'), gone('c2')]) })]} locale="en" t={t} queueAction={restored} onEntryAction={vi.fn()} />);
    expect(document.activeElement).toBe(document.getElementById('queue-absent-restore-c2'));
    expect(group().querySelector('.queue-absent-count').textContent).toBe('2');
  });

  it('goes to the previous restore button when the last row was restored, and to the summary when none is left', () => {
    const { rerender } = render(<QueueList queues={[queue({ absent: absentOf([gone('a'), gone('b')]) })]} locale="en" t={t} onEntryAction={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /^Restore B/ }));
    rerender(<QueueList queues={[queue({ absent: absentOf([gone('a')]) })]} locale="en" t={t} queueAction={restored} onEntryAction={vi.fn()} />);
    expect(document.activeElement).toBe(document.getElementById('queue-absent-restore-a'));
    cleanup();
    const second = render(<QueueList queues={[queue({ absent: absentOf([gone('b')]) })]} locale="en" t={t} onEntryAction={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /^Restore B/ }));
    second.rerender(<QueueList queues={[queue({ absent: absentOf([]) })]} locale="en" t={t} queueAction={restored} onEntryAction={vi.fn()} />);
    expect(document.activeElement).toBe(group().querySelector('summary'));
  });

  it('does not move focus for other actions or other queues', () => {
    document.body.focus();
    view([queue()], { queueAction: { ...restored, action: 'attend' } });
    expect(document.activeElement).toBe(document.body);
    cleanup();
    view([queue()], { queueAction: { ...restored, queueId: 'other' } });
    expect(document.activeElement).toBe(document.body);
  });

  it('keeps the group open or closed across reloads (the element is not remounted)', () => {
    const { rerender } = render(<QueueList queues={[queue()]} locale="en" t={t} />);
    const details = group().querySelector('details');
    details.open = true;
    rerender(<QueueList queues={[queue({ absent: absentOf([gone('a')]) })]} locale="en" t={t} />);
    expect(group().querySelector('details')).toBe(details);
    expect(details.open).toBe(true);
  });
});

describe('recent history stays read-only (B9)', () => {
  it('lists a no_show without any button', async () => {
    const onLoadHistory = vi.fn(async () => [{ id: 'h1', userLogin: 'h1', displayName: 'H1', status: 'no_show', finishedAt: '2030-03-01T10:00:00.000Z' }]);
    view([queue({ absent: absentOf([]) })], { onLoadHistory });
    const history = document.querySelector('.queue-history');
    history.open = true;
    fireEvent(history, new Event('toggle'));
    const line = await screen.findByText(/H1 · No-show/);
    expect(line.querySelector('button')).toBeNull();
    expect(history.querySelectorAll('button:not(.small-action)')).toHaveLength(0);
  });
});
