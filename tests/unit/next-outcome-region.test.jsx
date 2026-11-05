/** @vitest-environment jsdom */
import React from 'react';
import { readFileSync } from 'node:fs';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../apps/frontend/lib/api/client.mjs', () => ({
  apiClient: { request: vi.fn(), initializeSession: vi.fn(async () => ({ status: 'ready' })) },
}));
vi.mock('../../apps/frontend/features/panel-shell/post-action-route.mjs', async (importOriginal) => ({
  ...(await importOriginal()),
  navigateTo: vi.fn(),
}));

import { apiClient } from '../../apps/frontend/lib/api/client.mjs';
import { navigateTo } from '../../apps/frontend/features/panel-shell/post-action-route.mjs';
import PanelShell from '../../apps/frontend/features/panel-shell/panel-shell.jsx';
import OutcomeRegion from '../../apps/frontend/features/panel-shell/outcome-region.jsx';
import QueuesPageContent from '../../apps/frontend/features/queues/queues-page-content.jsx';
import NewQueuePageContent from '../../apps/frontend/features/queues/new-queue-page-content.jsx';

const ID_A = '0b1f1ef0-0ac0-4e63-b71c-e608f5aa1b20';
const ID_B = '7c9d3f10-1d2e-4a55-9a43-0a8f1f6d2b11';

function loadCatalog(locale) {
  return Object.fromEntries(readFileSync(`apps/shared/localization/catalogs/panel/${locale}.tsv`, 'utf8').trim().split('\n').map((line) => {
    const separator = line.indexOf('\t');
    return [line.slice(0, separator), line.slice(separator + 1)];
  }));
}
const ptBR = loadCatalog('pt-BR');
const bundle = { locales: ['pt-BR'], modules: { panel: { catalogs: { 'pt-BR': ptBR } } } };
const state = { product_version: '0.2.1-beta', account: { label: 'Streamer' }, pending_operations: [] };

const baseQueue = (id, title, extra = {}) => ({
  id, slug: title.toLowerCase(), title, isOpen: false, isArchived: false, version: 3, lifecycleStatus: 'active',
  queueMode: 'channel_points', rewardOrigin: 'twitch', rewardId: `reward-${title}`, remoteSyncStatus: 'synced',
  modeTransitionStatus: 'none', entries: [], ...extra,
});

let queues;
let handlers;
function mockApi({ onPost } = {}) {
  apiClient.request.mockImplementation(async (path, options = {}) => {
    if (handlers?.[`${options.method ?? 'GET'} ${path}`]) return handlers[`${options.method ?? 'GET'} ${path}`](options);
    if (path === '/api/localization/catalogs') return bundle;
    if (path === '/api/state') return state;
    if (path === '/api/setup') return { connected: true };
    if (path === '/health') return { status: 'ok', dependencies: {} };
    if (path === '/api/queues' && !options.method) return structuredClone(queues);
    if (options.method === 'POST' && onPost) return onPost(path, options);
    throw new Error(`Unexpected request: ${path}`);
  });
}

beforeAll(() => {
  HTMLDialogElement.prototype.showModal ??= function showModal() { this.setAttribute('open', ''); };
  HTMLDialogElement.prototype.close ??= function close() { this.removeAttribute('open'); this.dispatchEvent(new Event('close')); };
});
beforeEach(() => { window.history.replaceState({}, '', '/queues/'); handlers = {}; });
afterEach(() => { cleanup(); vi.clearAllMocks(); vi.useRealTimers(); });

const region = (container) => container.querySelector('.outcome-region');

describe('K23-01 / R4: one container with two live elements, always mounted and empty at first render', () => {
  it.each([
    ['loading', () => { apiClient.request.mockImplementation(() => new Promise(() => {})); }],
    ['unavailable', () => { apiClient.request.mockRejectedValue(new Error('down')); }],
    ['ready', () => { queues = [baseQueue(ID_A, 'Arena')]; mockApi(); }],
  ])('on the %s status', async (status, setup) => {
    setup();
    const { container } = render(<PanelShell fallbackCatalog={{ 'pt-BR': ptBR }} activePage="queues"><QueuesPageContent /></PanelShell>);
    if (status === 'ready') await screen.findByRole('heading', { level: 1 });
    if (status === 'unavailable') await screen.findAllByRole('alert');
    expect(container.querySelectorAll('.outcome-region')).toHaveLength(1);
    const live = region(container).querySelectorAll('[role="status"], [role="alert"]');
    expect([...live].map((element) => element.getAttribute('role')).sort()).toEqual(['alert', 'status']);
    for (const element of live) expect(element.textContent).toBe('');
  });
});

