/** @vitest-environment jsdom */
import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import OperationsPageContent from '../../apps/frontend/features/operations/operations-page-content.jsx';

const COPY = {
  'panel.operations.eyebrow': 'POINTS AND RECOVERY',
  'panel.operations.title': 'Twitch sync and points',
  'panel.operations.description': 'Review Twitch communication, viewer refunds and redemption fulfillment.',
  'panel.operations.group.twitch_sync': 'Twitch communication',
  'panel.operations.group.points_refund': 'Channel Points refunds',
  'panel.operations.group.redemption_fulfillment': 'Redemption fulfillment',
  'panel.operations.loading': 'Loading operations…',
  'panel.operations.refresh': 'Refresh',
  'panel.operations.refreshing': 'Refreshing…',
  'panel.operations.empty': 'No pending operations.',
  'panel.operations.empty_hint': 'Pending work appears here until confirmed or requiring review.',
  'panel.operations.action_retry_pending': 'Retry requested. Twitch has not confirmed the result.',
  'panel.operations.action_manual_resolution': 'Manual resolution recorded. This does not confirm the result with Twitch.',
  'panel.operations.action_refresh_failed': 'Action accepted, but list refresh failed. Reload before retrying.',
  'panel.operations.action_failed': 'Action failed.',
  'panel.operations.reconcile_failed': 'Could not reconcile with Twitch.',
  'panel.connection.reconcile': 'Reconcile with Twitch now',
  'panel.error.local_load': 'Could not connect to the local API.',
  'panel.operations.refresh_failed': 'Could not refresh operations.',
  'panel.operations.reconcile': 'Reconcile with Twitch now',
  'panel.reconciliation.running': 'Reconciliation in progress…',
  'panel.reconciliation.complete.one': 'Reconciliation complete. Imported {count} redemption.',
  'panel.reconciliation.complete.other': 'Reconciliation complete. Imported {count} redemptions.',
  'panel.reconciliation.issues.one': 'Reconciliation completed with {count} issue.',
  'panel.reconciliation.issues.other': 'Reconciliation completed with {count} issues.',
  'panel.operation.type.refund': 'POINTS REFUND',
  'panel.operation.type.fulfillment': 'REDEMPTION FULFILLMENT',
  'panel.operation.type.reward_update': 'TWITCH REWARD SYNC',
  'panel.operation.type.queue_delete': 'TWITCH REWARD DELETION',
  'panel.operation.type.other': 'TWITCH OPERATION',
  'panel.operation.status.unknown': 'Unknown state · review in the panel',
  'panel.operation.status.conflict': 'Conflict · review required',
  'panel.operation.status.confirmed': 'Confirmed by Twitch',
  'panel.operation.status.pending': 'Pending',
  'panel.operation.attempts.one': '{count} attempt',
  'panel.operation.attempts.other': '{count} attempts',
  'panel.operation.action.resolve': 'Record manual resolution',
  'panel.operation.action.retry': 'Reconcile / retry',
  'panel.operation.action.continue_delete': 'Continue deletion',
  'panel.operation.confirm.resolve': 'Twitch has not confirmed this redemption operation. Recording a manual resolution does not confirm a refund or fulfillment.',
  'panel.operation.confirm.continue_delete': 'Check pending redemptions and refunds. This reward deletion may be irreversible.',
  'panel.confirmation.title': 'Confirm action',
  'panel.confirmation.cancel': 'Cancel',
  'panel.confirmation.accept': 'OK',
  'panel.queue.action_result.saving': 'Saving…',
};

const t = (key, options = {}) => (COPY[key] ?? key).replace(/\{([a-z]+)\}/g, (_, name) => String(options.values?.[name] ?? `{${name}}`));
afterEach(cleanup);

const refund = {
  id: 'operation-refund', type: 'redemption.cancel', redemptionId: 'redemption-123',
  status: 'unknown', attempts: 2, nextAttemptAt: null,
};
const deletion = {
  id: 'operation-delete', type: 'reward.delete', entityId: 'reward-234',
  status: 'conflict', attempts: 1, nextAttemptAt: null,
};
const pauseBeforeDeletion = {
  id: 'operation-pause-delete', type: 'reward.set_open', entityId: 'reward-delete-345',
  status: 'unknown', attempts: 1, nextAttemptAt: null, requiresDeleteConfirmation: true,
};
const fulfillment = {
  id: 'operation-fulfillment', type: 'redemption.fulfill', redemptionId: 'redemption-345',
  status: 'confirmed', attempts: 1, nextAttemptAt: null,
};

function harness({ operations = [refund, deletion, fulfillment], mutationResult = null, failRefresh = false, reconciliationPromise = null } = {}) {
  const request = vi.fn(async (path) => {
    if (path === '/api/operations') {
      if (failRefresh && request.mock.calls.length > 1) throw new Error('safe error');
      return operations;
    }
    if (path === '/api/reconciliation') return reconciliationPromise ?? { status: 'complete', imported: 1, issues: [] };
    if (path.endsWith('/resolve-unknown')) return mutationResult ?? { status: 'resolved_manual', remoteConfirmed: false };
    return mutationResult ?? { status: 'pending' };
  });
  return { request };
}

