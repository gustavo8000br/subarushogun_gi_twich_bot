import { readFile } from 'node:fs/promises';
import { describe, expect, it, vi } from 'vitest';
import {
  getQueueEntryActionFeedback,
  getQueueEntryActionFailureFeedback,
  queueCallRequiresRefresh,
  getManualQueueEntryFailureKey,
  performQueueEntryAction,
  performQueueEntryActionWithRefresh,
} from '../../apps/frontend/features/queues/queue-entry-actions.mjs';

describe('Next queue entry actions', () => {
  it('keeps unexpected queue-entry action errors generic and carries only a safe diagnostic reference', () => {
    expect(getQueueEntryActionFailureFeedback({
      code: 'INTERNAL_ERROR', status: 500, referenceId: '22222222-2222-4222-8222-222222222222',
    })).toEqual({
      status: 'error', key: 'panel.queue.action_result.failed', referenceId: '22222222-2222-4222-8222-222222222222',
    });
    expect(getQueueEntryActionFailureFeedback({
      code: 'QUEUE_MODE_TRANSITION_PENDING', status: 409, referenceId: 'private detail <script>',
    })).toEqual({ status: 'error', key: 'panel.error.queue_mode_transition_pending' });
  });

  it('asks the operator to refresh before retrying a queue call with an uncertain result', () => {
    const error = { code: 'INTERNAL_ERROR', status: 500, referenceId: '88888888-8888-4888-8888-888888888888' };
    expect(getQueueEntryActionFailureFeedback(error, { action: 'call-next' })).toEqual({
      status: 'error', key: 'panel.queue.action_result.uncertain', referenceId: error.referenceId,
    });
    expect(getQueueEntryActionFailureFeedback({ status: 0 }, { action: 'call-next' })).toEqual({
      status: 'error', key: 'panel.queue.action_result.uncertain',
    });
    expect(getQueueEntryActionFailureFeedback(error, { action: 'call' })).toEqual({
      status: 'error', key: 'panel.queue.action_result.uncertain', referenceId: error.referenceId,
    });
    expect(getQueueEntryActionFailureFeedback({ code: 'INVALID_QUEUE_ENTRY_ACTION_RESPONSE' }, { action: 'call-next' })).toEqual({
      status: 'error', key: 'panel.queue.action_result.uncertain',
    });
    expect(getQueueEntryActionFailureFeedback({ code: 'INVALID_QUEUE_ENTRY_ACTION_REQUEST' }, { action: 'call-next' })).toEqual({
      status: 'error', key: 'panel.queue.action_result.failed',
    });
  });

  it('requires a fresh queue projection before retrying either call action', () => {
    for (const action of ['call-next', 'call']) {
      expect(queueCallRequiresRefresh({ action, feedback: { key: 'panel.queue.action_result.uncertain' } })).toBe(true);
      expect(queueCallRequiresRefresh({ action, feedback: { key: 'panel.queue.call_next.refresh_required' }, refreshFailed: true })).toBe(true);
      expect(getQueueEntryActionFeedback({ action, result: { status: 'called', count: 1 }, refreshFailed: true })).toEqual({
        status: 'warning', key: 'panel.queue.call_next.refresh_required',
      });
    }
    expect(queueCallRequiresRefresh({ action: 'complete', feedback: { key: 'panel.queue.action_result.uncertain' } })).toBe(false);
  });

  it.each([
    ['en', 'The call may have been recorded. Refresh the queue before trying again.'],
    ['es', 'Es posible que la llamada se haya registrado. Actualiza la cola antes de intentarlo de nuevo.'],
    ['pt-BR', 'A chamada pode ter sido registrada. Atualize a fila antes de tentar novamente.'],
  ])('uses clear uncertain-call guidance in the %s catalog', async (locale, message) => {
    const catalog = await readFile(new URL(`../../apps/web/localization/catalogs/panel/${locale}.tsv`, import.meta.url), 'utf8');
    expect(catalog).toContain(`panel.queue.action_result.uncertain\t${message}`);
  });

  it.each([
    ['en', 'Refresh queue'],
    ['es', 'Actualizar cola'],
    ['pt-BR', 'Atualizar fila'],
  ])('provides localized call-refresh controls in the %s catalog', async (locale, label) => {
    const catalog = await readFile(new URL(`../../apps/web/localization/catalogs/panel/${locale}.tsv`, import.meta.url), 'utf8');
    expect(catalog).toContain(`panel.queue.call_next.refresh\t${label}`);
    expect(catalog).toContain('panel.queue.call_next.refresh_required\t');
    expect(catalog).toContain('panel.queue.call_next.reference\t');
    expect(catalog).toContain('panel.queue.call_next.refreshed\t');
    expect(catalog).toContain('panel.queue.call_next.refresh_failed\t');
  });

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

  it('accepts the fulfillment intent and tells the operator Twitch confirmation is pending', async () => {
    const request = vi.fn().mockResolvedValue({ status: 'in_progress', id: 'entry-1', financialDecision: 'request_fulfill' });
    const result = await performQueueEntryAction({ request, queueId: 'queue-1', entryId: 'entry-1', action: 'attend' });
    expect(result).toMatchObject({ financialDecision: 'request_fulfill' });
    expect(getQueueEntryActionFeedback({ action: 'attend', result })).toEqual({
      status: 'warning', key: 'panel.queue.entry_action_result.fulfillment_pending',
    });
    expect(getQueueEntryActionFeedback({ action: 'attend', result, refreshFailed: true })).toEqual({
      status: 'warning', key: 'panel.queue.entry_action_result.fulfillment_refresh_failed',
    });
  });

  it('rejects transition results that do not confirm the requested local state', async () => {
    const request = vi.fn().mockResolvedValue({ status: 'called', id: 'entry-1' });
    await expect(performQueueEntryAction({ request, queueId: 'queue-1', entryId: 'entry-1', action: 'complete' })).rejects.toMatchObject({ code: 'INVALID_QUEUE_ENTRY_ACTION_RESPONSE' });
  });

  it('resends the queued call notification through the established endpoint', async () => {
    const request = vi.fn().mockResolvedValue({ status: 'queued', entryId: 'entry-1' });
    const result = await performQueueEntryAction({ request, queueId: 'queue-1', entryId: 'entry-1', action: 'resend-call' });
    expect(result).toMatchObject({ status: 'queued' });
    expect(getQueueEntryActionFeedback({ action: 'resend-call', result })).toEqual({
      status: 'confirmed', key: 'panel.notice.call_resent',
    });
    expect(request).toHaveBeenCalledWith('/api/entries/entry-1/call-notification/resend', { method: 'POST' });
  });

  it('reports an already queued call notification without implying a second send', async () => {
    const request = vi.fn().mockResolvedValue({ status: 'already_queued', entryId: 'entry-1' });
    const result = await performQueueEntryAction({ request, queueId: 'queue-1', entryId: 'entry-1', action: 'resend-call' });
    expect(getQueueEntryActionFeedback({ action: 'resend-call', result })).toEqual({
      status: 'confirmed', key: 'panel.notice.call_already_queued',
    });
  });

  it.each([
    ['en', 'Call resend requested. The no-show deadline was preserved.', 'The call is already waiting to be sent.'],
    ['es', 'Se solicitó reenviar la llamada. Se conservó el plazo de ausencia.', 'La llamada ya está en la cola de envío.'],
    ['pt-BR', 'Reenvio solicitado. O prazo de ausência foi mantido.', 'A chamada já está na fila de envio.'],
  ])('keeps resend and already-queued messages explicit in the %s catalog', async (locale, sent, alreadyQueued) => {
    const catalog = await readFile(new URL(`../../apps/web/localization/catalogs/panel/${locale}.tsv`, import.meta.url), 'utf8');
    expect(catalog).toContain(`panel.notice.call_resent\t${sent}`);
    expect(catalog).toContain(`panel.notice.call_already_queued\t${alreadyQueued}`);
  });

  it('maps an uncertain resend failure to generic feedback with only a safe reference', () => {
    expect(getQueueEntryActionFailureFeedback({
      status: 503, code: 'INTERNAL_ERROR', referenceId: 'resend-queue-12',
    }, { action: 'resend-call' })).toEqual({
      status: 'error', key: 'panel.queue.action_result.failed', referenceId: 'resend-queue-12',
    });
    expect(getQueueEntryActionFailureFeedback({
      status: 503, referenceId: '<script>private</script>',
    }, { action: 'resend-call' })).toEqual({
      status: 'error', key: 'panel.queue.action_result.failed',
    });
  });

  it.each([['move-up', 1], ['move-down', 3]])('moves a waiting entry to the requested same-lane position (%s)', async (action, position) => {
    const request = vi.fn().mockResolvedValue({ status: 'moved', entryId: 'entry-1', position });
    await expect(performQueueEntryAction({ request, queueId: 'queue-1', entryId: 'entry-1', action, position }))
      .resolves.toMatchObject({ entryId: 'entry-1', position });
    expect(request).toHaveBeenCalledWith('/api/queues/queue-1/move', {
      method: 'POST', body: JSON.stringify({ entryId: 'entry-1', position }),
    });
  });

  it.each([
    ['move-up', { entryId: 'entry-1', position: 1 }, { status: 'moved', entryId: 'entry-1', position: 1 }],
    ['toggle-priority', { entryId: 'entry-1', priority: true, reason: 'bits' }, { status: 'updated', priorityClass: 'priority' }],
  ])('retains the accepted %s result when reloading the queue projection fails', async (action, actionOptions, result) => {
    const request = vi.fn().mockResolvedValueOnce(result).mockRejectedValueOnce(new Error('temporary read failure'));
    await expect(performQueueEntryActionWithRefresh({ request, queueId: 'queue-1', action, ...actionOptions }))
      .resolves.toEqual({ result, queues: null, refreshFailed: true });
    expect(request).toHaveBeenNthCalledWith(2, '/api/queues');
    expect(getQueueEntryActionFeedback({ action, result, refreshFailed: true, priority: actionOptions.priority }))
      .toEqual({ status: 'warning', key: 'panel.queue.entry_action_result.refresh_failed' });
  });

  it.each(['move-up', 'toggle-priority'])('keeps a rejected %s mutation distinct from a refresh failure', (action) => {
    expect(getQueueEntryActionFailureFeedback({ status: 409, code: 'QUEUE_ENTRY_NOT_WAITING' }, { action }))
      .toEqual({ status: 'error', key: 'panel.queue.action_result.failed' });
  });

  it('records and removes priority using the existing audited policy endpoint', async () => {
    const request = vi.fn().mockResolvedValue({ status: 'updated', priorityClass: 'priority' });
    await performQueueEntryAction({ request, queueId: 'queue-1', entryId: 'entry-1', action: 'toggle-priority', priority: true, reason: 'bits' });
    expect(request).toHaveBeenCalledWith('/api/entries/entry-1/priority', {
      method: 'POST', body: JSON.stringify({ priority: true, reason: 'bits' }),
    });
  });

  it('rejects invalid queue reorder and priority inputs before making requests', async () => {
    const request = vi.fn();
    await expect(performQueueEntryAction({ request, queueId: 'queue-1', entryId: 'entry-1', action: 'move-up', position: 0 }))
      .rejects.toMatchObject({ code: 'INVALID_QUEUE_ENTRY_ACTION_REQUEST' });
    await expect(performQueueEntryAction({ request, queueId: 'queue-1', entryId: 'entry-1', action: 'toggle-priority', priority: true, reason: 'unknown' }))
      .rejects.toMatchObject({ code: 'INVALID_QUEUE_ENTRY_ACTION_REQUEST' });
    expect(request).not.toHaveBeenCalled();
  });

  it('reports an empty next-call result as information instead of success', () => {
    expect(getQueueEntryActionFeedback({ action: 'call-next', result: { status: 'called', count: 0 } })).toEqual({
      status: 'info', key: 'panel.queue.action_result.no_waiting',
    });
  });

  it('reports the audited priority result with the matching localized status', () => {
    expect(getQueueEntryActionFeedback({ action: 'toggle-priority', priority: true, result: { status: 'updated' } }))
      .toEqual({ status: 'confirmed', key: 'panel.priority.marked' });
    expect(getQueueEntryActionFeedback({ action: 'toggle-priority', priority: false, result: { status: 'updated' } }))
      .toEqual({ status: 'confirmed', key: 'panel.priority.removed' });
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
    const feedback = getQueueEntryActionFeedback({
      action: 'call-next', result: { status: 'called', count: 0 }, refreshFailed: true,
    });
    expect(feedback).toEqual({ status: 'info', key: 'panel.queue.action_result.no_waiting' });
    expect(queueCallRequiresRefresh({ action: 'call-next', feedback, refreshFailed: true })).toBe(false);
  });
});