describe('OutcomeRegion', () => {
  const t = (key, options) => `${key}${options?.values?.count ? `:${options.values.count}` : ''}`;

  it('K23-07: dismiss and action controls live outside the live elements; the other element is emptied on a new outcome', () => {
    const onDismiss = vi.fn();
    const { container, rerender } = render(<OutcomeRegion outcome={{ key: 'panel.queue.deletion.blocked.generic', element: 'alert', action: 'operations' }} t={t} locale="pt-BR" onDismiss={onDismiss} onRefresh={vi.fn()} />);
    const alert = container.querySelector('[role="alert"]');
    const status = container.querySelector('[role="status"]');
    expect(alert.textContent).toBe('panel.queue.deletion.blocked.generic');
    expect(status.textContent).toBe('');
    const dismiss = screen.getByRole('button', { name: 'panel.outcome.dismiss' });
    const link = screen.getByRole('link', { name: 'panel.queue.deletion.blocked_link' });
    expect(alert.contains(dismiss) || status.contains(dismiss) || alert.contains(link) || status.contains(link)).toBe(false);
    expect(region(container).contains(dismiss)).toBe(true);
    const sameAlert = alert; const sameStatus = status;
    rerender(<OutcomeRegion outcome={{ key: 'panel.outcome.refreshed', element: 'status' }} t={t} locale="pt-BR" onDismiss={onDismiss} onRefresh={vi.fn()} />);
    expect(container.querySelector('[role="alert"]')).toBe(sameAlert);
    expect(container.querySelector('[role="status"]')).toBe(sameStatus);
    expect(sameAlert.textContent).toBe('');
    expect(sameStatus.textContent).toBe('panel.outcome.refreshed');
    fireEvent.click(screen.getByRole('button', { name: 'panel.outcome.dismiss' }));
    expect(onDismiss).toHaveBeenCalled();
  });

  it('never changes the role of a populated element (the same two nodes survive every outcome)', () => {
    const { container, rerender } = render(<OutcomeRegion outcome={null} t={t} locale="pt-BR" onDismiss={vi.fn()} onRefresh={vi.fn()} />);
    const nodes = [...container.querySelectorAll('[role]')];
    for (const outcome of [{ key: 'a', element: 'status' }, { key: 'b', element: 'alert' }, null, { key: 'c', element: 'status' }]) {
      rerender(<OutcomeRegion outcome={outcome} t={t} locale="pt-BR" onDismiss={vi.fn()} onRefresh={vi.fn()} />);
      expect([...container.querySelectorAll('[role]')].filter((node) => ['status', 'alert'].includes(node.getAttribute('role')))).toEqual(nodes);
    }
  });

  it('K23-07: no auto-dismiss (10 minutes of fake time)', () => {
    vi.useFakeTimers();
    const { container } = render(<OutcomeRegion outcome={{ key: 'panel.outcome.refreshed', element: 'status' }} t={t} locale="pt-BR" onDismiss={vi.fn()} onRefresh={vi.fn()} />);
    act(() => { vi.advanceTimersByTime(10 * 60 * 1000); });
    expect(container.querySelector('[role="status"]').textContent).toBe('panel.outcome.refreshed');
  });

  it('K23-09: counts use the plural forms of the locale (1 -> one, 0 -> other, 3 -> other/many)', () => {
    const forms = (count, locale) => {
      const { container, unmount } = render(<OutcomeRegion outcome={{ key: 'panel.queue.deletion.blocked', count, element: 'alert' }} t={t} locale={locale} onDismiss={vi.fn()} onRefresh={vi.fn()} />);
      const text = container.querySelector('[role="alert"]').textContent;
      unmount();
      return text;
    };
    expect(forms(1, 'pt-BR')).toBe('panel.queue.deletion.blocked.one:1');
    expect(forms(3, 'pt-BR')).toBe('panel.queue.deletion.blocked.other:3');
    expect(forms(0, 'en')).toBe('panel.queue.deletion.blocked.other:0');
    expect(forms(1, 'es')).toBe('panel.queue.deletion.blocked.one:1');
  });

  it('shows a validated reference id as a separate small line inside the message', () => {
    const { container } = render(<OutcomeRegion outcome={{ key: 'x', element: 'alert', referenceId: 'cancel-op-17' }} t={(key, options) => (key === 'panel.error.reference' ? `Ref ${options.values.id}` : key)} locale="pt-BR" onDismiss={vi.fn()} onRefresh={vi.fn()} />);
    expect(container.querySelector('[role="alert"] small').textContent).toBe('Ref cancel-op-17');
  });
});

