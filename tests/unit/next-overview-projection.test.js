import { describe, expect, it } from 'vitest';
import { getRuntimeHealthSeverity, projectRuntimeHealth, summarizeUnresolvedOperations } from '../../apps/frontend/features/overview/queue-summary.mjs';

describe('Next overview projections', () => {
  it('classifies runtime dependency states by user-facing health severity', () => {
    expect(['connected', 'available'].map(getRuntimeHealthSeverity)).toEqual(['functional', 'functional']);
    expect(['connecting', 'reconciling', 'degraded', 'retrying', 'unknown'].map(getRuntimeHealthSeverity))
      .toEqual(['partial', 'partial', 'partial', 'partial', 'partial']);
    expect(['not_configured', 'unavailable', 'reconnect_required', 'ineligible', 'stopped', 'unsupported']
      .map(getRuntimeHealthSeverity)).toEqual(Array(6).fill('nonfunctional'));
    expect(getRuntimeHealthSeverity('unexpected-state')).toBe('partial');
  });

  it('counts pending and reviewable operations while excluding terminal results', () => {
    expect(summarizeUnresolvedOperations([
      { id: 'a', type: 'redemption.fulfill', status: 'pending' },
      { id: 'b', type: 'redemption.cancel', status: 'unknown' },
      { id: 'c', type: 'reward.delete', status: 'conflict' },
      { id: 'd', type: 'reward.update', status: 'failed' },
      { id: 'e', type: 'redemption.fulfill', status: 'confirmed' },
      { id: 'f', type: 'redemption.cancel', status: 'resolved_manual' },
      { id: 'g', type: 'reward.delete', status: 'cancelled' },
    ])).toEqual({ total: 4, needsReview: 3 });
  });

  it('uses the complete server aggregate when the visible operation list is bounded', () => {
    expect(summarizeUnresolvedOperations([], { total: 1_001, needsReview: 3 })).toEqual({ total: 1_001, needsReview: 3 });
  });

  it('projects runtime health into allowlisted states and accepts only valid timestamps and ping values', () => {
    expect(projectRuntimeHealth({
      status: 'ok', last_reconciliation_at: '2026-10-15T18:00:00.000Z',
      dependencies: {
        database: 'connected', twitch_api: 'connected', twitch_integration: 'degraded',
        twitch_chat: 'connected', twitch_rewards: 'available', twitch_api_ping_ms: 47,
      },
    })).toEqual({
      bot: 'connected', database: 'connected', twitchApi: 'connected', twitchIntegration: 'degraded',
      twitchChat: 'connected', twitchRewards: 'available', pingMs: 47,
      lastReconciliationAt: '2026-10-15T18:00:00.000Z',
    });
  });

  it('does not pass arbitrary backend values or invalid time and ping fields into the UI', () => {
    expect(projectRuntimeHealth({
      status: 'unexpected', last_reconciliation_at: 'yesterday-ish',
      dependencies: { database: 'secret', twitch_api_ping_ms: -1 },
    })).toEqual({
      bot: 'unknown', database: 'unknown', twitchApi: 'unknown', twitchIntegration: 'unknown',
      twitchChat: 'unknown', twitchRewards: 'unknown', pingMs: null, lastReconciliationAt: null,
    });
  });

  it('rejects malformed operation projections instead of showing an inaccurate pending count', () => {
    expect(() => summarizeUnresolvedOperations([{ id: 'x', status: 'pending' }])).toThrow(/valid operation/);
    expect(() => summarizeUnresolvedOperations(null)).toThrow(/valid operation/);
  });
});
