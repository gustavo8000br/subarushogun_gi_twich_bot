import { mkdtemp, readFile, rm, writeFile, mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { assertDevelopmentComposeTarget, getDevelopmentComposeProject, removeDevelopmentEnvironment } from '../../apps/frontend/scripts/dev-database.mjs';
import { readDevelopmentServerState, removeDevelopmentServerState, stopDevelopmentServer, writeDevelopmentServerState } from '../../apps/frontend/scripts/dev-server-state.mjs';
import { parseDevelopmentStopArguments, runDevelopmentStop } from '../../apps/frontend/scripts/dev-stop.mjs';

const scratch = resolve(import.meta.dirname, '../../.local/test-scratch');
const tmpdir = () => scratch;
let root;
beforeAll(async () => { await mkdir(scratch, { recursive: true }); });
afterEach(async () => {
  if (root) await rm(root, { recursive: true, force: true });
  root = undefined;
});

/** Fake docker CLI answering the inspection queries with the given label rows. */
function fakeDocker({ containers = '', volumes = '', images = '' } = {}) {
  const calls = [];
  const command = async (args) => {
    calls.push(args);
    if (args[0] === 'ps') return { stdout: Buffer.from(containers), stderr: '' };
    if (args[0] === 'volume') return { stdout: Buffer.from(volumes), stderr: '' };
    if (args[0] === 'image') return { stdout: Buffer.from(images), stderr: '' };
    return { stdout: Buffer.alloc(0), stderr: '' };
  };
  return { calls, command };
}

describe('development compose target guard', () => {
  it('accepts only compose.dev.yaml at the repository root with the resolved dev project', () => {
    root = '/home/a/queue-bot';
    const project = getDevelopmentComposeProject(root, {});
    expect(assertDevelopmentComposeTarget({ root, env: {}, composeFile: join(root, 'compose.dev.yaml'), projectName: project })).toBe(project);
    expect(() => assertDevelopmentComposeTarget({ root, env: {}, composeFile: join(root, 'compose.yaml'), projectName: project })).toThrow(/compose\.dev\.yaml/);
    expect(() => assertDevelopmentComposeTarget({ root, env: {}, composeFile: join(root, 'compose.dev.yaml'), projectName: 'queuebot-dev-other' })).toThrow(/project/i);
  });

  it('refuses product or non-dev project names even through DEV_COMPOSE_PROJECT', () => {
    root = '/home/a/queue-bot';
    for (const name of ['subarushogun-gi-twitch-queue-bot', 'queuebot-next-development', 'myapp']) {
      expect(() => assertDevelopmentComposeTarget({ root, env: { DEV_COMPOSE_PROJECT: name }, composeFile: join(root, 'compose.dev.yaml') })).toThrow(/queuebot-dev-/);
    }
  });
});

describe('development environment removal', () => {
  it('refuses the product project without running any docker command', async () => {
    root = await mkdtemp(join(tmpdir(), 'dev-stop-'));
    const docker = fakeDocker();
    await expect(removeDevelopmentEnvironment({ root, env: { DEV_COMPOSE_PROJECT: 'subarushogun-gi-twitch-queue-bot' }, command: docker.command })).rejects.toThrow(/Refusing/);
    expect(docker.calls).toEqual([]);
  });

  it('refuses when a labelled container was created from another compose file', async () => {
    root = await mkdtemp(join(tmpdir(), 'dev-stop-'));
    const project = getDevelopmentComposeProject(root, {});
    const docker = fakeDocker({ containers: `${project}-db-1\t${project}\t${join(root, 'compose.yaml')}\n` });
    await expect(removeDevelopmentEnvironment({ root, env: {}, command: docker.command })).rejects.toThrow(/Refusing/);
    expect(docker.calls.some((args) => args.includes('down'))).toBe(false);
  });

  it('refuses when a labelled volume does not belong to the declared dev volume', async () => {
    root = await mkdtemp(join(tmpdir(), 'dev-stop-'));
    const project = getDevelopmentComposeProject(root, {});
    const docker = fakeDocker({ volumes: `unrelated_data\t${project}\n` });
    await expect(removeDevelopmentEnvironment({ root, env: {}, command: docker.command })).rejects.toThrow(/Refusing/);
    expect(docker.calls.some((args) => args.includes('down'))).toBe(false);
  });

  it('runs down --volumes --rmi local only for compose.dev.yaml and the dev project, reporting what it removed', async () => {
    root = await mkdtemp(join(tmpdir(), 'dev-stop-'));
    const project = getDevelopmentComposeProject(root, {});
    const composeFile = join(root, 'compose.dev.yaml');
    const docker = fakeDocker({
      containers: `${project}-db-1\t${project}\t${composeFile}\n`,
      volumes: `${project}_next_dev_postgres_data\t${project}\n`,
    });
    const result = await removeDevelopmentEnvironment({ root, env: {}, command: docker.command });
    expect(docker.calls.at(-1)).toEqual(['compose', '-f', composeFile, '-p', project, 'down', '--volumes', '--rmi', 'local']);
    expect(docker.calls.at(-1)).not.toContain('all');
    expect(result).toEqual({ projectName: project, containers: [`${project}-db-1`], volumes: [`${project}_next_dev_postgres_data`], images: [] });
  });

  it('is a no-op when the dev project has no resources', async () => {
    root = await mkdtemp(join(tmpdir(), 'dev-stop-'));
    const docker = fakeDocker();
    const result = await removeDevelopmentEnvironment({ root, env: {}, command: docker.command });
    expect(result.containers).toEqual([]);
    expect(docker.calls.some((args) => args.includes('down'))).toBe(false);
  });
});

describe('development server state file', () => {
  it('writes, reads and removes the state under .local/dev-server', async () => {
    root = await mkdtemp(join(tmpdir(), 'dev-stop-'));
    const path = await writeDevelopmentServerState(root, { pid: 10, children: [11, 12] });
    expect(path).toBe(join(root, '.local/dev-server/state.json'));
    expect(await readDevelopmentServerState(root)).toMatchObject({ pid: 10, children: [11, 12] });
    await removeDevelopmentServerState(root, 10);
    expect(await readDevelopmentServerState(root)).toBeUndefined();
  });

  it('ignores malformed state and does not remove another run state', async () => {
    root = await mkdtemp(join(tmpdir(), 'dev-stop-'));
    await mkdir(join(root, '.local/dev-server'), { recursive: true });
    await writeFile(join(root, '.local/dev-server/state.json'), '{"pid":"x"}');
    expect(await readDevelopmentServerState(root)).toBeUndefined();
    await writeDevelopmentServerState(root, { pid: 20, children: [] });
    await removeDevelopmentServerState(root, 99);
    expect(JSON.parse(await readFile(join(root, '.local/dev-server/state.json'), 'utf8')).pid).toBe(20);
  });

  it('signals only the recorded live processes and clears the state', async () => {
    root = await mkdtemp(join(tmpdir(), 'dev-stop-'));
    await writeDevelopmentServerState(root, { pid: 30, children: [31, 32] });
    const alive = new Set([30, 31]);
    const signals = [];
    const kill = (pid, signal) => {
      if (!alive.has(pid)) { const error = new Error('ESRCH'); Object.assign(error, { code: 'ESRCH' }); throw error; }
      if (signal !== 0) signals.push([pid, signal]);
      if (signal === 'SIGTERM') alive.delete(pid);
    };
    const stopped = await stopDevelopmentServer({ root, kill, isDevServer: () => true, timeoutMs: 50 });
    expect(signals).toEqual([[30, 'SIGTERM'], [31, 'SIGTERM']]);
    expect(stopped).toEqual([30, 31]);
    expect(await readDevelopmentServerState(root)).toBeUndefined();
  });

  it('does not signal a reused PID that is not the dev server', async () => {
    root = await mkdtemp(join(tmpdir(), 'dev-stop-'));
    await writeDevelopmentServerState(root, { pid: 40, children: [41] });
    const signals = [];
    const stopped = await stopDevelopmentServer({ root, kill: (pid, signal) => { if (signal !== 0) signals.push(pid); }, isDevServer: () => false, timeoutMs: 50 });
    expect(signals).toEqual([]);
    expect(stopped).toEqual([]);
  });
});

describe('dev:stop command', () => {
  it('prints an idempotent message when nothing is running', async () => {
    root = await mkdtemp(join(tmpdir(), 'dev-stop-'));
    const output = [];
    await runDevelopmentStop({ root, env: {}, command: fakeDocker().command, write: (text) => output.push(text) });
    expect(output.join('')).toMatch(/Nothing to stop/);
  });
});

describe('dev:stop --keep-data', () => {
  it('accepts only no flag or --keep-data', () => {
    expect(parseDevelopmentStopArguments([])).toEqual({ keepData: false });
    expect(parseDevelopmentStopArguments(['--keep-data'])).toEqual({ keepData: true });
    expect(() => parseDevelopmentStopArguments(['--purge'])).toThrow(/Unknown option "--purge".*--keep-data/);
  });

  it('rejects an unknown flag before stopping or removing anything', async () => {
    root = await mkdtemp(join(tmpdir(), 'dev-stop-'));
    const docker = fakeDocker();
    await expect(runDevelopmentStop({ root, env: {}, command: docker.command, argv: ['--force'], write: () => {} })).rejects.toThrow(/Unknown option/);
    expect(docker.calls).toEqual([]);
  });

  it('stops only the db container, never down or removal, and preserves data', async () => {
    root = await mkdtemp(join(tmpdir(), 'dev-stop-'));
    const project = getDevelopmentComposeProject(root, {});
    const composeFile = join(root, 'compose.dev.yaml');
    const docker = fakeDocker({ containers: `${project}-db-1\t${project}\t${composeFile}\n`, volumes: `${project}_next_dev_postgres_data\t${project}\n` });
    const output = [];
    await runDevelopmentStop({ root, env: {}, command: docker.command, argv: ['--keep-data'], write: (text) => output.push(text) });
    expect(docker.calls.at(-1)).toEqual(['compose', '-f', composeFile, '-p', project, 'stop', 'db']);
    expect(docker.calls.flat()).not.toContain('down');
    expect(docker.calls.flat()).not.toContain('--volumes');
    expect(output.join('')).toMatch(/preserved/);
  });

  it('applies the same project and label guards', async () => {
    root = await mkdtemp(join(tmpdir(), 'dev-stop-'));
    const product = fakeDocker();
    await expect(runDevelopmentStop({ root, env: { DEV_COMPOSE_PROJECT: 'subarushogun-gi-twitch-queue-bot' }, command: product.command, argv: ['--keep-data'], write: () => {} })).rejects.toThrow(/Refusing/);
    expect(product.calls).toEqual([]);
    const project = getDevelopmentComposeProject(root, {});
    const foreign = fakeDocker({ containers: `${project}-db-1\t${project}\t${join(root, 'compose.yaml')}\n` });
    await expect(runDevelopmentStop({ root, env: {}, command: foreign.command, argv: ['--keep-data'], write: () => {} })).rejects.toThrow(/Refusing/);
    expect(foreign.calls.flat()).not.toContain('stop');
  });

  it('explains manual removal when the project lacks the dev prefix', () => {
    expect(() => assertDevelopmentComposeTarget({ root: '/home/a/queue-bot', env: { DEV_COMPOSE_PROJECT: 'myapp' } })).toThrow(/manually.*docker compose -f .*compose\.dev\.yaml -p myapp down --volumes/s);
  });
});