describe('K23-06 / R3: programmatic focus targets', () => {
  it('both page h1 and the queue title h2 carry tabindex -1', async () => {
    queues = [baseQueue(ID_A, 'Arena')];
    mockApi();
    const first = render(<PanelShell fallbackCatalog={{ 'pt-BR': ptBR }} activePage="queues"><QueuesPageContent /></PanelShell>);
    expect((await screen.findByRole('heading', { level: 1 })).getAttribute('tabindex')).toBe('-1');
    expect(first.container.querySelector(`#queue-title-${ID_A}`).getAttribute('tabindex')).toBe('-1');
    cleanup();
    const second = render(<PanelShell fallbackCatalog={{ 'pt-BR': ptBR }} activePage="new_queue"><NewQueuePageContent /></PanelShell>);
    await waitFor(() => expect(second.container.querySelector('main h1')).toBeTruthy());
    expect(second.container.querySelector('main h1').getAttribute('tabindex')).toBe('-1');
  });
});

describe('URL arrival (AC 2, 6, 11)', () => {
  it('applies a valid create outcome, removes the parameters, writes into status and focuses the new queue title', async () => {
    queues = [baseQueue(ID_A, 'Arena'), baseQueue(ID_B, 'Duelo')];
    mockApi();
    window.history.replaceState({}, '', `/queues/?outcome=queue_created&queue=${ID_B}`);
    const { container } = render(<PanelShell fallbackCatalog={{ 'pt-BR': ptBR }} activePage="queues"><QueuesPageContent /></PanelShell>);
    await waitFor(() => expect(container.querySelector('.outcome-region [role="status"]').textContent).toContain('Fila criada.'));
    expect(container.querySelector('.outcome-region [role="status"]').textContent).not.toMatch(/sincronizada com sucesso|Twitch funcionou/);
    expect(window.location.search).toBe('');
    await waitFor(() => expect(document.activeElement?.id).toBe(`queue-title-${ID_B}`));
  });

  it('falls back to the page h1 when the created queue is not in the projection', async () => {
    queues = [baseQueue(ID_A, 'Arena')];
    mockApi();
    window.history.replaceState({}, '', `/queues/?outcome=queue_created&queue=${ID_B}`);
    render(<PanelShell fallbackCatalog={{ 'pt-BR': ptBR }} activePage="queues"><QueuesPageContent /></PanelShell>);
    const h1 = await screen.findByRole('heading', { level: 1 });
    await waitFor(() => expect(document.activeElement).toBe(h1));
  });

  it('ignores an unknown code or a malformed UUID: no message, parameters removed, nothing reflected', async () => {
    queues = [baseQueue(ID_A, 'Arena')];
    mockApi();
    window.history.replaceState({}, '', '/queues/?outcome=%3Cb%3Ehi%3C%2Fb%3E&queue=nope');
    const { container } = render(<PanelShell fallbackCatalog={{ 'pt-BR': ptBR }} activePage="queues"><QueuesPageContent /></PanelShell>);
    await screen.findByRole('heading', { level: 1 });
    expect(window.location.search).toBe('');
    for (const element of container.querySelectorAll('.outcome-region [role]')) expect(element.textContent).toBe('');
    expect(container.innerHTML).not.toContain('&lt;b&gt;hi');
  });

  it('delete-last outcome on /new-queue/ writes the type-specific message and focuses the h1', async () => {
    queues = [];
    mockApi();
    window.history.replaceState({}, '', `/new-queue/?outcome=queue_deleted_last_reward&queue=${ID_A}`);
    const { container } = render(<PanelShell fallbackCatalog={{ 'pt-BR': ptBR }} activePage="new_queue"><NewQueuePageContent /></PanelShell>);
    await waitFor(() => expect(container.querySelector('.outcome-region [role="status"]').textContent).toContain('Fila excluída. A Twitch confirmou que a recompensa foi excluída'));
    await waitFor(() => expect(document.activeElement).toBe(container.querySelector('main h1')));
  });
});

