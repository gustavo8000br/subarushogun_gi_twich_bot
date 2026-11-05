import { startDevelopmentDatabase, stopDevelopmentDatabase } from './dev-database.mjs';
import { ensureDevelopmentEnvFile } from './dev-env.mjs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = resolve(fileURLToPath(new URL('../../../', import.meta.url)));

const action = process.argv[2];

try {
  const envPath = await ensureDevelopmentEnvFile(repositoryRoot);
  process.loadEnvFile(envPath);
  if (action === 'start') {
    const database = await startDevelopmentDatabase({ root: repositoryRoot, env: process.env });
    process.stdout.write(`Development database is ready on 127.0.0.1:${database.databasePort}.\n`);
  } else if (action === 'stop') {
    await stopDevelopmentDatabase({ root: repositoryRoot, env: process.env });
    process.stdout.write('Development database stopped. Its isolated data volume was preserved.\n');
  } else {
    throw new Error('Usage: npm run dev:db:start | npm run dev:db:stop');
  }
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
}
