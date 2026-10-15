import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { ensureLocalTlsCertificate } from '../../infra/src/bootstrap-secret.mjs';
import { buildDevRuntimeConfig } from './dev-runtime-config.mjs';
import { ensureDevelopmentEnvFile } from './dev-env.mjs';
import { migrateDevelopmentDatabase, startDevelopmentDatabase } from './dev-database.mjs';

const repositoryRoot = resolve(fileURLToPath(new URL('../../../', import.meta.url)));

async function main() {
  const envPath = await ensureDevelopmentEnvFile(repositoryRoot);
  process.loadEnvFile(envPath);
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
    cwd: repositoryRoot, env: { ...config.frontend.env, NODE_EXTRA_CA_CERTS: runtimeEnvironment.NODE_EXTRA_CA_CERTS }, stdio: 'inherit',
  });
  const children = [api, frontend];
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
