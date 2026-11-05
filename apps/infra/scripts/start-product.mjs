import { spawn } from 'node:child_process';

const services = [
  ['Fastify API', 'apps/api/src/server.mjs'],
  ['Next.js panel', 'apps/frontend/scripts/start-production.mjs'],
].map(([name, entrypoint]) => ({
  name,
  process: spawn(process.execPath, [entrypoint], { stdio: 'inherit', env: process.env }),
}));

let stopping = false;
function stop(exitCode = 0) {
  if (stopping) return;
  stopping = true;
  for (const service of services) if (service.process.exitCode === null) service.process.kill('SIGTERM');
  const pending = services.filter(({ process: child }) => child.exitCode === null);
  if (!pending.length) process.exitCode = exitCode;
  else Promise.all(pending.map(({ process: child }) => new Promise((resolve) => child.once('exit', resolve))))
    .then(() => { process.exitCode = exitCode; });
}

for (const service of services) {
  service.process.once('error', () => {
    process.stderr.write(`${service.name} could not be started.\n`);
    stop(1);
  });
  service.process.once('exit', (code) => {
    if (!stopping) stop(code || 1);
  });
}

process.once('SIGINT', () => stop(0));
process.once('SIGTERM', () => stop(0));
