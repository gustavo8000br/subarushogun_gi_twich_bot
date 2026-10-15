import { describe, expect, it, vi } from 'vitest';
import {
  getOperationActions,
  getOperationGroup,
  getOperationStatusKey,
  performOperationActionWithRefresh,
  validateOperationsProjection,
} from '../../apps/frontend/features/operations/operations.mjs';

const operation = (values = {}) => ({
  id: 'operation-1', type: 'redemption.cancel', redemptionId: 'redemption-1',
  status: 'unknown', attempts: 2, nextAttemptAt: null, ...values,
});

describe('Next operations presentation contract', () => {
  it('groups existing Twitch and viewer-points operation types without conflating them', () => {
    expect(getOperationGroup(operation({ type: 'reward.update' }))).toBe('twitch_sync');
    expect(getOperationGroup(operation({ type: 'reward.delete' }))).toBe('twitch_sync');
    expect(getOperationGroup(operation({ type: 'redemption.cancel' }))).toBe('points_refund');
    expect(getOperationGroup(operation({ type: 'redemption.fulfill' }))).toBe('redemption_fulfillment');
    expect(getOperationGroup(operation({ type: 'other' }))).toBe('twitch_sync');
  });

  it('maps unrecognized status values to the explicit unknown state', () => {
    expect(getOperationStatusKey('conflict')).toBe('panel.operation.status.conflict');
    expect(getOperationStatusKey('arbitrary-internal-value')).toBe('panel.operation.status.unknown');
  });

  it('exposes only the actions valid for the operation type and state', () => {
    expect(getOperationActions(operation())).toEqual(['resolve_unknown', 'retry']);
    expect(getOperationActions(operation({ type: 'reward.delete', status: 'conflict' }))).toEqual(['continue_delete']);
    expect(getOperationActions(operation({ status: 'confirmed' }))).toEqual([]);
    expect(getOperationActions(operation({ status: 'failed', type: 'redemption.fulfill' }))).toEqual(['retry']);
    expect(getOperationActions(operation({ status: 'resolved_manual' }))).toEqual([]);
    for (const status of ['unknown', 'conflict', 'failed']) {
      expect(getOperationActions(operation({ id: 'pause-delete', type: 'reward.set_open', requiresDeleteConfirmation: true, status }))).toEqual(['continue_delete']);
    }
    expect(getOperationActions(operation({ type: 'reward.set_open', status: 'unknown' }))).toEqual(['retry']);
  });

  it('validates the operation list before rendering it', () => {
    expect(validateOperationsProjection([operation()])).toEqual([operation()]);
    expect(() => validateOperationsProjection({})).toThrow();
    expect(() => validateOperationsProjection([operation({ attempts: -1 })])).toThrow();
    expect(validateOperationsProjection([operation({ requiresDeleteConfirmation: true })])).toHaveLength(1);
    expect(() => validateOperationsProjection([operation({ requiresDeleteConfirmation: 'true' })])).toThrow();
  });

  it('uses the existing safe manual-resolution endpoint and requires its non-confirmation result', async () => {
    const request = vi.fn(async (path) => path === '/api/operations'
      ? []
      : { status: 'resolved_manual', remoteConfirmed: false });
    await expect(performOperationActionWithRefresh({ request, operation: operation(), action: 'resolve_unknown' }))
      .resolves.toMatchObject({ result: { remoteConfirmed: false }, refreshFailed: false });
    expect(request).toHaveBeenNthCalledWith(1, '/api/operations/operation-1/resolve-unknown', { method: 'POST', body: '{}' });
    expect(request).toHaveBeenNthCalledWith(2, '/api/operations');
  });

  it('uses the existing retry endpoint for Twitch synchronization and points operations', async () => {
    const request = vi.fn(async (path) => path === '/api/operations' ? [] : { status: 'pending' });
    await expect(performOperationActionWithRefresh({ request, operation: operation(), action: 'retry' }))
      .resolves.toMatchObject({ result: { status: 'pending' }, operations: [], refreshFailed: false });
    expect(request).toHaveBeenNthCalledWith(1, '/api/operations/operation-1/retry', { method: 'POST', body: '{}' });
    expect(request).toHaveBeenNthCalledWith(2, '/api/operations');
  });

  it('maps the confirmed continue-delete action to the existing retry endpoint', async () => {
    const request = vi.fn(async (path) => path === '/api/operations' ? [] : { status: 'pending' });
    await expect(performOperationActionWithRefresh({
      request, operation: operation({ type: 'reward.delete', status: 'conflict', entityId: 'reward-1' }), action: 'continue_delete',
    })).resolves.toMatchObject({ result: { status: 'pending' }, refreshFailed: false });
    expect(request).toHaveBeenCalledWith('/api/operations/operation-1/retry', { method: 'POST', body: '{}' });
  });

  it('keeps accepted operation result when only the refreshed projection fails', async () => {
    const request = vi.fn(async (path) => {
      if (path === '/api/operations') throw new Error('not exposed to UI');
      return { status: 'pending' };
    });
    await expect(performOperationActionWithRefresh({ request, operation: operation(), action: 'retry' }))
      .resolves.toMatchObject({ result: { status: 'pending' }, operations: null, refreshFailed: true });
  });
});
