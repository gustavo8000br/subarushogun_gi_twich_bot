import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { buildDevProxyRules, buildProductionProxyRules, resolveFastifyDevOrigin, trustLocalDevelopmentCa } from '../../apps/frontend/scripts/dev-proxy-config.mjs';
import { buildNextConfig } from '../../apps/frontend/scripts/next-runtime-config.mjs';

let temporaryDirectory;
afterEach(async () => {
  if (temporaryDirectory) await rm(temporaryDirectory, { recursive: true, force: true });
  temporaryDirectory = undefined;
});

describe('Next local development API proxy', () => {
  it('proxies API, overlay API, health, callback, and the legacy overlay path only in development', () => {
    const rules = buildDevProxyRules({ NODE_ENV: 'development', FASTIFY_DEV_ORIGIN: 'https://localhost:3109' });
    expect(rules).toEqual([
      { source: '/api/:path*', destination: 'https://localhost:3109/api/:path*' },
      { source: '/overlay/api/:path*', destination: 'https://localhost:3109/overlay/api/:path*' },
      { source: '/health', destination: 'https://localhost:3109/health' },
      { source: '/callback', destination: 'https://localhost:3109/callback' },
      { source: '/overlay.html', destination: '/overlay' },
    ]);
    expect(buildDevProxyRules({ NODE_ENV: 'production', FASTIFY_DEV_ORIGIN: 'https://localhost:3109' })).toEqual([]);
  });

  it('defaults to loopback and rejects remote proxy targets', () => {
    expect(resolveFastifyDevOrigin({ APP_PORT: '3123' })).toBe('https://localhost:3123');
    expect(() => resolveFastifyDevOrigin({ FASTIFY_DEV_ORIGIN: 'https://example.com' })).toThrow('loopback');
  });

  it('routes production documents through Next and proxies operational endpoints to loopback Fastify', () => {
    expect(buildProductionProxyRules({ API_PORT: '3199' })).toEqual({
      beforeFiles: [
        { source: '/api/:path*', destination: 'https://localhost:3199/api/:path*' },
        { source: '/overlay/api/:path*', destination: 'https://localhost:3199/overlay/api/:path*' },
        { source: '/health', destination: 'https://localhost:3199/health' },
        { source: '/callback', destination: 'https://localhost:3199/callback' },
        ...['/', '/styles.css', '/app.js']
          .map((source) => ({ source, destination: `https://localhost:3199${source}` })),
      ], afterFiles: [{ source: '/overlay.html', destination: '/overlay' }], fallback: [],
    });
  });

  it('keeps the OAuth result page owned by Next in production while Fastify owns only the callback endpoint', async () => {
    const config = buildNextConfig({ NODE_ENV: 'production', API_PORT: '3199' });
    const rewrites = await config.rewrites();
    expect(rewrites.beforeFiles).toContainEqual({ source: '/callback', destination: 'https://localhost:3199/callback' });
    expect(rewrites).toEqual(buildProductionProxyRules({ NODE_ENV: 'production', API_PORT: '3199' }));
    expect(rewrites.beforeFiles.some(({ source }) => source === '/')).toBe(true);
  });

  it('rejects non-loopback or non-HTTPS production API proxy targets', () => {
    expect(() => buildProductionProxyRules({ FASTIFY_INTERNAL_ORIGIN: 'http://localhost:3109' })).toThrow('HTTPS');
    expect(() => buildProductionProxyRules({ FASTIFY_INTERNAL_ORIGIN: 'https://example.com:3109' })).toThrow('loopback');
  });

  it('adds the generated local CA to Node trust only when the certificate is present', async () => {
    temporaryDirectory = await mkdtemp(join(tmpdir(), 'next-dev-ca-'));
    await mkdir(join(temporaryDirectory, '.local'));
    await writeFile(join(temporaryDirectory, '.local', 'localhost-ca.crt'), 'test certificate');
    const env = {};
    trustLocalDevelopmentCa(env, temporaryDirectory);
    expect(env.NODE_EXTRA_CA_CERTS).toBe(join(temporaryDirectory, '.local', 'localhost-ca.crt'));
  });
});
