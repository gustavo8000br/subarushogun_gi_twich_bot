import Fastify from 'fastify';
import pg from 'pg';
import { readFile } from 'node:fs/promises';
import { createDatabaseUrl } from '../../infra/src/database-url.mjs';
import { registerHealthRoute } from './health-route.mjs';

const databaseUrl = await createDatabaseUrl();
const pool = new pg.Pool({ connectionString: databaseUrl });
const app = Fastify({ logger: false, bodyLimit: 32 * 1024 });
const productVersion = (await readFile(new URL('../../../VERSION', import.meta.url), 'utf8')).trim();

registerHealthRoute(app, { pool, productVersion });

app.get('/', async (_request, reply) => reply.type('text/html; charset=utf-8').send(
  '<!doctype html><html lang="pt-BR"><meta charset="utf-8"><title>Fila Twitch</title><body><main><h1>Bot local de filas</h1><p>Runtime local pronto. Assistente de instalação em implementação.</p></main></body></html>',
));

let closing = false;
async function shutdown() {
  if (closing) return;
  closing = true;
  await app.close();
  await pool.end();
}
process.on('SIGTERM', () => void shutdown());
process.on('SIGINT', () => void shutdown());

try {
  await app.listen({ host: process.env.APP_HOST ?? '0.0.0.0', port: Number(process.env.APP_PORT ?? 3000) });
} catch {
  await shutdown();
  process.stderr.write('Local application server failed to start. Check runtime configuration and database health.\n');
  process.exitCode = 1;
}
