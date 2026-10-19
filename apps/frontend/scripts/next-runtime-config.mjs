import { buildDevProxyRules, buildProductionProxyRules } from './dev-proxy-config.mjs';

export function buildNextConfig(env = process.env) {
  const devPort = env.NEXT_DEV_PORT ?? '3000';
  const codespacesHost = env.CODESPACE_NAME && env.GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN
    ? `${env.CODESPACE_NAME}-${devPort}.${env.GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN}`
    : null;
  return {
    trailingSlash: false,
    async rewrites() {
      return env.NODE_ENV === 'development'
        ? buildDevProxyRules(env)
        : buildProductionProxyRules(env);
    },
    ...(env.NODE_ENV === 'development' ? {
      allowedDevOrigins: [...new Set(['127.0.0.1', ...(codespacesHost ? [codespacesHost] : [])])],
    } : {}),
  };
}
