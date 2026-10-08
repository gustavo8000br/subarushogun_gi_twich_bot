const ACCEPTANCE_PROJECT_PATTERN = /^queuebot-accept-[0-9]+-[a-f0-9]{8}$/;

function runDockerOrThrow(runDocker, args) {
  const result = runDocker(args);
  if (result?.status !== 0) {
    throw new Error(result?.stderr || result?.stdout || `docker ${args.join(' ')} failed`);
  }
  return result.stdout ?? '';
}

/**
 * Stop a test-only Compose project and remove only its explicitly scoped volumes.
 * @param {{projectName: string, composeFile: string, runDocker: (args: string[]) => {status: number, stdout?: string, stderr?: string}}} options
 */
export function cleanupIsolatedComposeProject({ projectName, composeFile, runDocker }) {
  if (!ACCEPTANCE_PROJECT_PATTERN.test(projectName)) {
    throw new Error('Refusing cleanup: project name is not an isolated acceptance project');
  }

  const configOutput = runDockerOrThrow(runDocker, [
    'compose', '--project-name', projectName, '--file', composeFile, 'config', '--format', 'json',
  ]);
  let config;
  try {
    config = JSON.parse(configOutput);
  } catch {
    throw new Error('Refusing cleanup: isolated Compose configuration is invalid JSON');
  }

  const expectedPrefix = `${projectName}_`;
  const configuredVolumeNames = Object.entries(config.volumes ?? {}).map(([key, volume]) => volume?.name || expectedPrefix + key);
  if (configuredVolumeNames.some((name) => typeof name !== 'string' || !name.startsWith(expectedPrefix))) {
    throw new Error('Refusing cleanup: Compose volume resolves outside the isolated test namespace');
  }

  runDockerOrThrow(runDocker, [
    'compose', '--project-name', projectName, '--file', composeFile, 'down', '--remove-orphans',
  ]);

  const listedVolumes = runDockerOrThrow(runDocker, [
    'volume', 'ls', '--quiet', '--filter', `label=com.docker.compose.project=${projectName}`,
  ]).split(/\r?\n/).map((name) => name.trim()).filter(Boolean);
  if (listedVolumes.some((name) => !name.startsWith(expectedPrefix))) {
    throw new Error('Refusing cleanup: Docker returned a volume outside the isolated test namespace');
  }
  if (listedVolumes.length > 0) {
    runDockerOrThrow(runDocker, ['volume', 'rm', ...listedVolumes]);
  }

  return { removedVolumeNames: listedVolumes };
}
