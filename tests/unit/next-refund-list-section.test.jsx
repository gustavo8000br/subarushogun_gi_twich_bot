/** @vitest-environment jsdom */
import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { RefundListSection, refundListErrorKey, refundListClearConfirmKey } from '../../apps/frontend/features/settings/refund-list-section.jsx';

afterEach(cleanup);
beforeAll(() => {
  // jsdom has no <dialog> modal support
  HTMLDialogElement.prototype.showModal = function showModal() { this.setAttribute('open', ''); };
  HTMLDialogElement.prototype.close = function close() { this.removeAttribute('open'); this.dispatchEvent(new Event('close')); };
});

const COPY = {
  'panel.refund_list.title': 'Own refund list',
  'panel.refund_list.description': 'People you trust.',
  'panel.entry.twitch_login': 'Twitch login',
  'panel.entry.login_placeholder': '@username',
  'panel.refund_list.label': 'Label (optional)',
  'panel.refund_list.add': 'Add',
  'panel.refund_list.count': '{count} of {max}',
  'panel.refund_list.added_on': 'Added on {date}',
  'panel.refund_list.remove': 'Remove',
  'panel.refund_list.remove_aria': 'Remove {label} from the list',
  'panel.refund_list.removed': 'Removed {label}.',
  'panel.refund_list.unnamed': '(no label)',
  'panel.refund_list.clear': 'Clear all',
  'panel.refund_list.clear_confirm.one': 'Remove {count} person from the list?',
  'panel.refund_list.clear_confirm.other': 'Remove all {count} people from the list?',
  'panel.refund_list.clear_done': 'List cleared.',
  'panel.refund_list.empty': 'No one on the list yet.',
  'panel.refund_list.error.duplicate': 'This person is already on the list.',
  'panel.refund_list.error.limit': 'The list is full ({max} people).',
  'panel.refund_list.error.invalid': 'Enter a valid Twitch login.',
  'panel.entry.error.twitch_user_not_found': "We couldn't find @{user} on Twitch.",
  'panel.queue.dialog.back': 'Back',
  'panel.error.generic': 'Could not complete the action.',
};
const t = (key, options) => (COPY[key] ?? key).replace(/\{(\w+)\}/g, (_m, name) => String(options?.values?.[name] ?? `{${name}}`));
const item = (id, label, createdAt = '2030-01-01T10:00:00.000Z') => ({ id, label, createdAt });

function setup(responses) {
  const request = vi.fn(async (path, options = {}) => {
    const handler = responses[`${options.method ?? 'GET'} ${path}`] ?? responses[`${options.method ?? 'GET'} *`];
    if (!handler) throw Object.assign(new Error('unexpected'), { code: 'UNEXPECTED', status: 500 });
    return typeof handler === 'function' ? handler(options) : handler;
  });
  render(<RefundListSection t={t} request={request} locale="en" />);
  return request;
}

