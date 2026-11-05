import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  FINANCIAL_MAX_ATTEMPTS, FINANCIAL_RETRY_BASE_MS, FINANCIAL_RETRY_CAP_MS, FINANCIAL_RETRY_FACTOR,
  FINANCIAL_RETRY_JITTER_MAX, FINANCIAL_RETRY_JITTER_MIN, FINANCIAL_REASON_CLASSES, FINANCIAL_TERMINAL_REASON,
  authorizationRefundCycleStart, cycleAttemptOf, cycleStartAttemptsOf, financialOperationHealth, freshCycleStart,
  isCycleExhausted, nominalRetryDelayMs, retryDelayMs,
} from '../../apps/api/src/outbox/financial-retry-policy.mjs';

const minute = 60_000;

// OPS-22 FT-25 (AC 6, 8, 20), G1 of the `@qa` plan: pure policy, injected `random`, no environment variable.
describe('financial retry policy (FT-25)', () => {
  it('U25-01 nominal wait after attempt n is min(60 min, 60 s x 4^(n-1)) = 1, 4, 16, 60, 60 min', () => {
    expect(FINANCIAL_MAX_ATTEMPTS).toBe(6);
    expect(FINANCIAL_RETRY_BASE_MS).toBe(minute);
    expect(FINANCIAL_RETRY_FACTOR).toBe(4);
    expect(FINANCIAL_RETRY_CAP_MS).toBe(60 * minute);
    expect([1, 2, 3, 4, 5].map((attempt) => nominalRetryDelayMs(attempt))).toEqual([1, 4, 16, 60, 60].map((value) => value * minute));
  });

  it('U25-02 multiplicative jitter x0.8..x1.2 from the injected random at 0, 0.5 and 1 keeps each wait in bounds', () => {
    expect(FINANCIAL_RETRY_JITTER_MIN).toBe(0.8);
    expect(FINANCIAL_RETRY_JITTER_MAX).toBe(1.2);
    for (let attempt = 1; attempt <= 5; attempt += 1) {
      const nominal = nominalRetryDelayMs(attempt);
      expect(retryDelayMs(attempt, () => 0)).toBe(Math.round(nominal * 0.8));
      expect(retryDelayMs(attempt, () => 0.5)).toBe(nominal);
      expect(retryDelayMs(attempt, () => 1)).toBe(Math.round(nominal * 1.2));
    }
  });

  it('U25-03 next attempt time is non-decreasing up to the 60 min cap over a sweep of random values', () => {
    const randoms = [0, 0.13, 0.5, 0.77, 1];
    for (const random of randoms) {
      let at = 0;
      const times = [];
      for (let attempt = 1; attempt <= 5; attempt += 1) {
        const delay = retryDelayMs(attempt, () => random);
        expect(delay).toBeGreaterThanOrEqual(Math.round(nominalRetryDelayMs(attempt) * 0.8));
        expect(delay).toBeLessThanOrEqual(Math.round(nominalRetryDelayMs(attempt) * 1.2));
        at += delay;
        times.push(at);
      }
      for (let index = 1; index < times.length; index += 1) expect(times[index]).toBeGreaterThanOrEqual(times[index - 1]);
    }
    // The 4th and 5th waits share the nominal cap: "strictly increasing" is impossible and is not asserted.
    expect(nominalRetryDelayMs(4)).toBe(nominalRetryDelayMs(5));
  });

  it('U25-04 six attempts count the first; the sixth non-conclusive attempt is the exhaustion point', () => {
    expect(FINANCIAL_TERMINAL_REASON).toBe('attempts_exhausted');
    for (let attempts = 1; attempts <= 5; attempts += 1) expect(isCycleExhausted({ attempts, payload: {} })).toBe(false);
    expect(isCycleExhausted({ attempts: 6, payload: {} })).toBe(true);
    expect(isCycleExhausted({ attempts: 9, payload: {} })).toBe(true);
  });

  it('U25-05 cycle budget = attempts - (payload.cycleStartAttempts ?? 0), cap 6; a missing key reads as 0 (legacy row)', () => {
    expect(cycleStartAttemptsOf({ payload: {} })).toBe(0);
    expect(cycleStartAttemptsOf({ payload: null })).toBe(0);
    expect(cycleStartAttemptsOf({})).toBe(0);
    expect(cycleStartAttemptsOf({ payload: { cycleStartAttempts: 'x' } })).toBe(0);
    expect(cycleAttemptOf({ attempts: 1, payload: {} })).toBe(1);
    expect(cycleAttemptOf({ attempts: 8, payload: { cycleStartAttempts: 6 } })).toBe(2);
    expect(isCycleExhausted({ attempts: 11, payload: { cycleStartAttempts: 6 } })).toBe(false);
    expect(isCycleExhausted({ attempts: 12, payload: { cycleStartAttempts: 6 } })).toBe(true);
  });

  it('U25-06 "retry now" opens a fresh cycle of 6 (another 6 reads, not 1) and never lowers attempts', () => {
    const exhausted = { attempts: 6, payload: { cycleStartAttempts: 0 } };
    const start = freshCycleStart(exhausted);
    expect(start).toBe(6);
    const reopened = { attempts: exhausted.attempts, payload: { cycleStartAttempts: start } };
    let reads = 0;
    while (!isCycleExhausted(reopened)) { reopened.attempts += 1; reads += 1; }
    expect(reads).toBe(6);
    expect(reopened.attempts).toBeGreaterThanOrEqual(exhausted.attempts);
  });

  it('U25-07 a 401 refunds the claimed attempt with cycleStartAttempts = min(start + 1, attempts) and keeps 0 <= start <= attempts', () => {
    expect(authorizationRefundCycleStart({ attempts: 3, payload: {} })).toBe(1);
    expect(authorizationRefundCycleStart({ attempts: 3, payload: { cycleStartAttempts: 2 } })).toBe(3);
    expect(authorizationRefundCycleStart({ attempts: 3, payload: { cycleStartAttempts: 3 } })).toBe(3);
    expect(authorizationRefundCycleStart({ attempts: 0, payload: {} })).toBe(0);
    for (let attempts = 0; attempts < 10; attempts += 1) {
      for (let start = 0; start <= attempts; start += 1) {
        const next = authorizationRefundCycleStart({ attempts, payload: { cycleStartAttempts: start } });
        expect(next).toBeGreaterThanOrEqual(0);
        expect(next).toBeLessThanOrEqual(attempts);
      }
    }
  });

  it('U25-12 health projection: retryable financial items are degraded, terminal ones need review', () => {
    expect(FINANCIAL_REASON_CLASSES).toEqual(['remote_read_unrecognized', 'remote_read_transient', 'remote_not_found', 'authorization_required']);
    expect(financialOperationHealth({ status: 'retry' })).toBe('degraded');
    expect(financialOperationHealth({ status: 'processing' })).toBe('degraded');
    for (const status of ['unknown', 'conflict', 'failed']) expect(financialOperationHealth({ status })).toBe('needs_review');
    for (const status of ['pending', 'confirmed', 'resolved_manual', 'cancelled', 'mystery']) expect(financialOperationHealth({ status })).toBeNull();
  });
});

async function sourceFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(entries.map(async (entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return ['node_modules', '.next', 'out'].includes(entry.name) ? [] : sourceFiles(path);
    return /\.(?:mjs|js|jsx|ts|tsx|tsv)$/.test(entry.name) ? [path] : [];
  }));
  return files.flat();
}

describe('financial catalogue names (FT-25 open items 1 and 2)', () => {
  it('C25-01 uses attempts_exhausted and financial.operation_retry_requested; withdrawn names appear nowhere in apps/', async () => {
    const apps = fileURLToPath(new URL('../../apps/', import.meta.url));
    const contents = await Promise.all((await sourceFiles(apps)).map((file) => readFile(file, 'utf8')));
    const joined = contents.join('\n');
    expect(joined).toContain("'attempts_exhausted'");
    expect(joined).toContain("'financial.operation_retry_requested'");
    expect(joined).not.toContain('retry_exhausted');
    expect(joined).not.toContain('financial.operation_retried_manually');
  });
});
