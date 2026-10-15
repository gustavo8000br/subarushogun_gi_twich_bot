import { randomBytes } from 'node:crypto';
import { chmod, mkdir, open, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const repositoryRoot = resolve(fileURLToPath(new URL('../../../', import.meta.url)));

export async function ensureDevelopmentDatabaseSecret(root = repositoryRoot) {
  const secretPath = resolve(root, '.local/dev-db/password');
  await mkdir(dirname(secretPath), { recursive: true, mode: 0o700 });
  try {
    const existing = await readFile(secretPath, 'utf8');
    if (existing.trim().length < 40) throw new Error('Development database password file is empty or invalid.');
    await chmod(secretPath, 0o600);
    return secretPath;
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }

  const handle = await open(secretPath, 'wx', 0o600);
  try {
    await handle.writeFile(randomBytes(48).toString('base64url'), 'utf8');
  } finally {
    await handle.close();
  }
  return secretPath;
}

/** @param {string | ((args: string[], options: {cwd: string, env: NodeJS.ProcessEnv, stdio: string}) => Promise<{stdout?: Buffer, stderr?: string} | void>)} command @param {string[]} args @param {{cwd?: string, env?: NodeJS.ProcessEnv, stdio?: 'inherit' | 'pipe'}} [options] @returns {Promise<{stdout?: Buffer, stderr?: string} | void>} */
export function runCommand(command, args, { cwd = repositoryRoot, env = process.env, stdio = 'inherit' } = {}) {
  if (typeof command === 'function') return Promise.resolve(command(args, { cwd, env, stdio }));
  return new Promise((resolvePromise, reject) => {
    const captureOutput = stdio === 'pipe';
    const child = spawn(command, args, { cwd, env, stdio: 'pipe' });
    let stdout = Buffer.alloc(0);
    let stderr = '';
    child.stdout.on('data', (chunk) => {
      if (captureOutput) stdout = Buffer.concat([stdout, chunk]);
      else process.stdout.write(chunk);
    });
    child.stderr.on('data', (chunk) => {
      if (captureOutput) stderr += chunk.toString();
      else process.stderr.write(chunk);
    });
    child.once('error', reject);
    child.once('exit', (code, signal) => {
      if (signal) reject(new Error(`${command} exited after ${signal}.`));
      else if (code !== 0) reject(new Error(`${command} exited with status ${code ?? 1}${stderr ? `: ${stderr.trim()}` : ''}.`));
      else resolvePromise(captureOutput ? { stdout, stderr } : undefined);
    });
  });
}

/** @param {{root?: string, env?: NodeJS.ProcessEnv, command?: string | ((args: string[], options: {cwd: string, env: NodeJS.ProcessEnv, stdio: string}) => Promise<{stdout?: Buffer, stderr?: string} | void>)}} [options] */
export async function startDevelopmentDatabase({ root = repositoryRoot, env = process.env, command = 'docker' } = {}) {
  const secretPath = await ensureDevelopmentDatabaseSecret(root);
  const composeFile = resolve(root, 'compose.dev.yaml');
  const projectName = getDevelopmentComposeProject(root);
  await runCommand(command, ['compose', '-f', composeFile, '-p', projectName, 'up', '-d', '--wait', 'db'], { cwd: root, env });
  const databasePort = env.DEV_DATABASE_PORT ?? '55432';
  const password = (await readFile(secretPath, 'utf8')).trim();
  return {
    databaseUrl: `postgresql://queuebot:${encodeURIComponent(password)}@127.0.0.1:${databasePort}/queuebot?schema=public`,
    projectName,
    composeFile,
    databasePort,
  };
}

export function getDevelopmentComposeProject(root = repositoryRoot) {
  const normalized = root.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(-28);
  return `queuebot-dev-${normalized || 'workspace'}`;
}

/** @param {{root?: string, env?: NodeJS.ProcessEnv, command?: string | ((args: string[], options: {cwd: string, env: NodeJS.ProcessEnv, stdio: string}) => Promise<{stdout?: Buffer, stderr?: string} | void>)}} [options] */
export async function stopDevelopmentDatabase({ root = repositoryRoot, env = process.env, command = 'docker' } = {}) {
  const composeFile = resolve(root, 'compose.dev.yaml');
  await runCommand(command, ['compose', '-f', composeFile, '-p', getDevelopmentComposeProject(root), 'stop', 'db'], { cwd: root, env });
}

/** @param {string} databaseUrl @param {{root?: string, env?: NodeJS.ProcessEnv, projectName?: string, composeFile?: string, command?: string | ((args: string[], options: {cwd: string, env: NodeJS.ProcessEnv, stdio: string}) => Promise<{stdout?: Buffer, stderr?: string} | void>), prismaCommand?: string | ((args: string[], options: {cwd: string, env: NodeJS.ProcessEnv, stdio: string}) => Promise<{stdout?: Buffer, stderr?: string} | void>)}} [options] */
export async function migrateDevelopmentDatabase(databaseUrl, { root = repositoryRoot, env = process.env, projectName, composeFile, command = 'docker', prismaCommand = process.execPath } = {}) {
  const migrationEnv = { ...env, DATABASE_URL: databaseUrl };
  await createDevelopmentDatabaseSnapshot(databaseUrl, root, env, { command, projectName, composeFile });
  await runCommand(prismaCommand, [resolve(root, 'node_modules/prisma/build/index.js'), 'migrate', 'deploy'], { cwd: root, env: migrationEnv });
}

async function createDevelopmentDatabaseSnapshot(databaseUrl, root, env, { command, projectName, composeFile }) {
  const backupDirectory = resolve(root, '.local/dev-db/backups');
  await mkdir(backupDirectory, { recursive: true, mode: 0o700 });
  await chmod(backupDirectory, 0o700);
  const timestamp = new Date().toISOString().replaceAll(':', '-');
  const backupPath = resolve(backupDirectory, `pre-migrate-${timestamp}.dump`);
  try {
    const dump = await runCommand(command, ['compose', '-f', composeFile, '-p', projectName, 'exec', '-T', 'db', 'pg_dump', '-U', 'queuebot', '-d', 'queuebot', '--format=custom', '--no-owner', '--no-acl'], { cwd: root, env, stdio: 'pipe' });
    if (!dump || !dump.stdout || dump.stdout.length === 0) throw new Error('Empty database snapshot.');
    await writeFile(backupPath, dump.stdout, { mode: 0o600, flag: 'wx' });
  } catch {
    throw new Error('Could not create a pre-migration snapshot of the development database; migrations were not applied.');
  }
}
