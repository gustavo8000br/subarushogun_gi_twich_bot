// OPS-15 D-1: the pool 'error' listener keeps the API alive when PostgreSQL stops; the log line is generic.
import { EventEmitter } from 'node:events';
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { attachPoolErrorHandler, safePoolErrorCode } from '../../apps/api/src/persistence/pool-error-handler.mjs';
import { createStructuredLogger } from '../../apps/api/src/observability/structured-logger.mjs';

describe('pool error handler', () => {
  it('baseline: an EventEmitter without a listener throws on error (the D-1 crash)', () => {
    expect(() => new EventEmitter().emit('error', new Error('boom'))).toThrow();
  });

  it('absorbs the error and logs one generic event without message, host or secret', () => {
    const pool = new EventEmitter();
    const lines = [];
    const logEvent = createStructuredLogger({ level: 'info', write: (line) => lines.push(line), idFactory: () => 'ref-1' });
    attachPoolErrorHandler(pool, { logEvent });
    const error = Object.assign(new Error('terminating connection postgresql://queuebot:s3cret@db:5432/queuebot'), { code: '57P01' });
    expect(() => pool.emit('error', error)).not.toThrow();
    expect(lines).toHaveLength(1);
    const record = JSON.parse(lines[0]);
    expect(record).toMatchObject({ event: 'database_pool_error', level: 'error', errorCode: 'sqlstate_57P01', details: { reason: 'idle_client_lost' } });
    expect(lines[0]).not.toMatch(/s3cret|postgresql:|queuebot|terminating/);
  });

  it('never throws even if the logger itself fails', () => {
    const pool = new EventEmitter();
    attachPoolErrorHandler(pool, { logEvent: vi.fn(() => { throw new Error('log down'); }) });
    expect(() => pool.emit('error', new Error('x'))).not.toThrow();
  });

  it('keeps only safe error codes', () => {
    expect(safePoolErrorCode({ code: 'ECONNRESET' })).toBe('ECONNRESET');
    expect(safePoolErrorCode({ code: '57P01' })).toBe('sqlstate_57P01');
    expect(safePoolErrorCode({ code: 'password=abc' })).toBeNull();
    expect(safePoolErrorCode(new Error('no code'))).toBeNull();
    expect(safePoolErrorCode(null)).toBeNull();
  });

  it('server.mjs registers the handler on the pool right after creating the logger', () => {
    const source = readFileSync(new URL('../../apps/api/src/server.mjs', import.meta.url), 'utf8');
    expect(source).toMatch(/attachPoolErrorHandler\(pool, \{ logEvent \}\)/);
  });
});
