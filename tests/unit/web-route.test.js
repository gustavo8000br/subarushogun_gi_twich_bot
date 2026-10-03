import Fastify from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { registerWebRoutes } from '../../apps/api/src/web-route.mjs';

const webRoot = fileURLToPath(new URL('../../apps/web/', import.meta.url));
const applications = [];

afterEach(async () => {
  await Promise.all(applications.splice(0).map((app) => app.close()));
});

describe('local web entrypoint', () => {
  it('serves the bundled pt-BR installation placeholder from apps/web at the root path', async () => {
    const app = Fastify({ logger: false });
    applications.push(app);
    await registerWebRoutes(app, webRoot);

    const response = await app.inject({ method: 'GET', url: '/' });

    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toContain('text/html');
    expect(response.body).toContain('<html lang="pt-BR">');
    expect(response.body).toContain('Assistente de instalação em implementação.');

    const stylesheet = await app.inject({ method: 'GET', url: '/styles.css' });
    expect(stylesheet.statusCode).toBe(200);
    expect(stylesheet.headers['content-type']).toContain('text/css');
    expect(stylesheet.body).toContain('.status-card');
  });
});
