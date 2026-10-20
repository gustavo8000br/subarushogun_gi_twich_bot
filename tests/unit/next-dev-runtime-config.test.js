import { describe, expect, it } from 'vitest';
import { resolve } from 'node:path';
import { buildDevRuntimeConfig } from '../../apps/frontend/scripts/dev-runtime-config.mjs';

describe('combined local development runtime config', () => {
  it('starts the API and Next on separate ports with local-only API binding and a same-origin proxy', () => {
    const config = buildDevRuntimeConfig({ DATABASE_URL: 'postgresql://dev:dev@127.0.0.1:5432/queuebot' }, '/repo');
    expect(config.api.args).toEqual(['--watch', 'apps/api/src/server.mjs']);
    expect(config.api.env.APP_HOST).toBe('127.0.0.1');
    expect(config.api.env.PUBLIC_BASE_URL).toBe('https://localhost:3000');
    expect(config.api.env.TLS_KEY_FILE).toBe(resolve('/repo', '.local', 'dev-tls', 'localhost.key'));
    expect(config.frontend.args[config.frontend.args.indexOf('--port') + 1]).toBe('3000');
    expect(config.frontend.args[config.frontend.args.indexOf('--hostname') + 1]).toBe('127.0.0.1');
    expect(config.api.env.APP_PORT).toBe('3109');
    expect(config.api.env.PANEL_DEV_ORIGIN).toBe('https://localhost:3000');
    expect(config.api.env.OVERLAY_PUBLIC_BASE_URL).toBe('https://localhost:3000');
    expect(config.frontend.env.FASTIFY_DEV_ORIGIN).toBe('https://localhost:3109');
    expect(config.frontend.args).toContain('--experimental-https-key');
    expect(config.frontend.args).toContain('--experimental-https');
    expect(config.frontend.args).toContain(resolve('/repo', '.local', 'dev-tls', 'localhost.key'));
    expect(config.frontend.args).toContain('--experimental-https-cert');
    expect(config.frontend.args).toContain(resolve('/repo', '.local', 'dev-tls', 'localhost.crt'));
  });

  it('allows explicit local ports, certificate paths, and an API origin', () => {
    const config = buildDevRuntimeConfig({
      DATABASE_URL: 'postgresql://dev:dev@127.0.0.1:5432/queuebot', APP_PORT: '3109', NEXT_DEV_PORT: '3101',
      TLS_KEY_FILE: '/tmp/api.key', TLS_CERT_FILE: '/tmp/api.crt', FASTIFY_DEV_ORIGIN: 'https://localhost:3109',
    }, '/repo');
    expect(config.api.env.APP_PORT).toBe('3109');
    expect(config.api.env.TLS_KEY_FILE).toBe('/tmp/api.key');
    expect(config.api.env.TLS_CERT_FILE).toBe('/tmp/api.crt');
    expect(config.frontend.args[config.frontend.args.indexOf('--port') + 1]).toBe('3101');
    expect(config.frontend.args[config.frontend.args.indexOf('--hostname') + 1]).toBe('127.0.0.1');
    expect(config.frontend.env.FASTIFY_DEV_ORIGIN).toBe('https://localhost:3109');
  });

  it('uses the isolated development database URL by default', () => {
    const config = buildDevRuntimeConfig({}, '/repo');
    expect(config.api.env.DATABASE_URL).toBe('postgresql://queuebot:dev-only@127.0.0.1:55432/queuebot?schema=public');
    expect(config.api.env.PRODUCT_LOCALE_PROJECTION_FILE).toBe(resolve('/repo', '.local', 'dev', 'product-locale.state'));
  });

  it('respects an explicit development product locale projection path', () => {
    const config = buildDevRuntimeConfig({ PRODUCT_LOCALE_PROJECTION_FILE: '/tmp/product-locale.state' }, '/repo');
    expect(config.api.env.PRODUCT_LOCALE_PROJECTION_FILE).toBe(resolve('/tmp', 'product-locale.state'));
  });

  it('allows an explicit external development database URL', () => {
    const config = buildDevRuntimeConfig({ DATABASE_URL: 'postgresql://dev:dev@127.0.0.1:5432/queuebot' }, '/repo');
    expect(config.api.env.DATABASE_URL).toBe('postgresql://dev:dev@127.0.0.1:5432/queuebot');
  });

  it('allows only the exact Codespaces forwarded panel origin in the local API session configuration', () => {
    const config = buildDevRuntimeConfig({
      DATABASE_URL: 'postgresql://dev:dev@127.0.0.1:5432/queuebot',
      CODESPACE_NAME: 'example',
      GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN: 'app.github.dev',
    }, '/repo');
    expect(config.api.env.PANEL_DEV_ORIGIN).toBe('https://example-3000.app.github.dev');
    expect(config.api.env.OVERLAY_PUBLIC_BASE_URL).toBeUndefined();
    expect(config.frontend.args[config.frontend.args.indexOf('--hostname') + 1]).toBe('0.0.0.0');
  });

  it('uses the configured local Next origin and port for the API session allowlist', () => {
    const config = buildDevRuntimeConfig({ NEXT_DEV_PORT: '3012' }, '/repo');
    expect(config.api.env.PANEL_DEV_ORIGIN).toBe('https://localhost:3012');
    expect(config.api.env.OVERLAY_PUBLIC_BASE_URL).toBe('https://localhost:3012');
  });
});
