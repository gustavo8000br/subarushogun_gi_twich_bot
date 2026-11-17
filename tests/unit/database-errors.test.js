import { describe, expect, it } from 'vitest';
import { databaseSqlState, isDatabaseTimeout } from '../../apps/api/src/persistence/database-errors.mjs';

// OPS-31 P0 (DB-11): the repository maps only lock_not_available (55P03) and query_canceled (57014) to a retryable error.
describe('database error classification', () => {
  it.each([
    ['a Prisma known request error with the SQLSTATE in meta', Object.assign(new Error('Raw query failed'), { code: 'P2010', meta: { code: '55P03', message: 'lock timeout' } }), '55P03'],
    ['a driver adapter error', Object.assign(new Error('x'), { code: 'P2010', meta: { driverAdapterError: { cause: { originalCode: '57014' } } } }), '57014'],
    ['a raw pg error', Object.assign(new Error('canceling statement'), { code: '57014' }), '57014'],
    ['a Prisma unknown request error that only carries it in the message', Object.assign(new Error('ConnectorError { kind: QueryError(PostgresError { code: \\"57014\\", message: \\"x\\" }) }'), { name: 'PrismaClientUnknownRequestError' }), '57014'],
  ])('reads the SQLSTATE from %s', (_label, error, expected) => {
    expect(databaseSqlState(error)).toBe(expected);
    expect(isDatabaseTimeout(error)).toBe(true);
  });

  it.each([
    ['a Prisma code is not a SQLSTATE', Object.assign(new Error('x'), { code: 'P2002' })],
    ['a deadlock is a different, non-retried condition here', Object.assign(new Error('x'), { code: 'P2010', meta: { code: '40P01' } })],
    ['free text that looks like a SQLSTATE in an ordinary error', new Error('PostgresError { code: "57014" }')],
    ['null', null],
    ['a string', 'boom'],
  ])('does not classify %s as a timeout', (_label, error) => {
    expect(isDatabaseTimeout(error)).toBe(false);
  });

  it('recognises the repository code itself', () => {
    expect(isDatabaseTimeout(Object.assign(new Error('x'), { code: 'DATABASE_TIMEOUT' }))).toBe(true);
  });
});