function renderPage(options) {
  const { request } = harness(options);
  render(React.createElement(OperationsPageContent, { t, locale: 'en', request }));
  return { request };
}

describe('Next Operations page', () => {
  it('separates Twitch synchronization, point refunds and redemption fulfillment', async () => {
    renderPage();
    expect(await screen.findByText('POINTS REFUND')).toBeTruthy();
    expect(screen.getByText('TWITCH REWARD DELETION')).toBeTruthy();
    expect(screen.getByText('REDEMPTION FULFILLMENT')).toBeTruthy();
    expect(screen.getByText('Unknown state · review in the panel')).toBeTruthy();
    expect(screen.getByText('Conflict · review required')).toBeTruthy();
    expect(screen.getByText('Confirmed by Twitch')).toBeTruthy();
    expect(screen.getByText('redemption-123')).toBeTruthy();
    expect(screen.getByText('2 attempts')).toBeTruthy();
  });

  it('uses plural copy for zero operation attempts', async () => {
    renderPage({ operations: [{ ...refund, attempts: 0 }] });
    expect(await screen.findByText('0 attempts')).toBeTruthy();
  });

  it('requires explicit delete confirmation before retrying the pause step of a reward deletion', async () => {
    renderPage({ operations: [pauseBeforeDeletion] });
    fireEvent.click(await screen.findByRole('button', { name: 'Continue deletion' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Check pending redemptions and refunds. This reward deletion may be irreversible.')).toBeTruthy();
  });

  it('requires confirmation before manually resolving an unknown refund and never labels it Twitch-confirmed', async () => {
    const { request } = renderPage();
    const resolveButton = await screen.findByRole('button', { name: 'Record manual resolution' });
    fireEvent.click(resolveButton);
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(COPY['panel.operation.confirm.resolve'])).toBeTruthy();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(request).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: 'Record manual resolution' }));
    fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Record manual resolution' }));
    await waitFor(() => expect(request).toHaveBeenCalledWith('/api/operations/operation-refund/resolve-unknown', { method: 'POST', body: '{}' }));
    expect(await screen.findByText('Manual resolution recorded. This does not confirm the result with Twitch.')).toBeTruthy();
  });

  it('requires confirmation before continuing reward deletion', async () => {
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Continue deletion' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Check pending redemptions and refunds. This reward deletion may be irreversible.')).toBeTruthy();
    expect(within(dialog).getByRole('button', { name: 'Cancel' })).toBeTruthy();
  });

  it('retries an eligible redemption directly and reports that Twitch confirmation is still pending', async () => {
    const { request } = renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Reconcile / retry' }));
    await waitFor(() => expect(request).toHaveBeenCalledWith('/api/operations/operation-refund/retry', { method: 'POST', body: '{}' }));
    expect(await screen.findByText('Retry requested. Twitch has not confirmed the result.')).toBeTruthy();
  });

  it('retains the accepted retry result if refreshing the operation list fails', async () => {
    const { request } = renderPage({ failRefresh: true, operations: [refund] });
    fireEvent.click(await screen.findByRole('button', { name: 'Reconcile / retry' }));
    await waitFor(() => expect(request).toHaveBeenCalledWith('/api/operations/operation-refund/retry', { method: 'POST', body: '{}' }));
    expect(await screen.findByText('Action accepted, but list refresh failed. Reload before retrying.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Reconcile / retry' })).toBeNull();
    expect(screen.getByText('Pending')).toBeTruthy();
  });

  it('runs explicit global reconciliation and reports the localized result', async () => {
    const { request } = renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Reconcile with Twitch now' }));
    await waitFor(() => expect(request).toHaveBeenCalledWith('/api/reconciliation', { method: 'POST', body: '{}' }));
    expect(await screen.findByText('Reconciliation complete. Imported 1 redemption.')).toBeTruthy();
  });

  it('disables per-operation actions while global reconciliation is running', async () => {
    let finishReconciliation;
    const reconciliationPromise = new Promise((resolve) => { finishReconciliation = resolve; });
    renderPage({ reconciliationPromise });
    fireEvent.click(await screen.findByRole('button', { name: 'Reconcile with Twitch now' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Reconcile / retry' }).disabled).toBe(true));
    finishReconciliation({ status: 'complete', imported: 0, issues: [] });
    expect(await screen.findByText('Reconciliation complete. Imported 0 redemptions.')).toBeTruthy();
  });

  it('renders an explicit empty state for an empty operation projection', async () => {
    renderPage({ operations: [] });
    expect(await screen.findByRole('heading', { name: 'No pending operations.' })).toBeTruthy();
    expect(screen.getByText('Pending work appears here until confirmed or requiring review.')).toBeTruthy();
  });
});
