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
  it('proxies API, overlay API, health and callback only in development, with no /overlay.html alias (OPS-15 cutover wave 3)', () => {
    const rules = buildDevProxyRules({ NODE_ENV: 'development', FASTIFY_DEV_ORIGIN: 'https://localhost:3109' });
    expect(rules).toEqual([
      { source: '/api/:path*', destination: 'https://localhost:3109/api/:path*' },
      { source: '/overlay/api/:path*', destination: 'https://localhost:3109/overlay/api/:path*' },
      { source: '/health', destination: 'https://localhost:3109/health' },
      { source: '/callback', destination: 'https://localhost:3109/callback' },
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
      ], afterFiles: [], fallback: [],
    });
  });

  it('never rewrites the panel root or a vanilla panel asset to Fastify (OPS-15 cutover wave 1, S-02)', () => {
    const rules = buildProductionProxyRules({ API_PORT: '3199' });
    const proxied = [...rules.beforeFiles, ...rules.afterFiles, ...rules.fallback];
    const vanillaSources = ['/', '/index.html', '/styles.css', '/app.js', '/overlay.html', '/overlay.js', '/overlay.css'];
    expect(proxied.filter(({ source }) => vanillaSources.includes(source))).toEqual([]);
    expect(proxied.filter(({ source }) => source.startsWith('/shared/'))).toEqual([]);
    const fastifyTargets = proxied
      .filter(({ destination }) => destination.startsWith('https://localhost:3199'))
      .map(({ source }) => source);
    expect(fastifyTargets).toEqual(['/api/:path*', '/overlay/api/:path*', '/health', '/callback']);
    // OPS-15 cutover wave 3: the /overlay.html alias is retired; Next serves /overlay directly.
    expect(rules.afterFiles).toEqual([]);
  });

  it('keeps no /overlay.html alias in any development or production rule (OPS-15 cutover wave 3)', async () => {
    const development = buildDevProxyRules({ NODE_ENV: 'development', FASTIFY_DEV_ORIGIN: 'https://localhost:3109' });
    const production = await buildNextConfig({ NODE_ENV: 'production', API_PORT: '3199' }).rewrites();
    const all = [...development, ...production.beforeFiles, ...production.afterFiles, ...production.fallback];
    expect(all.filter(({ source, destination }) => source.includes('overlay.html') || destination.includes('overlay.html'))).toEqual([]);
    expect(all.filter(({ destination }) => destination === '/overlay')).toEqual([]);
  });

  it('keeps the OAuth result page owned by Next in production while Fastify owns only the callback endpoint', async () => {
    const config = buildNextConfig({ NODE_ENV: 'production', API_PORT: '3199' });
    const rewrites = await config.rewrites();
    expect(rewrites.beforeFiles).toContainEqual({ source: '/callback', destination: 'https://localhost:3199/callback' });
    expect(rewrites).toEqual(buildProductionProxyRules({ NODE_ENV: 'production', API_PORT: '3199' }));
    expect(rewrites.beforeFiles.some(({ source }) => source === '/')).toBe(false);
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
