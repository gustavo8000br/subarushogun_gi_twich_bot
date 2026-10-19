import Fastify from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { registerDevelopmentOverlayAlias } from '../../apps/api/src/http/dev-overlay-alias.mjs';

const apps = [];

async function createApp(origin = 'https://localhost:3000') {
  const app = Fastify({ logger: false });
  apps.push(app);
  registerDevelopmentOverlayAlias(app, { origin });
  await app.ready();
  return app;
}

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

describe('development overlay URL compatibility', () => {
  it('redirects an older API-origin URL to the HTTPS Next origin without putting the capability in Location', async () => {
    const app = await createApp();
    const response = await app.inject({ method: 'GET', url: `/overlay.html?ref=${'a'.repeat(22)}` });

    expect(response.statusCode).toBe(307);
    expect(response.headers.location).toBe(`https://localhost:3000/overlay.html?ref=${'a'.repeat(22)}`);
    expect(response.headers.location).not.toContain('#');
  });

  it('rejects malformed or unexpected query parameters', async () => {
    const app = await createApp();
    const invalidReference = await app.inject({ method: 'GET', url: '/overlay.html?ref=short' });
    const unexpectedParameter = await app.inject({ method: 'GET', url: `/overlay.html?ref=${'b'.repeat(22)}&other=value` });

    expect(invalidReference.statusCode).toBe(404);
    expect(unexpectedParameter.statusCode).toBe(404);
  });

  it('accepts only a loopback HTTPS overlay origin', async () => {
    expect(() => registerDevelopmentOverlayAlias(Fastify(), { origin: 'http://localhost:3000' }))
      .toThrow(/HTTPS loopback/);
    expect(() => registerDevelopmentOverlayAlias(Fastify(), { origin: 'https://example.com' }))
      .toThrow(/HTTPS loopback/);
  });
});
