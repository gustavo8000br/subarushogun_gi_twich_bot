import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

/** @param {string} root */
export function getDevelopmentServerStatePath(root) {
  return resolve(root, '.local/dev-server/state.json');
}

/** @param {unknown} value @returns {value is number} */
const isPid = (value) => Number.isInteger(value) && Number(value) > 0;

/** @param {string} root @param {{pid: number, children: number[]}} state */
export async function writeDevelopmentServerState(root, { pid, children }) {
  const path = getDevelopmentServerStatePath(root);
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  await writeFile(path, `${JSON.stringify({ pid, children, startedAt: new Date().toISOString() })}\n`, { mode: 0o600 });
  return path;
}

/** @param {string} root @returns {Promise<{pid: number, children: number[]} | undefined>} */
export async function readDevelopmentServerState(root) {
  try {
    const state = JSON.parse(await readFile(getDevelopmentServerStatePath(root), 'utf8'));
    if (!isPid(state.pid) || !Array.isArray(state.children) || !state.children.every(isPid)) return undefined;
    return { pid: state.pid, children: state.children };
  } catch {
    return undefined;
  }
}

/** Removes the state only when it still belongs to the given dev-server PID. @param {string} root @param {number} [pid] */
export async function removeDevelopmentServerState(root, pid) {
  if (pid !== undefined) {
    const state = await readDevelopmentServerState(root);
    if (state && state.pid !== pid) return;
  }
  await rm(getDevelopmentServerStatePath(root), { force: true });
}

/** Best-effort PID-reuse guard: on Linux the recorded parent must still be dev-server.mjs. @param {number} pid */
export function isDevelopmentServerProcess(pid) {
  try {
    return readFileSync(`/proc/${pid}/cmdline`, 'utf8').includes('dev-server.mjs');
  } catch {
    return process.platform !== 'linux';
  }
}

/** @param {(pid: number, signal: NodeJS.Signals | 0) => void} kill @param {number} pid */
function isAlive(kill, pid) {
  try {
    kill(pid, 0);
    return true;
  } catch (error) {
    return error.code === 'EPERM';
  }
}

/**
 * Sends SIGTERM to the recorded dev-server and its API/Next children (SIGKILL after timeout).
 * @param {{root: string, kill?: (pid: number, signal: NodeJS.Signals | 0) => void, isDevServer?: (pid: number) => boolean, timeoutMs?: number}} options
 * @returns {Promise<number[]>} PIDs that were signalled.
 */
export async function stopDevelopmentServer({ root, kill = (pid, signal) => { process.kill(pid, signal); }, isDevServer = isDevelopmentServerProcess, timeoutMs = 10_000 }) {
  const state = await readDevelopmentServerState(root);
  if (!state) {
    await removeDevelopmentServerState(root);
    return [];
  }
  /** @type {number[]} */
  const signalled = [];
  if (isAlive(kill, state.pid) && isDevServer(state.pid)) {
    for (const pid of [state.pid, ...state.children]) {
      if (!isAlive(kill, pid)) continue;
      try {
        kill(pid, 'SIGTERM');
        signalled.push(pid);
      } catch (error) {
        if (error.code !== 'ESRCH') throw error;
      }
    }
    const deadline = Date.now() + timeoutMs;
    while (signalled.some((pid) => isAlive(kill, pid)) && Date.now() < deadline) await new Promise((done) => setTimeout(done, 100));
    for (const pid of signalled) if (isAlive(kill, pid)) kill(pid, 'SIGKILL');
  }
  await removeDevelopmentServerState(root);
  return signalled;
}
