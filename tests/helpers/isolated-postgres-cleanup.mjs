function isMissing(result, resource) {
  return result.status !== 0 && new RegExp(`no such (?:${resource}|object)`, 'i').test(result.stderr ?? '');
}

/**
 * Remove one disposable PostgreSQL test container and its named volume.
 * @param {{containerName: string, volumeName: string, runDocker: (args: string[]) => {status: number, stdout?: string, stderr?: string}}} options
 */
export function cleanupIsolatedPostgres({ containerName, volumeName, runDocker }) {
  runDocker(['rm', '--force', containerName]);
  const container = runDocker(['inspect', containerName]);
  if (container.status === 0 || (container.status !== 0 && !isMissing(container, 'container'))) {
    throw new Error(`Isolated PostgreSQL container cleanup failed: ${container.stderr ?? container.stdout ?? 'container remains'}`);
  }

  const removal = runDocker(['volume', 'rm', '--force', volumeName]);
  if (removal.status !== 0 && !isMissing(removal, 'volume')) {
    throw new Error(`Isolated PostgreSQL volume cleanup failed: ${removal.stderr ?? removal.stdout ?? 'remove failed'}`);
  }
  const volume = runDocker(['volume', 'inspect', volumeName]);
  if (volume.status === 0 || (volume.status !== 0 && !isMissing(volume, 'volume'))) {
    throw new Error(`Isolated PostgreSQL volume cleanup failed: ${volume.stderr ?? volume.stdout ?? 'volume remains'}`);
  }
}
