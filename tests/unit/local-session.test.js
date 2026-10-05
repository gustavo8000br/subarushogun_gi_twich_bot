import Fastify from 'fastify';
import { describe, expect, it, vi } from 'vitest';
import { registerLocalSession } from '../../apps/api/src/http/local-session.mjs';

describe('local panel session and CSRF protection', () => {
  it('establishes a local session and requires its CSRF token for mutations', async () => {
    const app = Fastify();
    registerLocalSession(app, { randomBytes: vi.fn(() => Buffer.alloc(32, 7)) });
    app.post('/api/mutate', async (request) => ({ sessionId: request.localSession.id }));

    const state = await app.inject({ method: 'GET', url: '/api/session', headers: { host: 'localhost:3000' } });
    expect(state.statusCode).toBe(200);
    const cookie = state.cookies[0];
    const csrf = state.json().csrfToken;
    expect(cookie.httpOnly).toBe(true);
    expect(cookie.sameSite).toBe('Lax');
    expect(csrf).toBeTypeOf('string');

    const denied = await app.inject({ method: 'POST', url: '/api/mutate', headers: { host: 'localhost:3000', cookie: `${cookie.name}=${cookie.value}` } });
    expect(denied.statusCode).toBe(403);
    const accepted = await app.inject({ method: 'POST', url: '/api/mutate', headers: {
      host: 'localhost:3000', origin: 'http://localhost:3000', cookie: `${cookie.name}=${cookie.value}`, 'x-csrf-token': csrf,
    } });
    expect(accepted.statusCode).toBe(200);
    await app.close();
  });

  it('rejects foreign Host and Origin values without reflecting them', async () => {
    const app = Fastify();
    registerLocalSession(app);
    const foreignHost = await app.inject({ method: 'GET', url: '/api/session', headers: { host: 'attacker.example' } });
    expect(foreignHost.statusCode).toBe(403);
    const session = await app.inject({ method: 'GET', url: '/api/session', headers: { host: 'localhost:3000' } });
    const cookie = session.cookies[0];
    const foreignOrigin = await app.inject({ method: 'POST', url: '/api/mutate', headers: {
      host: 'localhost:3000', origin: 'https://attacker.example', cookie: `${cookie.name}=${cookie.value}`,
      'x-csrf-token': session.json().csrfToken,
    } });
    expect(foreignOrigin.statusCode).toBe(403);
    expect(foreignOrigin.body).not.toContain('attacker.example');
    await app.close();
  });

  it('requires a local session for administrative GET projections while keeping health reachable', async () => {
    const app = Fastify();
    registerLocalSession(app);
    app.get('/api/state', async () => ({ private: true }));
    app.get('/health', async () => ({ status: 'ok' }));
    const state = await app.inject({ method: 'GET', url: '/api/state', headers: { host: 'localhost:3000' } });
    expect(state.statusCode).toBe(401);
    expect(state.body).not.toContain('private');
    const health = await app.inject({ method: 'GET', url: '/health', headers: { host: 'localhost:3000' } });
    expect(health.statusCode).toBe(200);
    await app.close();
  });
});
