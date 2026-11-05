import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { removeDevelopmentEnvironment, stopDevelopmentEnvironment } from './dev-database.mjs';
import { ensureDevelopmentEnvFile } from './dev-env.mjs';
import { stopDevelopmentServer } from './dev-server-state.mjs';

const repositoryRoot = resolve(fileURLToPath(new URL('../../../', import.meta.url)));

/** @param {string[]} argv */
export function parseDevelopmentStopArguments(argv) {
  const unknown = argv.find((argument) => argument !== '--keep-data');
  if (unknown !== undefined) throw new Error(`Unknown option "${unknown}". Usage: npm run dev:stop [-- --keep-data]`);
  return { keepData: argv.includes('--keep-data') };
}

/**
 * npm run dev:stop — stops the processes started by npm run dev:start and removes the development
 * Compose project's containers, volumes (ALL development database data) and locally built images.
 * @param {{root?: string, env?: NodeJS.ProcessEnv, command?: string | ((args: string[], options: {cwd: string, env: NodeJS.ProcessEnv, stdio: string}) => Promise<{stdout?: Buffer, stderr?: string} | void>), kill?: (pid: number, signal: NodeJS.Signals | 0) => void, isDevServer?: (pid: number) => boolean, argv?: string[], write?: (text: string) => void}} [options]
 */
export async function runDevelopmentStop({ root = repositoryRoot, env = process.env, command = 'docker', kill, isDevServer, argv = process.argv.slice(2), write = (text) => { process.stdout.write(text); } } = {}) {
  const { keepData } = parseDevelopmentStopArguments(argv);
  const stoppedProcesses = await stopDevelopmentServer({ root, kill, isDevServer });
  if (env.DATABASE_URL) {
    write(stoppedProcesses.length ? `Stopped development processes: ${stoppedProcesses.join(', ')}.\n` : 'Nothing to stop: no development server is running.\n');
    write('DATABASE_URL is set, so no managed development database was touched.\n');
    return;
  }
  if (keepData) {
    const kept = await stopDevelopmentEnvironment({ root, env, command });
    write(`Stopped development processes: ${stoppedProcesses.length ? stoppedProcesses.join(', ') : 'none'}.\n`);
    write(`Stopped containers of Compose project "${kept.projectName}": ${kept.containers.join(', ') || 'none'}. Volumes and images were preserved.\n`);
    return;
  }
  const removed = await removeDevelopmentEnvironment({ root, env, command });
  if (stoppedProcesses.length === 0 && removed.containers.length + removed.volumes.length + removed.images.length === 0) {
    write(`Nothing to stop: no development server is running and Compose project "${removed.projectName}" has no resources.\n`);
    return;
  }
  write(`Stopped development processes: ${stoppedProcesses.length ? stoppedProcesses.join(', ') : 'none'}.\n`);
  write(`Removed from Compose project "${removed.projectName}" (compose.dev.yaml):\n`);
  write(`  containers: ${removed.containers.join(', ') || 'none'}\n`);
  write(`  volumes (development data deleted): ${removed.volumes.join(', ') || 'none'}\n`);
  write(`  locally built images: ${removed.images.join(', ') || 'none'} (pulled images such as postgres are kept)\n`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    process.loadEnvFile(await ensureDevelopmentEnvFile(repositoryRoot));
    await runDevelopmentStop();
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