describe('own refund list section (AC 10, UX 2.6)', () => {
  it('loads the list, shows label, date and the counter, and never a Twitch account number', async () => {
    setup({ 'GET /api/refund-list': { items: [item('a', 'Friend'), item('b', null)], count: 2, max: 500 } });
    expect(await screen.findByText('Friend')).toBeTruthy();
    expect(screen.getByText('(no label)')).toBeTruthy();
    expect(screen.getByText('2 of 500')).toBeTruthy();
    expect(screen.getAllByText(/Added on/)).toHaveLength(2);
    expect(screen.getByRole('button', { name: 'Remove Friend from the list' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Own refund list' })).toBeTruthy();
  });

  it('shows the empty text, and Clear all is disabled with an empty list', async () => {
    setup({ 'GET /api/refund-list': { items: [], count: 0, max: 500 } });
    expect(await screen.findByText('No one on the list yet.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Clear all' }).disabled).toBe(true);
  });

  it('prefills the label with the typed login until the streamer edits it, then adds once and clears the form', async () => {
    const request = setup({
      'GET /api/refund-list': { items: [], count: 0, max: 500 },
      'POST /api/refund-list': (options) => ({ member: item('new', JSON.parse(options.body).label), count: 1, max: 500 }),
    });
    const login = await screen.findByRole('textbox', { name: 'Twitch login' });
    const label = screen.getByRole('textbox', { name: 'Label (optional)' });
    fireEvent.change(login, { target: { value: '@Friend_One' } });
    expect(label.value).toBe('Friend_One');
    fireEvent.change(label, { target: { value: 'My friend' } });
    fireEvent.change(login, { target: { value: 'Friend_Two' } });
    expect(label.value).toBe('My friend'); // edited: no longer follows the login
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    expect(await screen.findByText('My friend')).toBeTruthy();
    expect(request).toHaveBeenCalledWith('/api/refund-list', { method: 'POST', body: JSON.stringify({ login: 'Friend_Two', label: 'My friend' }) });
    expect(login.value).toBe('');
    expect(label.value).toBe('');
    expect(screen.getByText('1 of 500')).toBeTruthy();
  });

  it('refuses an invalid login without a request and maps the stable API codes to their texts', async () => {
    const failures = [
      [{ code: 'REFUND_LIST_DUPLICATE' }, 'This person is already on the list.'],
      [{ code: 'REFUND_LIST_FULL' }, 'The list is full (500 people).'],
      [{ code: 'TWITCH_USER_NOT_FOUND' }, "We couldn't find @friend on Twitch."],
      [{ code: 'SOMETHING_ELSE' }, 'Could not complete the action.'],
    ];
    let next = 0;
    const request = setup({
      'GET /api/refund-list': { items: [], count: 0, max: 500 },
      'POST /api/refund-list': () => { throw Object.assign(new Error('The request could not be completed.'), failures[next++][0]); },
    });
    const login = await screen.findByRole('textbox', { name: 'Twitch login' });
    fireEvent.change(login, { target: { value: 'bad login!' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    expect((await screen.findByRole('alert')).textContent).toBe('Enter a valid Twitch login.');
    expect(request).toHaveBeenCalledTimes(1); // only the initial read
    for (const [, text] of failures) {
      fireEvent.change(login, { target: { value: 'friend' } });
      fireEvent.click(screen.getByRole('button', { name: 'Add' }));
      await waitFor(() => expect(screen.getByRole('alert').textContent).toBe(text));
    }
    expect(screen.getByText('0 of 500')).toBeTruthy();
  });

  it('maps every closed error code to a catalog key and nothing from the server body', () => {
    expect(refundListErrorKey({ code: 'REFUND_LIST_DUPLICATE' })).toBe('panel.refund_list.error.duplicate');
    expect(refundListErrorKey({ code: 'REFUND_LIST_FULL' })).toBe('panel.refund_list.error.limit');
    expect(refundListErrorKey({ code: 'TWITCH_USER_NOT_FOUND' })).toBe('panel.entry.error.twitch_user_not_found');
    expect(refundListErrorKey({ code: 'REFUND_LIST_INVALID' })).toBe('panel.refund_list.error.invalid');
    expect(refundListErrorKey(new Error('private'))).toBe('panel.error.generic');
  });

  it('removes a person with a status message and moves focus to the next row, then to the heading when the list becomes empty', async () => {
    setup({
      'GET /api/refund-list': { items: [item('a', 'First'), item('b', 'Second')], count: 2, max: 500 },
      'POST /api/refund-list/a/remove': { count: 1, max: 500 },
      'POST /api/refund-list/b/remove': { count: 0, max: 500 },
    });
    fireEvent.click(await screen.findByRole('button', { name: 'Remove First from the list' }));
    await waitFor(() => expect(screen.queryByText('First')).toBeNull());
    expect(screen.getAllByRole('status').some((node) => node.textContent === 'Removed First.')).toBe(true);
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Remove Second from the list' }));
    fireEvent.click(screen.getByRole('button', { name: 'Remove Second from the list' }));
    await waitFor(() => expect(screen.getByText('No one on the list yet.')).toBeTruthy());
    expect(document.activeElement).toBe(screen.getByRole('heading', { name: 'Own refund list' }));
  });

  it('Clear all asks first with the count, Back keeps the list, confirming empties it and announces it', async () => {
    const request = setup({
      'GET /api/refund-list': { items: [item('a', 'First'), item('b', 'Second')], count: 2, max: 500 },
      'POST /api/refund-list/clear': { removed: 2, count: 0, max: 500 },
    });
    fireEvent.click(await screen.findByRole('button', { name: 'Clear all' }));
    const dialog = document.querySelector('dialog');
    expect(dialog.hasAttribute('open')).toBe(true);
    expect(within(dialog).getByText('Remove all 2 people from the list?')).toBeTruthy();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Back' }));
    expect(request).not.toHaveBeenCalledWith('/api/refund-list/clear', expect.anything());
    expect(screen.getByText('First')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Clear all' }));
    fireEvent.click(within(document.querySelector('dialog')).getByRole('button', { name: 'Clear all' }));
    await waitFor(() => expect(screen.getByText('No one on the list yet.')).toBeTruthy());
    expect(screen.getAllByRole('status').some((node) => node.textContent === 'List cleared.')).toBe(true);
  });

  it('a failed read shows the generic text instead of an empty list that could be mistaken for the truth', async () => {
    setup({ 'GET /api/refund-list': () => { throw Object.assign(new Error('x'), { code: 'REQUEST_FAILED' }); } });
    expect((await screen.findByRole('alert')).textContent).toBe('Could not complete the action.');
    expect(screen.queryByRole('textbox', { name: 'Twitch login' })).toBeNull();
  });

  it('the Add button is disabled when the list is full', async () => {
    setup({ 'GET /api/refund-list': { items: [item('a', 'Only')], count: 1, max: 1 } });
    fireEvent.change(await screen.findByRole('textbox', { name: 'Twitch login' }), { target: { value: 'friend' } });
    expect(screen.getByRole('button', { name: 'Add' }).disabled).toBe(true);
  });

  it('OPS-31 X2: picks the clear-confirmation plural form with native Intl rules per locale', () => {
    expect(refundListClearConfirmKey(1, 'en')).toBe('panel.refund_list.clear_confirm.one');
    expect(refundListClearConfirmKey(2, 'en')).toBe('panel.refund_list.clear_confirm.other');
    expect(refundListClearConfirmKey(1, 'es')).toBe('panel.refund_list.clear_confirm.one');
    expect(refundListClearConfirmKey(1_000_000, 'es')).toBe('panel.refund_list.clear_confirm.many');
    expect(refundListClearConfirmKey(1_000_000, 'pt-BR')).toBe('panel.refund_list.clear_confirm.many');
    expect(refundListClearConfirmKey(500, 'pt-BR')).toBe('panel.refund_list.clear_confirm.other');
    expect(refundListClearConfirmKey(3, 'not a locale')).toBe('panel.refund_list.clear_confirm.other');
  });

  it('OPS-31 X2: the dialog uses the singular form for one person', async () => {
    setup({ 'GET /api/refund-list': { items: [item('a', 'Only')], count: 1, max: 500 } });
    fireEvent.click(await screen.findByRole('button', { name: 'Clear all' }));
    expect(within(document.querySelector('dialog')).getByText('Remove 1 person from the list?')).toBeTruthy();
  });

  it('OPS-31 X2 a11y (a): the count line is not a live region, so only the notice announces', async () => {
    setup({
      'GET /api/refund-list': { items: [item('a', 'First')], count: 1, max: 500 },
      'POST /api/refund-list/a/remove': { count: 0, max: 500 },
    });
    const count = await screen.findByText('1 of 500');
    expect(count.getAttribute('role')).toBeNull();
    expect(count.closest('[aria-live], [role="status"], [role="alert"]')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Remove First from the list' }));
    await waitFor(() => expect(screen.getByText('0 of 500')).toBeTruthy());
    // exactly one live region carries the outcome
    expect(screen.getAllByRole('status')).toHaveLength(1);
    expect(screen.getByRole('status').textContent).toBe('Removed First.');
  });

  it('OPS-31 X2 a11y (b): the Clear all dialog is described by its consequence paragraph', async () => {
    setup({ 'GET /api/refund-list': { items: [item('a', 'First'), item('b', 'Second')], count: 2, max: 500 } });
    fireEvent.click(await screen.findByRole('button', { name: 'Clear all' }));
    const dialog = document.querySelector('dialog');
    const describedBy = dialog.getAttribute('aria-describedby');
    expect(describedBy).toBeTruthy();
    expect(document.getElementById(describedBy).textContent).toBe('Remove all 2 people from the list?');
    expect(document.getElementById(dialog.getAttribute('aria-labelledby')).textContent).toBe('Clear all');
  });

  it('OPS-31 X2 a11y (c): the form error is tied to the login field and the tie goes away when it is edited', async () => {
    setup({ 'GET /api/refund-list': { items: [], count: 0, max: 500 } });
    const login = await screen.findByRole('textbox', { name: 'Twitch login' });
    expect(login.getAttribute('aria-invalid')).toBeNull();
    expect(login.getAttribute('aria-describedby')).toBeNull();
    fireEvent.change(login, { target: { value: 'bad login!' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    const alert = await screen.findByRole('alert');
    expect(login.getAttribute('aria-invalid')).toBe('true');
    expect(document.getElementById(login.getAttribute('aria-describedby'))).toBe(alert);
    fireEvent.change(login, { target: { value: 'good_login' } });
    expect(login.getAttribute('aria-invalid')).toBeNull();
    expect(login.getAttribute('aria-describedby')).toBeNull();
  });

  it('OPS-31 X2 a11y (c): a server-side failure (not a field error) does not mark the login invalid', async () => {
    setup({
      'GET /api/refund-list': { items: [], count: 0, max: 500 },
      'POST /api/refund-list': () => { throw Object.assign(new Error('x'), { code: 'REFUND_LIST_DUPLICATE' }); },
    });
    const login = await screen.findByRole('textbox', { name: 'Twitch login' });
    fireEvent.change(login, { target: { value: 'friend' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    await screen.findByRole('alert');
    expect(login.getAttribute('aria-invalid')).toBeNull();
  });
});
