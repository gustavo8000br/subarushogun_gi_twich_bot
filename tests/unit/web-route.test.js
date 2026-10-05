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
  it('serves the bundled pt-BR streamer operations panel from apps/web at the root path', async () => {
    const app = Fastify({ logger: false });
    applications.push(app);
    await registerWebRoutes(app, webRoot);

    const response = await app.inject({ method: 'GET', url: '/' });

    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toContain('text/html');
    expect(response.body).toContain('<html lang="pt-BR">');
    expect(response.body).toContain('Suas filas,');
    expect(response.body).toContain('Conectar canal');

    const stylesheet = await app.inject({ method: 'GET', url: '/styles.css' });
    expect(stylesheet.statusCode).toBe(200);
    expect(stylesheet.headers['content-type']).toContain('text/css');
    expect(stylesheet.body).toContain('.queue-card');
    expect(stylesheet.body).not.toMatch(/https?:\/\//i);

    const script = await app.inject({ method: 'GET', url: '/app.js' });
    expect(script.statusCode).toBe(200);
    expect(script.body).toContain('clear-preview');
    expect(script.body).toContain('clear-confirm');
    expect(script.body).toContain('/api/account/default');
    expect(script.body).toContain('/resolve-unknown');
    expect(script.body).toContain('twitchStatusLabel(setup)');
    expect(script.body).not.toContain('setup.status.toUpperCase()');
    expect(script.body).toContain('Twitch não confirmou');
    expect(script.body).toContain('reward-candidates');
    expect(script.body).toContain('resolve-reward');
    const page = await app.inject({ method: 'GET', url: '/' });
    expect(page.body).toContain('id="reward-dialog"');
    expect(script.body).toContain("from './application-setup.mjs'");
    const setupModule = await app.inject({ method: 'GET', url: '/application-setup.mjs' });
    expect(setupModule.statusCode).toBe(200);
    expect(setupModule.body).toContain("form.elements.namedItem('clientSecret')");
  });
});
