import { readFile } from 'node:fs/promises';
import { createServer } from 'node:https';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const next = createRequire(import.meta.url)('next');

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const frontendDirectory = resolve(scriptDirectory, '..');
const host = process.env.PANEL_HOST ?? '127.0.0.1';
const port = Number(process.env.PANEL_PORT ?? 3000);
const keyPath = process.env.TLS_KEY_FILE ?? '/run/secrets/localhost.key';
const certificatePath = process.env.TLS_CERT_FILE ?? '/run/secrets/localhost.crt';
const [key, cert] = await Promise.all([readFile(keyPath), readFile(certificatePath)]);
const application = next({ dev: false, dir: frontendDirectory, hostname: host, port });
let server;

try {
  await application.prepare();
  server = createServer({ key, cert }, application.getRequestHandler());
  await new Promise((resolveListen, reject) => {
    server.once('error', reject);
    server.listen({ port, host }, resolveListen);
  });
  process.stdout.write(`Next.js panel listening on https://${host}:${port}\n`);
} catch {
  await application.close().catch(() => undefined);
  process.stderr.write('Next.js production server failed to start. Check the local TLS certificate and port configuration.\n');
  process.exitCode = 1;
}

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, () => {
    server?.close(() => { void application.close().finally(() => { process.exitCode = 0; }); });
  });
}
