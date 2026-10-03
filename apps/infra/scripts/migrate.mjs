import { spawn } from 'node:child_process';
import { createDatabaseUrl } from '../src/database-url.mjs';

process.env.DATABASE_URL = await createDatabaseUrl();
const child = spawn('node', ['node_modules/prisma/build/index.js', 'migrate', 'deploy'], {
  stdio: 'inherit',
  env: process.env,
});
child.on('error', () => {
  process.stderr.write('Database migrations could not be started.\n');
  process.exitCode = 1;
});
child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exitCode = code ?? 1;
});
