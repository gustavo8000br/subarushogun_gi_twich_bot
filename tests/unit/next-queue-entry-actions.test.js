import { readFile } from 'node:fs/promises';
import { describe, expect, it, vi } from 'vitest';
import {
  getQueueEntryActionFeedback,
  getManualQueueEntryFailureKey,
  performQueueEntryAction,
  performQueueEntryActionWithRefresh,
} from '../../apps/frontend/features/queues/queue-entry-actions.mjs';

describe('Next queue entry actions', () => {
  it.each([404, 409])('does not attribute an ambiguous HTTP %s to the viewer account', (status) => {
    expect(getManualQueueEntryFailureKey({ status })).toBe('panel.entry.error.unavailable');
  });

  it('maps invalid manual-entry fields separately from a server failure', () => {
    expect(getManualQueueEntryFailureKey({ status: 400 })).toBe('panel.entry.error.invalid');
    expect(getManualQueueEntryFailureKey({ status: 503 })).toBe('panel.entry.error.failed');
  });

  it.each([
    ['en', 'The entry could not be added. Refresh the panel and try again.'],
    ['es', 'No se pudo añadir la entrada. Actualiza el panel e inténtalo de nuevo.'],
    ['pt-BR', 'Não foi possível adicionar a entrada. Atualize o painel e tente novamente.'],
  ])('keeps the unavailable-entry message neutral in the %s catalog', async (locale, expectedMessage) => {
    const catalog = await readFile(new URL(`../../apps/web/localization/catalogs/panel/${locale}.tsv`, import.meta.url), 'utf8');
    expect(catalog).toContain(`panel.entry.error.unavailable\t${expectedMessage}`);
  });

  it('adds a manually entered viewer through the existing queue route', async () => {
    const request = vi.fn().mockResolvedValue({ id: 'entry-1', status: 'waiting', position: 2 });
    await expect(performQueueEntryAction({
      request, queueId: 'queue 1', action: 'add-manual', login: 'viewer_name', uid: '123456789', priority: true, priorityReason: 'bits',
    })).resolves.toMatchObject({ id: 'entry-1', status: 'waiting', position: 2 });
    expect(request).toHaveBeenCalledWith('/api/queues/queue%201/manual-entries', {
      method: 'POST',
      body: JSON.stringify({ login: 'viewer_name', uid: '123456789', priority: true, priorityReason: 'bits' }),
    });
  });

  it('rejects invalid manual-entry payloads before making a request', async () => {
    const request = vi.fn();
    await expect(performQueueEntryAction({ request, queueId: 'queue-1', action: 'add-manual', login: 'bad login' }))
      .rejects.toMatchObject({ code: 'INVALID_QUEUE_ENTRY_ACTION_REQUEST' });
    expect(request).not.toHaveBeenCalled();
  });

  it('keeps an accepted manual entry when refreshing the queue projection fails', async () => {
    const request = vi.fn()
      .mockResolvedValueOnce({ id: 'entry-1', status: 'waiting', position: 1 })
      .mockRejectedValueOnce(new Error('temporary read failure'));
    await expect(performQueueEntryActionWithRefresh({
      request, queueId: 'queue-1', action: 'add-manual', login: 'viewer',
    })).resolves.toMatchObject({ result: { id: 'entry-1' }, queues: null, refreshFailed: true });
  });

  it('reports accepted manual entries as saved', () => {
    expect(getQueueEntryActionFeedback({ action: 'add-manual', result: { id: 'entry-1', status: 'waiting', position: 1 } }))
      .toEqual({ status: 'confirmed', key: 'panel.entry.added' });
  });

  it('calls the next viewer through the existing queue route', async () => {
    const request = vi.fn().mockResolvedValue({ status: 'called', count: 1 });
    await expect(performQueueEntryAction({ request, queueId: 'queue-1', action: 'call-next' })).resolves.toMatchObject({ status: 'called', count: 1 });
    expect(request).toHaveBeenCalledWith('/api/queues/queue-1/call', { method: 'POST', body: JSON.stringify({ count: 1 }) });
  });

  it('rejects a next-call response that exceeds the requested single entry', async () => {
    const request = vi.fn().mockResolvedValue({ status: 'called', count: 2 });
    await expect(performQueueEntryAction({ request, queueId: 'queue-1', action: 'call-next' }))
      .rejects.toMatchObject({ code: 'INVALID_QUEUE_ENTRY_ACTION_RESPONSE' });
  });

  it('calls a selected waiting entry through the existing queue route', async () => {
    const request = vi.fn().mockResolvedValue({ status: 'called', id: 'entry-1' });
    await expect(performQueueEntryAction({ request, queueId: 'queue-1', entryId: 'entry-1', action: 'call' })).resolves.toMatchObject({ status: 'called' });
    expect(request).toHaveBeenCalledWith('/api/queues/queue-1/call', { method: 'POST', body: JSON.stringify({ count: 1, entryId: 'entry-1' }) });
  });

  it.each([
    ['attend', 'in_progress', 'service_started'],
    ['complete', 'completed', 'service_completed'],
    ['remove', 'removed', 'operator_removed'],
  ])('maps %s to the established entry transition contract', async (action, to, reason) => {
    const request = vi.fn().mockResolvedValue({ status: to, id: 'entry-1' });
    await expect(performQueueEntryAction({ request, queueId: 'queue-1', entryId: 'entry-1', action })).resolves.toMatchObject({ status: to });
    expect(request).toHaveBeenCalledWith('/api/entries/entry-1/transitions', { method: 'POST', body: JSON.stringify({ to, reason }) });
  });

  it('rejects transition results that do not confirm the requested local state', async () => {
    const request = vi.fn().mockResolvedValue({ status: 'called', id: 'entry-1' });
    await expect(performQueueEntryAction({ request, queueId: 'queue-1', entryId: 'entry-1', action: 'complete' })).rejects.toMatchObject({ code: 'INVALID_QUEUE_ENTRY_ACTION_RESPONSE' });
  });

  it('resends the queued call notification through the established endpoint', async () => {
    const request = vi.fn().mockResolvedValue({ status: 'queued', entryId: 'entry-1' });
    await expect(performQueueEntryAction({ request, queueId: 'queue-1', entryId: 'entry-1', action: 'resend-call' })).resolves.toMatchObject({ status: 'queued' });
    expect(request).toHaveBeenCalledWith('/api/entries/entry-1/call-notification/resend', { method: 'POST' });
  });

  it('reports an empty next-call result as information instead of success', () => {
    expect(getQueueEntryActionFeedback({ action: 'call-next', result: { status: 'called', count: 0 } })).toEqual({
      status: 'info', key: 'panel.queue.action_result.no_waiting',
    });
  });

  it('reports a successful next-call result as confirmed', () => {
    expect(getQueueEntryActionFeedback({ action: 'call-next', result: { status: 'called', count: 1 } })).toEqual({
      status: 'confirmed', key: 'panel.queue.entry_action_result.saved',
    });
  });

  it('keeps an accepted mutation when the queue projection refresh fails', async () => {
    const request = vi.fn()
      .mockResolvedValueOnce({ status: 'completed', id: 'entry-1' })
      .mockRejectedValueOnce(new Error('temporary read failure'));
    await expect(performQueueEntryActionWithRefresh({
      request, queueId: 'queue-1', entryId: 'entry-1', action: 'complete',
    })).resolves.toEqual({ result: { status: 'completed', id: 'entry-1' }, queues: null, refreshFailed: true });
  });

  it('reports a successful mutation with a stale projection truthfully', () => {
    expect(getQueueEntryActionFeedback({
      action: 'complete', result: { status: 'completed', id: 'entry-1' }, refreshFailed: true,
    })).toEqual({ status: 'warning', key: 'panel.queue.entry_action_result.refresh_failed' });
  });

  it('preserves the empty-queue result when a no-op refresh fails', () => {
    expect(getQueueEntryActionFeedback({
      action: 'call-next', result: { status: 'called', count: 0 }, refreshFailed: true,
    })).toEqual({ status: 'info', key: 'panel.queue.action_result.no_waiting' });
  });
});