describe('K23-02 / K23-10 / AC 1, 4: the delete message survives the card and focus lands on a live target', () => {
  async function deleteQueue(title) {
    const card = (await screen.findByRole('heading', { level: 2, name: title })).closest('article');
    fireEvent.click(within(card).getByRole('button', { name: 'Excluir fila' }));
    const dialog = document.querySelector('dialog[open]');
    fireEvent.click(within(dialog).getAllByRole('button')[1]);
  }

  it('deleting one of two queues keeps the message after the card unmounts and focuses the h1', async () => {
    queues = [baseQueue(ID_A, 'Arena'), baseQueue(ID_B, 'Duelo')];
    mockApi({ onPost: (path) => {
      if (path.endsWith('/delete')) { queues = [baseQueue(ID_B, 'Duelo')]; return { status: 'deleted', deletionState: null, queue: { ...baseQueue(ID_A, 'Arena'), lifecycleStatus: 'deleted' } }; }
      throw new Error(path);
    } });
    const { container } = render(<PanelShell fallbackCatalog={{ 'pt-BR': ptBR }} activePage="queues"><QueuesPageContent /></PanelShell>);
    await deleteQueue('Arena');
    await waitFor(() => expect(container.querySelector('.outcome-region [role="status"]').textContent).toContain('Fila excluída. A Twitch confirmou'));
    expect(screen.queryByRole('heading', { level: 2, name: 'Arena' })).toBeNull();
    expect(navigateTo).not.toHaveBeenCalled();
    await waitFor(() => expect(document.activeElement).toBe(container.querySelector('main h1')));
  });

  it('deleting the last queue navigates once, through navigateTo, to /new-queue/ with the closed code and the UUID', async () => {
    queues = [baseQueue(ID_A, 'Arena')];
    mockApi({ onPost: (path) => {
      if (path.endsWith('/delete')) { queues = []; return { status: 'deleted', deletionState: null, queue: { ...baseQueue(ID_A, 'Arena'), lifecycleStatus: 'deleted' } }; }
      throw new Error(path);
    } });
    render(<PanelShell fallbackCatalog={{ 'pt-BR': ptBR }} activePage="queues"><QueuesPageContent /></PanelShell>);
    await deleteQueue('Arena');
    await waitFor(() => expect(navigateTo).toHaveBeenCalledTimes(1));
    expect(navigateTo).toHaveBeenCalledWith(`/new-queue/?outcome=queue_deleted_last_reward&queue=${ID_A}`);
  });

  it('a pending delete stays on /queues/, keeps the card and the message, and focuses the card title', async () => {
    queues = [baseQueue(ID_A, 'Arena')];
    mockApi({ onPost: (path) => {
      if (path.endsWith('/delete')) {
        queues = [baseQueue(ID_A, 'Arena', { lifecycleStatus: 'deleting', remoteSyncStatus: 'delete_pending', deletionState: 'pending', canCancelDeletion: true })];
        return { status: 'pending', deletionState: 'pending', queue: queues[0] };
      }
      throw new Error(path);
    } });
    const { container } = render(<PanelShell fallbackCatalog={{ 'pt-BR': ptBR }} activePage="queues"><QueuesPageContent /></PanelShell>);
    await deleteQueue('Arena');
    await waitFor(() => expect(container.querySelector('.outcome-region [role="status"]').textContent).toContain('Exclusão pendente.'));
    expect(navigateTo).not.toHaveBeenCalled();
    await waitFor(() => expect(document.activeElement?.id).toBe(`queue-title-${ID_A}`));
    expect(screen.getByRole('button', { name: 'Cancelar exclusão' })).toBeTruthy();
  });

  it('"Atualizar filas" reloads the projection and replaces the message with the refreshed text', async () => {
    queues = [baseQueue(ID_A, 'Arena')];
    mockApi({ onPost: (path) => {
      if (path.endsWith('/delete')) {
        queues = [baseQueue(ID_A, 'Arena', { lifecycleStatus: 'deleting', remoteSyncStatus: 'delete_pending', deletionState: 'pending' })];
        return { status: 'pending', deletionState: 'pending', queue: queues[0] };
      }
      throw new Error(path);
    } });
    const { container } = render(<PanelShell fallbackCatalog={{ 'pt-BR': ptBR }} activePage="queues"><QueuesPageContent /></PanelShell>);
    await deleteQueue('Arena');
    fireEvent.click(await screen.findByRole('button', { name: 'Atualizar filas' }));
    await waitFor(() => expect(container.querySelector('.outcome-region [role="status"]').textContent).toBe('Filas atualizadas.'));
  });

  it('the cancel refusal 409 QUEUE_DELETION_ALREADY_COMPLETED is mapped by code into the alert element', async () => {
    queues = [baseQueue(ID_A, 'Arena', { lifecycleStatus: 'deleting', remoteSyncStatus: 'delete_pending', deletionState: 'pending', canCancelDeletion: true })];
    mockApi({ onPost: () => { throw Object.assign(new Error('x'), { code: 'QUEUE_DELETION_ALREADY_COMPLETED', status: 409 }); } });
    const { container } = render(<PanelShell fallbackCatalog={{ 'pt-BR': ptBR }} activePage="queues"><QueuesPageContent /></PanelShell>);
    const card = (await screen.findByRole('heading', { level: 2, name: 'Arena' })).closest('article');
    fireEvent.click(within(card).getByRole('button', { name: 'Cancelar exclusão' }));
    fireEvent.click(within(document.querySelector('dialog[open]')).getAllByRole('button')[1]);
    await waitFor(() => expect(container.querySelector('.outcome-region [role="alert"]').textContent).toContain('A Twitch já confirmou que a reward foi excluída'));
  });
});

