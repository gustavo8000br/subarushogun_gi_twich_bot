import { resolve } from 'node:path';

export function buildDevRuntimeConfig(env = process.env, repositoryRoot = process.cwd()) {
  const certDirectory = resolve(repositoryRoot, env.DEV_TLS_DIRECTORY ?? '.local/dev-tls');
  const appPort = env.APP_PORT ?? '3109';
  const nextDevPort = env.NEXT_DEV_PORT ?? '3100';
  const codespacesOrigin = env.CODESPACE_NAME && env.GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN
    ? `https://${env.CODESPACE_NAME}-${nextDevPort}.${env.GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN}`
    : undefined;
  /** @type {NodeJS.ProcessEnv} */
  const runtimeEnvironment = {
    ...env,
    DATABASE_URL: env.DATABASE_URL ?? `postgresql://queuebot:dev-only@127.0.0.1:${env.DEV_DATABASE_PORT ?? '55432'}/queuebot?schema=public`,
    NODE_ENV: 'development',
    APP_PORT: appPort,
    APP_HOST: env.APP_HOST ?? '127.0.0.1',
    ...(codespacesOrigin ? { PANEL_DEV_ORIGIN: codespacesOrigin } : {}),
    TLS_KEY_FILE: env.TLS_KEY_FILE ?? resolve(certDirectory, 'localhost.key'),
    TLS_CERT_FILE: env.TLS_CERT_FILE ?? resolve(certDirectory, 'localhost.crt'),
  };

  return {
    api: { command: process.execPath, args: ['apps/api/src/server.mjs'], env: runtimeEnvironment },
    frontend: {
      command: process.execPath,
      args: [resolve(repositoryRoot, 'node_modules/next/dist/bin/next'), 'dev', 'apps/frontend', '--hostname', '0.0.0.0', '--port', nextDevPort],
      env: { ...runtimeEnvironment, FASTIFY_DEV_ORIGIN: env.FASTIFY_DEV_ORIGIN ?? `https://localhost:${appPort}` },
    },
    tlsDirectory: certDirectory,
  };
}
