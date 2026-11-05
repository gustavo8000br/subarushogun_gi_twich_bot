import { spawnSync } from 'node:child_process';
import { describeDockerResult } from './isolated-postgres-cleanup.mjs';

/** Single tag for every disposable PostgreSQL integration test (same image as Compose). */
export const ISOLATED_POSTGRES_IMAGE = 'postgres:18.6-bookworm';
/** Label applied to every disposable test container, for `docker ps -a --filter label=queuebot.test`. */
export const ISOLATED_POSTGRES_LABEL = 'queuebot.test=disposable';
/** Budget for a cold `docker pull` of the image (~630 MB). */
export const ISOLATED_POSTGRES_PULL_TIMEOUT_MS = 600_000;
const IMAGE_INSPECT_TIMEOUT_MS = 30_000;
/** Setup budget before the image work was added (run, readiness, migrations). */
const CONTAINER_SETUP_TIMEOUT_MS = 120_000;
/** `beforeAll` budget: image inspect + a cold pull + the original container setup. */
export const ISOLATED_POSTGRES_BEFORE_ALL_TIMEOUT_MS = IMAGE_INSPECT_TIMEOUT_MS
  + ISOLATED_POSTGRES_PULL_TIMEOUT_MS + CONTAINER_SETUP_TIMEOUT_MS;

/**
 * Run one `docker` command synchronously with a bounded timeout.
 * @param {string[]} args
 * @param {{timeout?: number}} [options]
 */
export function runDockerCommand(args, { timeout = 30_000 } = {}) {
  return spawnSync('docker', args, { encoding: 'utf8', timeout });
}

/**
 * Make sure the disposable PostgreSQL image is cached before `docker run --pull never`,
 * so an implicit pull never runs inside the short `docker run` timeout.
 * @param {{
 *   runDocker?: (args: string[], options: {timeout: number}) => import('./isolated-postgres-cleanup.mjs').DockerResult,
 *   image?: string,
 *   pullTimeoutMs?: number,
 * }} [options]
 * @returns {{pulled: boolean}}
 */
export function ensurePostgresImage({
  runDocker = runDockerCommand,
  image = ISOLATED_POSTGRES_IMAGE,
  pullTimeoutMs = ISOLATED_POSTGRES_PULL_TIMEOUT_MS,
} = {}) {
  const inspection = runDocker(['image', 'inspect', '--format', '{{.Id}}', image], { timeout: IMAGE_INSPECT_TIMEOUT_MS });
  if (inspection.status === 0) return { pulled: false };
  if (!/no such image/i.test(inspection.stderr || '')) {
    throw new Error(`Disposable PostgreSQL image check: docker image inspect ${image} failed (${describeDockerResult(inspection)})`);
  }

  const pull = runDocker(['pull', image], { timeout: pullTimeoutMs });
  if (pull.status !== 0) {
    throw new Error(`Disposable PostgreSQL image is not cached and docker pull ${image} failed (${describeDockerResult(pull)})`);
  }
  return { pulled: true };
}
