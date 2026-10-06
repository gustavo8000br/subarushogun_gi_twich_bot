/**
 * Build the environment inherited by Docker Compose calls in native recovery tests.
 * @param {string} appOrigin
 * @param {NodeJS.ProcessEnv} inherited
 * @returns {NodeJS.ProcessEnv}
 */
export function composeEnvironmentForOrigin(appOrigin, inherited = {}) {
  const origin = new URL(appOrigin);
  return { ...inherited, APP_PORT: origin.port || '3000' };
}
