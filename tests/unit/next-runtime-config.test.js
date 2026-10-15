import { describe, expect, it } from 'vitest';
import { buildNextConfig } from '../../apps/frontend/scripts/next-runtime-config.mjs';

describe('Next runtime routing configuration', () => {
  it('keeps canonical trailing-slash routes in the production static export', () => {
    expect(buildNextConfig({ NODE_ENV: 'production' }).trailingSlash).toBe(true);
  });

  it('does not redirect API paths during development before the Fastify proxy runs', () => {
    expect(buildNextConfig({ NODE_ENV: 'development' }).trailingSlash).toBe(false);
  });

  it('allows loopback and the exact forwarded Codespaces host in the Next dev server', () => {
    expect(buildNextConfig({
      NODE_ENV: 'development',
      CODESPACE_NAME: 'example',
      GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN: 'app.github.dev',
    }).allowedDevOrigins).toEqual(['127.0.0.1', 'example-3100.app.github.dev']);
  });

  it('does not enable development host exceptions in the production export', () => {
    expect(buildNextConfig({ NODE_ENV: 'production', CODESPACE_NAME: 'example', GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN: 'app.github.dev' })).not.toHaveProperty('allowedDevOrigins');
  });
});
