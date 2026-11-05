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
  const projectName = getDevelopmentComposeProject(root, env);
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

/** An explicit DEV_COMPOSE_PROJECT separates checkouts whose paths end in the same 28 characters. */
export function getDevelopmentComposeProject(root = repositoryRoot, env = process.env) {
  const override = env.DEV_COMPOSE_PROJECT;
  if (override !== undefined && override !== '') {
    if (!/^[a-z0-9][a-z0-9_-]{0,62}$/.test(override)) {
      throw new Error('DEV_COMPOSE_PROJECT must be 1-63 characters: lowercase letters, digits, "-" or "_", starting with a letter or digit.');
    }
    return override;
  }
  const normalized = root.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(-28);
  return `queuebot-dev-${normalized || 'workspace'}`;
}

/** @param {{root?: string, env?: NodeJS.ProcessEnv, command?: string | ((args: string[], options: {cwd: string, env: NodeJS.ProcessEnv, stdio: string}) => Promise<{stdout?: Buffer, stderr?: string} | void>)}} [options] */
export async function stopDevelopmentDatabase({ root = repositoryRoot, env = process.env, command = 'docker' } = {}) {
  const composeFile = resolve(root, 'compose.dev.yaml');
  await runCommand(command, ['compose', '-f', composeFile, '-p', getDevelopmentComposeProject(root, env), 'stop', 'db'], { cwd: root, env });
}

const DEVELOPMENT_PROJECT_PREFIX = 'queuebot-dev-';
const DEVELOPMENT_VOLUME = 'next_dev_postgres_data';

/**
 * Destructive operations accept only compose.dev.yaml at the repository root and the project
 * resolved by getDevelopmentComposeProject, which must use the queuebot-dev- naming.
 * @param {{root?: string, env?: NodeJS.ProcessEnv, composeFile?: string, projectName?: string}} [options]
 */
export function assertDevelopmentComposeTarget({ root = repositoryRoot, env = process.env, composeFile = resolve(root, 'compose.dev.yaml'), projectName } = {}) {
  if (resolve(composeFile) !== resolve(root, 'compose.dev.yaml')) {
    throw new Error('Refusing to remove resources: only compose.dev.yaml at the repository root is allowed.');
  }
  const resolvedProject = getDevelopmentComposeProject(root, env);
  if (!resolvedProject.startsWith(DEVELOPMENT_PROJECT_PREFIX)) {
    throw new Error(`Refusing to remove resources: Compose project "${resolvedProject}" does not use the development naming "${DEVELOPMENT_PROJECT_PREFIX}*". To remove it manually, first check its resources with \`docker ps -a --filter label=com.docker.compose.project=${resolvedProject}\` and \`docker volume ls --filter label=com.docker.compose.project=${resolvedProject}\`, then run \`docker compose -f ${resolve(root, 'compose.dev.yaml')} -p ${resolvedProject} down --volumes\` yourself.`);
  }
  if (projectName !== undefined && projectName !== resolvedProject) {
    throw new Error(`Refusing to remove resources: project "${projectName}" is not the resolved development project "${resolvedProject}".`);
  }
  return resolvedProject;
}

/** @param {Buffer | undefined} stdout */
function parseRows(stdout) {
  return (stdout ? stdout.toString() : '').split('\n').map((line) => line.trim()).filter(Boolean).map((line) => line.split('\t'));
}

/**
 * Stops the development Compose project and deletes its containers, named volumes (ALL dev data)
 * and images built locally for it (--rmi local). Pulled images such as postgres are preserved.
 * @param {{root?: string, env?: NodeJS.ProcessEnv, command?: string | ((args: string[], options: {cwd: string, env: NodeJS.ProcessEnv, stdio: string}) => Promise<{stdout?: Buffer, stderr?: string} | void>)}} [options]
 */
export async function removeDevelopmentEnvironment({ root = repositoryRoot, env = process.env, command = 'docker' } = {}) {
  const { composeFile, ...result } = await inspectDevelopmentEnvironment({ root, env, command });
  if (result.containers.length + result.volumes.length + result.images.length === 0) return result;
  await runCommand(command, ['compose', '-f', composeFile, '-p', result.projectName, 'down', '--volumes', '--rmi', 'local'], { cwd: root, env });
  return result;
}

/**
 * Same guards as removal, then only `stop db` (stopDevelopmentDatabase): volumes and images are preserved.
 * @param {{root?: string, env?: NodeJS.ProcessEnv, command?: string | ((args: string[], options: {cwd: string, env: NodeJS.ProcessEnv, stdio: string}) => Promise<{stdout?: Buffer, stderr?: string} | void>)}} [options]
 */
export async function stopDevelopmentEnvironment({ root = repositoryRoot, env = process.env, command = 'docker' } = {}) {
  const { projectName, containers } = await inspectDevelopmentEnvironment({ root, env, command });
  if (containers.length > 0) await stopDevelopmentDatabase({ root, env, command });
  return { projectName, containers };
}

/** Guards file/project and verifies compose labels of every container, volume and image before any change. @param {{root: string, env: NodeJS.ProcessEnv, command: any}} options */
async function inspectDevelopmentEnvironment({ root, env, command }) {
  const composeFile = resolve(root, 'compose.dev.yaml');
  const projectName = assertDevelopmentComposeTarget({ root, env, composeFile });
  const label = `label=com.docker.compose.project=${projectName}`;
  const query = async (args) => parseRows((await runCommand(command, args, { cwd: root, env, stdio: 'pipe' }) || {}).stdout);
  const containers = await query(['ps', '-a', '--filter', label, '--format', '{{.Names}}\t{{.Label "com.docker.compose.project"}}\t{{.Label "com.docker.compose.project.config_files"}}']);
  const volumes = await query(['volume', 'ls', '--filter', label, '--format', '{{.Name}}\t{{.Label "com.docker.compose.project"}}']);
  const images = await query(['image', 'ls', '--filter', label, '--format', '{{.Repository}}:{{.Tag}}\t{{.Label "com.docker.compose.project"}}']);
  for (const [name, project, configFiles = ''] of containers) {
    const files = configFiles.split(',').filter(Boolean);
    if (project !== projectName || files.length === 0 || files.some((file) => resolve(file) !== composeFile)) {
      throw new Error(`Refusing to remove resources: container "${name}" was not created from ${composeFile} for project "${projectName}".`);
    }
  }
  for (const [name, project] of volumes) {
    if (project !== projectName || name !== `${projectName}_${DEVELOPMENT_VOLUME}`) {
      throw new Error(`Refusing to remove resources: volume "${name}" is not the declared development volume of project "${projectName}".`);
    }
  }
  for (const [name, project] of images) {
    if (project !== projectName) throw new Error(`Refusing to remove resources: image "${name}" is not labelled for project "${projectName}".`);
  }
  return { composeFile, projectName, containers: containers.map(([name]) => name), volumes: volumes.map(([name]) => name), images: images.map(([name]) => name) };
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