describe('K23-03 / UX-7: creating a queue', () => {
  async function submitForm(container) {
    await waitFor(() => expect(container.querySelector('input[name="title"]')).toBeTruthy());
    fireEvent.change(container.querySelector('input[name="title"]'), { target: { value: 'Nova' } });
    fireEvent.change(container.querySelector('select[name="queueMode"]'), { target: { value: 'manual_only' } });
    fireEvent.click(container.querySelector('button[type="submit"]'));
  }

  it('a confirmed create navigates once to /queues/ with the closed code and the UUID', async () => {
    queues = [];
    mockApi({ onPost: (path) => {
      if (path === '/api/queues') { const created = baseQueue(ID_A, 'Nova', { queueMode: 'manual_only', rewardId: null, rewardOrigin: 'none', remoteSyncStatus: 'local_only' }); queues = [created]; return created; }
      throw new Error(path);
    } });
    const { container } = render(<PanelShell fallbackCatalog={{ 'pt-BR': ptBR }} activePage="new_queue"><NewQueuePageContent /></PanelShell>);
    await submitForm(container);
    await waitFor(() => expect(navigateTo).toHaveBeenCalledTimes(1));
    expect(navigateTo).toHaveBeenCalledWith(`/queues/?outcome=queue_created_local&queue=${ID_A}`);
  });

  it('an uncertain create does not navigate, keeps the alert with the Open queues link and the submit disabled', async () => {
    queues = [];
    mockApi({ onPost: () => { throw Object.assign(new Error('boom'), { code: 'INTERNAL_ERROR', status: 503 }); } });
    const { container } = render(<PanelShell fallbackCatalog={{ 'pt-BR': ptBR }} activePage="new_queue"><NewQueuePageContent /></PanelShell>);
    await submitForm(container);
    await waitFor(() => expect(container.querySelector('.queue-creation-feedback[role="alert"], .queue-creation-feedback')).toBeTruthy());
    await waitFor(() => expect(container.querySelector('button[type="submit"]').disabled).toBe(true));
    expect(navigateTo).not.toHaveBeenCalled();
    expect(screen.getByRole('link', { name: 'Abrir filas' })).toBeTruthy();
    const posts = apiClient.request.mock.calls.filter(([path, options]) => path === '/api/queues' && options?.method === 'POST');
    fireEvent.click(container.querySelector('button[type="submit"]'));
    expect(apiClient.request.mock.calls.filter(([path, options]) => path === '/api/queues' && options?.method === 'POST')).toHaveLength(posts.length);
  });
});
