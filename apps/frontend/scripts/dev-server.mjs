import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { createInterface } from 'node:readline';
import { ensureLocalTlsCertificate } from '../../infra/src/bootstrap-secret.mjs';
import { buildDevRuntimeConfig, panelAddressLine, rewriteNextBannerLine } from './dev-runtime-config.mjs';
import { ensureDevelopmentEnvFile } from './dev-env.mjs';
import { migrateDevelopmentDatabase, startDevelopmentDatabase } from './dev-database.mjs';
import { runDevelopmentPreflight } from './dev-preflight.mjs';
import { removeDevelopmentServerState, writeDevelopmentServerState } from './dev-server-state.mjs';

const repositoryRoot = resolve(fileURLToPath(new URL('../../../', import.meta.url)));

async function main() {
  const envPath = await ensureDevelopmentEnvFile(repositoryRoot);
  process.loadEnvFile(envPath);
  await runDevelopmentPreflight({ root: repositoryRoot, env: process.env });
  const managedDatabase = process.env.DATABASE_URL ? undefined : await startDevelopmentDatabase({ root: repositoryRoot, env: process.env });
  const runtimeEnv = { ...process.env, ...(managedDatabase ? { DATABASE_URL: managedDatabase.databaseUrl } : {}) };
  const config = buildDevRuntimeConfig(runtimeEnv, repositoryRoot);
  if (managedDatabase) {
    process.stdout.write('Isolated development PostgreSQL is ready. Creating a pre-migration snapshot and applying project migrations...\n');
    await migrateDevelopmentDatabase(managedDatabase.databaseUrl, { root: repositoryRoot, env: runtimeEnv, ...managedDatabase });
  }
  await ensureLocalTlsCertificate({ directory: config.tlsDirectory, exportDirectory: config.tlsDirectory });
  /** @type {NodeJS.ProcessEnv} */
  const runtimeEnvironment = { ...config.api.env };
  if (!runtimeEnvironment.NODE_EXTRA_CA_CERTS) runtimeEnvironment.NODE_EXTRA_CA_CERTS = resolve(config.tlsDirectory, 'localhost-ca.crt');

  const api = spawn(config.api.command, config.api.args, {
    cwd: repositoryRoot, env: runtimeEnvironment, stdio: 'inherit',
  });
  const frontend = spawn(config.frontend.command, config.frontend.args, {
    cwd: repositoryRoot,
    env: {
      ...config.frontend.env,
      NODE_EXTRA_CA_CERTS: runtimeEnvironment.NODE_EXTRA_CA_CERTS,
      ...(process.stdout.isTTY && !process.env.NO_COLOR ? { FORCE_COLOR: process.env.FORCE_COLOR ?? '1' } : {}),
    },
    stdio: ['inherit', 'pipe', 'inherit'],
  });
  // Show the panel address (localhost) instead of the bound 127.0.0.1 in Next's banner (LA-16).
  createInterface({ input: frontend.stdout }).on('line', (line) => {
    process.stdout.write(`${rewriteNextBannerLine(line, config.frontend.banner)}\n`);
  });
  process.stdout.write(`${panelAddressLine(config.api.env.PANEL_DEV_ORIGIN)}\n`);
  const children = [api, frontend];
  await writeDevelopmentServerState(repositoryRoot, { pid: process.pid, children: children.map((child) => child.pid).filter((pid) => pid !== undefined) });
  process.once('exit', () => { void removeDevelopmentServerState(repositoryRoot, process.pid); });
  let shuttingDown = false;

  /** @param {NodeJS.Signals} [signal] */
  const stopChildren = (signal = 'SIGTERM') => {
    if (shuttingDown) return;
    shuttingDown = true;
    for (const child of children) if (child.exitCode === null && child.signalCode === null) child.kill(signal);
  };

  /** @type {NodeJS.Signals[]} */
  const forwardedSignals = ['SIGINT', 'SIGTERM'];
  for (const signal of forwardedSignals) process.on(signal, () => stopChildren(signal));
  for (const child of children) {
    child.on('error', (error) => {
      process.stderr.write(`Development service could not start: ${error.name}\n`);
      process.exitCode = 1;
      stopChildren();
    });
    child.on('exit', (code, signal) => {
      if (!shuttingDown) {
        process.exitCode = signal ? 1 : (code ?? 1);
        stopChildren();
      }
    });
  }
}

main().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
});
