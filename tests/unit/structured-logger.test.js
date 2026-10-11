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
