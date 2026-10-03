import { readFile } from 'node:fs/promises';

/** Build the local PostgreSQL URL before Prisma loads; never expose secret file errors. */
export async function createDatabaseUrl({ env = process.env, secretPath = '/run/secrets/db_password' } = {}) {
  let password;
  try {
    password = (await readFile(secretPath, 'utf8')).trim();
  } catch {
    throw new Error('Database secret is unavailable.');
  }
  if (!password) throw new Error('Database secret is empty.');
  const host = env.DATABASE_HOST ?? 'db';
  const port = env.DATABASE_PORT ?? '5432';
  const user = encodeURIComponent(env.DATABASE_USER ?? 'queuebot');
  const database = encodeURIComponent(env.DATABASE_NAME ?? 'queuebot');
  return `postgresql://${user}:${encodeURIComponent(password)}@${host}:${port}/${database}?schema=public`;
}
