import { spawnSync } from 'node:child_process';
import { access } from 'node:fs/promises';
import { resolve } from 'node:path';

const EXPECTED_NODE_VERSION = 'v24.20.0';

function runCheck(command, args, root) {
  try {
    return spawnSync(command, args, { cwd: root, encoding: 'utf8', windowsHide: true });
  } catch {
    return { status: 1, stdout: '', stderr: '' };
  }
}

async function checkProjectDependencies(root) {
  try {
    await access(resolve(root, 'node_modules/next/dist/bin/next'));
    await access(resolve(root, 'node_modules/prisma/build/index.js'));
    return true;
  } catch {
    return false;
  }
}

/** @param {{env?: NodeJS.ProcessEnv, root?: string, checkCommand?: (command: string, args: string[], root: string) => {status: number | null, stdout?: string | null}, checkDependencies?: (root: string) => Promise<boolean>}} [options] */
export async function runDevelopmentPreflight({
  env = process.env,
  root = process.cwd(),
  checkCommand = runCheck,
  checkDependencies = checkProjectDependencies,
} = {}) {
  const nodeResult = checkCommand(process.execPath, ['--version'], root);
  const nodeVersion = nodeResult.stdout?.trim();
  if (nodeResult.status !== 0 || nodeVersion !== EXPECTED_NODE_VERSION) {
    throw new Error(`This project requires Node.js 24.20.0. Current version: ${nodeVersion || 'unavailable'}. Install/use Node 24.20.0, then retry npm run dev.`);
  }

  if (!await checkDependencies(root)) {
    throw new Error('Project dependencies are missing. Run npm ci from the repository root, then retry npm run dev.');
  }

  if (env.DATABASE_URL) return;

  const composeResult = checkCommand('docker', ['compose', 'version'], root);
  if (composeResult.status !== 0 || !/Docker Compose version v(?:2|5)\./i.test(composeResult.stdout ?? '')) {
    throw new Error('Docker Compose v2 or v5 is required. Install/start Docker Engine or Desktop, then retry npm run dev.');
  }

  const engineResult = checkCommand('docker', ['info', '--format', '{{.ServerVersion}}'], root);
  if (engineResult.status !== 0 || !engineResult.stdout?.trim()) {
    throw new Error('Docker Engine is not running or accessible. Start Docker Desktop/Engine, then retry npm run dev.');
  }
}
