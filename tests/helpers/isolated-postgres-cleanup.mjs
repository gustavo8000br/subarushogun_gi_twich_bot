/** Total time the cleanup may spend converging before it fails visibly. */
export const ISOLATED_POSTGRES_CLEANUP_DEADLINE_MS = 60_000;
/** Per-call timeout for each `docker` command issued by the cleanup. */
export const ISOLATED_POSTGRES_CLEANUP_CALL_TIMEOUT_MS = 15_000;
/**
 * `afterAll` budget: the deadline can be exceeded by at most one in-flight call,
 * plus a margin for closing the database client before the cleanup starts.
 */
export const ISOLATED_POSTGRES_AFTER_ALL_TIMEOUT_MS = ISOLATED_POSTGRES_CLEANUP_DEADLINE_MS
  + ISOLATED_POSTGRES_CLEANUP_CALL_TIMEOUT_MS + 30_000;

const DEFAULT_POLL_INTERVAL_MS = 500;
const MAX_STDERR_LENGTH = 500;

/** @typedef {{status: number | null, signal?: string | null, stdout?: string, stderr?: string, error?: {code?: string}}} DockerResult */

function defaultSleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * @param {DockerResult | undefined} result
 * @param {'container' | 'volume'} resource
 */
function isMissing(result, resource) {
  return Boolean(result) && result.status !== 0
    && new RegExp(`no such (?:${resource}|object)`, 'i').test(result.stderr || '');
}

/** @param {DockerResult} result */
function isTransientRemoval(result) {
  return result.error?.code === 'ETIMEDOUT'
    || Boolean(result.signal)
    || /removal of container .* is already in progress/i.test(result.stderr || '');
}

/**
 * Describe a docker result without stdout: `inspect` output contains the container
 * environment (test credentials), so only exit data and stderr are reported.
 * @param {DockerResult | undefined} result
 */
export function describeDockerResult(result) {
  if (!result) return 'not run';
  const stderr = (result.stderr || '').trim().slice(0, MAX_STDERR_LENGTH) || '(empty)';
  return `status=${result.status ?? 'null'} signal=${result.signal || 'none'} code=${result.error?.code || 'none'} stderr=${stderr}`;
}

/**
 * Remove one disposable PostgreSQL test container and, when given, its named volume.
 * Safe to call when the container was never created (`docker rm --force` is idempotent).
 * Removal is treated as a converging state check with a deadline: the container is
 * polled with `docker inspect` until Docker reports it missing, and volume removal is
 * retried while the volume is still in use.
 * @param {{
 *   containerName: string,
 *   volumeName?: string,
 *   runDocker: (args: string[]) => DockerResult,
 *   sleep?: (ms: number) => Promise<void>,
 *   now?: () => number,
 *   deadlineMs?: number,
 *   pollIntervalMs?: number,
 * }} options
 */
export async function cleanupIsolatedPostgres({
  containerName,
  volumeName,
  runDocker,
  sleep = defaultSleep,
  now = Date.now,
  deadlineMs = ISOLATED_POSTGRES_CLEANUP_DEADLINE_MS,
  pollIntervalMs = DEFAULT_POLL_INTERVAL_MS,
}) {
  const startedAt = now();
  const deadline = startedAt + deadlineMs;

  let removal = runDocker(['rm', '--force', containerName]);
  for (;;) {
    const inspection = runDocker(['inspect', containerName]);
    if (isMissing(inspection, 'container')) break;
    if (now() >= deadline) {
      throw new Error(`Isolated PostgreSQL container cleanup failed for ${containerName} after ${now() - startedAt} ms `
        + `(last rm: ${describeDockerResult(removal)}; last inspect: ${describeDockerResult(inspection)})`);
    }
    await sleep(pollIntervalMs);
    const removalSettled = removal.status === 0 || isMissing(removal, 'container') || isTransientRemoval(removal);
    if (!removalSettled) removal = runDocker(['rm', '--force', containerName]);
  }

  if (!volumeName) return;

  for (;;) {
    const volumeRemoval = runDocker(['volume', 'rm', '--force', volumeName]);
    let volumeInspection;
    if (volumeRemoval.status === 0 || isMissing(volumeRemoval, 'volume')) {
      volumeInspection = runDocker(['volume', 'inspect', volumeName]);
      if (isMissing(volumeInspection, 'volume')) return;
    }
    if (now() >= deadline) {
      throw new Error(`Isolated PostgreSQL volume cleanup failed for ${volumeName} after ${now() - startedAt} ms `
        + `(last volume rm: ${describeDockerResult(volumeRemoval)}; last volume inspect: ${describeDockerResult(volumeInspection)})`);
    }
    await sleep(pollIntervalMs);
  }
}
