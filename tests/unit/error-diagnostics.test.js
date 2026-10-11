import { describe, expect, it, vi } from 'vitest';
import { createErrorDiagnosticReporter } from '../../apps/api/src/observability/error-diagnostics.mjs';

describe('safe error diagnostics', () => {
  it('writes a correlation reference and safe technical metadata without error content', () => {
    const write = vi.fn();
    const report = createErrorDiagnosticReporter({
      write,
      idFactory: () => '11111111-1111-4111-8111-111111111111',
      clock: () => new Date('2026-10-07T23:00:00.000Z'),
    });
    const error = Object.assign(new Error('client_secret=hidden SQL statement with viewer UID 123456789'), { code: 'P2002' });

    const referenceId = report({ source: 'http.queue.create', error });

    expect(referenceId).toBe('11111111-1111-4111-8111-111111111111');
    expect(write).toHaveBeenCalledOnce();
    const record = JSON.parse(write.mock.calls[0][0]);
    expect(record).toEqual({
      event: 'application_error', level: 'error', referenceId,
      occurredAt: '2026-10-07T23:00:00.000Z', source: 'http.queue.create',
      errorType: 'Error', errorCode: 'P2002',
    });
    expect(write.mock.calls[0][0]).not.toMatch(/client_secret|SQL statement|123456789|stack/i);
  });

  it('replaces malformed source and error metadata with stable safe values', () => {
    const write = vi.fn();
    const report = createErrorDiagnosticReporter({ write, idFactory: () => 'trace-id' });
    const referenceId = report({ source: 'http.queue.create token=secret', error: { name: 'Bad Error\n', code: 'secret=hidden' } });
    const record = JSON.parse(write.mock.calls[0][0]);

    expect(record).toMatchObject({ referenceId, source: 'unknown', errorType: 'Error', errorCode: null });
    expect(write.mock.calls[0][0]).not.toContain('secret');
  });

  it('preserves application-owned lowercase operation codes for outbox investigation', () => {
    const write = vi.fn();
    const report = createErrorDiagnosticReporter({ write, idFactory: () => '11111111-1111-4111-8111-111111111111' });

    report({ source: 'outbox.reward', errorType: 'RewardOperation', errorCode: 'reward_create_response_unverified' });

    expect(JSON.parse(write.mock.calls[0][0])).toMatchObject({
      source: 'outbox.reward', errorType: 'RewardOperation', errorCode: 'reward_create_response_unverified',
    });
  });
});
