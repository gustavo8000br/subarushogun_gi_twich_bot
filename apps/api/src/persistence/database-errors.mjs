// OPS-31 P0 (DB-11, TS-20): classification of the two PostgreSQL conditions the repository transaction limits produce.
// 55P03 = lock_not_available (`lock_timeout`), 57014 = query_canceled (`statement_timeout`). Both are retryable.
const DATABASE_TIMEOUT_SQLSTATES = new Set(['55P03', '57014']);

/** SQLSTATE of a database error as surfaced by Prisma (known request error meta, driver adapter error, or the raw pg error). */
export function databaseSqlState(error) {
  const seen = new Set();
  const visit = (value, depth) => {
    if (!value || typeof value !== 'object' || seen.has(value) || depth > 4) return null;
    seen.add(value);
    for (const key of ['originalCode', 'sqlState', 'code']) {
      if (typeof value[key] === 'string' && /^[0-9A-Z]{5}$/.test(value[key]) && !/^P\d{4}$/.test(value[key])) return value[key];
    }
    for (const key of ['meta', 'driverAdapterError', 'cause']) {
      const found = visit(value[key], depth + 1);
      if (found) return found;
    }
    return null;
  };
  const structured = visit(error, 0);
  if (structured) return structured;
  // Prisma 6 reports some PostgreSQL errors (for example 57014 from a trigger or a long statement) as an
  // `PrismaClientUnknownRequestError` whose only carrier of the SQLSTATE is the message (`PostgresError { code: "57014", ... }`).
  if (error?.name === 'PrismaClientUnknownRequestError' && typeof error.message === 'string') {
    return /PostgresError \{ code: \\?"([0-9A-Z]{5})\\?"/.exec(error.message)?.[1] ?? null;
  }
  return null;
}

export function isDatabaseTimeout(error) {
  return error?.code === 'DATABASE_TIMEOUT' || DATABASE_TIMEOUT_SQLSTATES.has(databaseSqlState(error) ?? '');
}
