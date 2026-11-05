import { describe, expect, it, vi } from 'vitest';
import { createStructuredLogger, resolveLogLevel } from '../../apps/api/src/observability/structured-logger.mjs';

describe('structured logger', () => {
  it('filters by configured severity, with verbose/debug/trace progressively more detailed', () => {
    const write = vi.fn();
    const logger = createStructuredLogger({ level: 'verbose', write, idFactory: () => 'ref-1', clock: () => new Date('2026-10-07T00:00:00Z') });
    logger({ event: 'hidden-debug', level: 'debug', source: 'test.source' });
    logger({ event: 'visible-verbose', level: 'verbose', source: 'test.source' });
    expect(write).toHaveBeenCalledOnce();
    expect(JSON.parse(write.mock.calls[0][0])).toMatchObject({ event: 'visible-verbose', level: 'verbose', referenceId: 'ref-1' });
  });

  it('includes debug but omits trace when debug is the configured threshold', () => {
    const write = vi.fn();
    const log = createStructuredLogger({ level: 'debug', write });
    log({ event: 'visible-debug', level: 'debug' });
    log({ event: 'hidden-trace', level: 'trace' });
    expect(write).toHaveBeenCalledOnce();
    expect(JSON.parse(write.mock.calls[0][0]).event).toBe('visible-debug');
  });

  it('supports alert-level records and constrains details to safe diagnostic counters', () => {
    const write = vi.fn();
    const log = createStructuredLogger({ level: 'alert', write });
    log({ event: 'unsafe', level: 'notice', source: 'queue.reward', details: { token: 'secret' } });
    log({ event: 'reward-linking-critical', level: 'alert', source: 'queue.reward', details: { candidateCount: 0, raw: 'secret title', mismatchCounts: { cost_mismatch: 1, credential_leak: 2 } } });
    expect(write).toHaveBeenCalledOnce();
    const line = write.mock.calls[0][0];
    expect(JSON.parse(line).details).toEqual({ candidateCount: 0, mismatchCounts: { cost_mismatch: 1 } });
    expect(line).not.toMatch(/secret|raw/);
  });

  it('keeps only known reconciliation issue codes and HTTP status counts in diagnostic details (OPS-22 FT-24)', () => {
    const write = vi.fn();
    const log = createStructuredLogger({ level: 'info', write });
    log({ event: 'twitch_reconciliation_degraded', level: 'warn', source: 'twitch.reconciliation', details: {
      trigger: 'periodic', reason: 'reconciliation_partial', issueCount: 3,
      issueCounts: { redemption_verification_failed: 2, reward_configuration_mismatch: 1, viewer_login_leak: 4, 'Bearer abc': 1 },
      httpStatusCounts: { 401: 2, 999: 1, abc: 1, 503: -1 },
      redemptionId: 'fixture-redemption-1', userLogin: 'fixture_viewer', accessToken: 'secret-token',
    } });
    const line = write.mock.calls[0][0];
    expect(JSON.parse(line).details).toEqual({
      trigger: 'periodic', reason: 'reconciliation_partial', issueCount: 3,
      issueCounts: { redemption_verification_failed: 2, reward_configuration_mismatch: 1 },
      httpStatusCounts: { 401: 2 },
    });
    expect(line).not.toMatch(/fixture|secret|Bearer|leak/);
  });

  it('keeps exactly the financial.attempt fields with safe values and drops anything else (OPS-22 FT-25, AC 10)', () => {
    const write = vi.fn();
    const log = createStructuredLogger({ level: 'info', write, idFactory: () => 'ref-1', clock: () => new Date('2026-10-07T00:00:00Z') });
    log({ event: 'financial.attempt', level: 'info', source: 'outbox.financial', details: {
      operationType: 'redemption.cancel', outboxId: '10000000-0000-4000-8000-000000000001', attempt: 2, httpStatus: 503,
      twitchErrorCode: 'remote_lookup_failed', nextAttemptAt: '2026-10-07T00:03:12.000Z', outcome: 'retry', message: 'oauth:secret', userLogin: 'viewer',
    } });
    log({ event: 'financial.attempt', level: 'info', source: 'outbox.financial', details: {
      operationType: 'redemption.fulfill', outboxId: 'not a uuid', attempt: 1, httpStatus: null, twitchErrorCode: null, nextAttemptAt: null, outcome: 'confirmed',
    } });
    log({ event: 'financial.attempt', level: 'info', source: 'outbox.financial', details: {
      operationType: 'redemption.cancel', outboxId: '10000000-0000-4000-8000-000000000001', attempt: 1, httpStatus: 999,
      twitchErrorCode: 'Bearer abc def', nextAttemptAt: 'tomorrow', outcome: 'retry',
    } });
    const [first, second, third] = write.mock.calls.map(([line]) => JSON.parse(line));
    expect(first.details).toEqual({
      operationType: 'redemption.cancel', outboxId: '10000000-0000-4000-8000-000000000001', attempt: 2, httpStatus: 503,
      twitchErrorCode: 'remote_lookup_failed', nextAttemptAt: '2026-10-07T00:03:12.000Z', outcome: 'retry',
    });
    expect(second.details).toEqual({ operationType: 'redemption.fulfill', attempt: 1, httpStatus: null, twitchErrorCode: null, nextAttemptAt: null, outcome: 'confirmed' });
    expect(third.details).toEqual({ operationType: 'redemption.cancel', outboxId: '10000000-0000-4000-8000-000000000001', attempt: 1, outcome: 'retry' });
    expect(write.mock.calls.join('')).not.toContain('secret');
    expect(write.mock.calls.join('')).not.toContain('viewer');
  });

  it('falls back to info for unknown configured levels', () => {
    expect(resolveLogLevel('made-up')).toBe('info');
  });

  it('keeps a correlation reference available even when the selected threshold suppresses the event', () => {
    const write = vi.fn();
    const log = createStructuredLogger({ level: 'alert', write, idFactory: () => 'reference-1' });
    expect(log({ event: 'application_error', level: 'error' })).toBe('reference-1');
    expect(write).not.toHaveBeenCalled();
  });
});
