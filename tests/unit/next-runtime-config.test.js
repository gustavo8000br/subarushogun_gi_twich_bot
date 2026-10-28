import { describe, expect, it } from 'vitest';
import { buildNextConfig } from '../../apps/frontend/scripts/next-runtime-config.mjs';

describe('Next runtime routing configuration', () => {
  it('does not redirect proxied production health/API requests', () => {
    const config = buildNextConfig({ NODE_ENV: 'production' });
    expect(config.trailingSlash).toBe(false);
    expect(config.output).toBeUndefined();
    expect(config.rewrites).toBeTypeOf('function');
  });

  it('does not redirect API paths during development before the Fastify proxy runs', () => {
    expect(buildNextConfig({ NODE_ENV: 'development' }).trailingSlash).toBe(false);
  });

  it('allows loopback and the exact forwarded Codespaces host in the Next dev server', () => {
    expect(buildNextConfig({
      NODE_ENV: 'development',
      CODESPACE_NAME: 'example',
      GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN: 'app.github.dev',
    }).allowedDevOrigins).toEqual(['127.0.0.1', 'example-3000.app.github.dev']);
  });

  it('does not enable development host exceptions in the production server', () => {
    expect(buildNextConfig({ NODE_ENV: 'production', CODESPACE_NAME: 'example', GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN: 'app.github.dev' })).not.toHaveProperty('allowedDevOrigins');
  });

  it('proxies production API and overlay requests to the private Fastify listener', async () => {
    const rules = await buildNextConfig({ NODE_ENV: 'production', API_PORT: '3199' }).rewrites();
    expect(rules.beforeFiles).toEqual([
      { source: '/api/:path*', destination: 'https://localhost:3199/api/:path*' },
      { source: '/overlay/api/:path*', destination: 'https://localhost:3199/overlay/api/:path*' },
      { source: '/health', destination: 'https://localhost:3199/health' },
      { source: '/callback', destination: 'https://localhost:3199/callback' },
    ]);
    // OPS-15 cutover wave 1: Next serves `/` (the overview); only these four routes reach Fastify.
    expect(rules.beforeFiles.some(({ source }) => source === '/')).toBe(false);
    expect(rules.afterFiles).toEqual([{ source: '/overlay.html', destination: '/overlay' }]);
  });
});
