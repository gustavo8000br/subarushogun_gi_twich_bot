import Fastify from 'fastify';
import { describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { registerLocalSession } from '../../apps/api/src/http/local-session.mjs';
import { sessionActorId } from '../../apps/api/src/domain/session-actor.mjs';

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
    expect(cookie.secure).toBe(true);
    expect(csrf).toBeTypeOf('string');

    const denied = await app.inject({ method: 'POST', url: '/api/mutate', headers: { host: 'localhost:3000', cookie: `${cookie.name}=${cookie.value}` } });
    expect(denied.statusCode).toBe(403);
    const accepted = await app.inject({ method: 'POST', url: '/api/mutate', headers: {
      host: 'localhost:3000', origin: 'https://localhost:3000', cookie: `${cookie.name}=${cookie.value}`, 'x-csrf-token': csrf,
    } });
    expect(accepted.statusCode).toBe(200);
    await app.close();
  });

  it('rejects insecure local origins on the HTTPS panel', async () => {
    const app = Fastify();
    registerLocalSession(app);
    app.post('/api/mutate', async () => ({ ok: true }));
    const session = await app.inject({ method: 'GET', url: '/api/session', headers: { host: 'localhost:3000' } });
    const cookie = session.cookies[0];
    const response = await app.inject({ method: 'POST', url: '/api/mutate', headers: {
      host: 'localhost:3000', origin: 'http://localhost:3000', cookie: `${cookie.name}=${cookie.value}`,
      'x-csrf-token': session.json().csrfToken,
    } });
    expect(response.statusCode).toBe(403);
    await app.close();
  });

  it('marks an origin refusal with the closed code ORIGIN_NOT_ALLOWED (D-3) and nothing else with it', async () => {
    const app = Fastify();
    registerLocalSession(app);
    app.post('/api/mutate', async () => ({ ok: true }));
    const session = await app.inject({ method: 'GET', url: '/api/session', headers: { host: 'localhost:3000' } });
    const cookie = session.cookies[0];
    for (const origin of ['https://127.0.0.1:3001', 'not a url']) {
      const response = await app.inject({ method: 'POST', url: '/api/mutate', headers: {
        host: 'localhost:3000', origin, cookie: `${cookie.name}=${cookie.value}`, 'x-csrf-token': session.json().csrfToken,
      } });
      expect(response.statusCode).toBe(403);
      expect(response.json()).toEqual({ error: 'Origem inválida.', code: 'ORIGIN_NOT_ALLOWED' });
    }
    const csrf = await app.inject({ method: 'POST', url: '/api/mutate', headers: { host: 'localhost:3000', origin: 'https://localhost:3000', cookie: `${cookie.name}=${cookie.value}` } });
    expect(csrf.json().code).toBeUndefined();
    await app.close();
  });

  it('accepts only the exact explicitly configured loopback HTTP origin for local Next development', async () => {
    const app = Fastify();
    registerLocalSession(app, { developmentOrigin: 'http://localhost:3000', port: 3109 });
    app.post('/api/mutate', async () => ({ ok: true }));
    const session = await app.inject({ method: 'GET', url: '/api/session', headers: { host: 'localhost:3109' } });
    const cookie = session.cookies[0];
    const allowed = await app.inject({ method: 'POST', url: '/api/mutate', headers: {
      host: 'localhost:3109', origin: 'http://localhost:3000', cookie: `${cookie.name}=${cookie.value}`,
      'x-csrf-token': session.json().csrfToken,
    } });
    const otherPort = await app.inject({ method: 'POST', url: '/api/mutate', headers: {
      host: 'localhost:3109', origin: 'http://localhost:3001', cookie: `${cookie.name}=${cookie.value}`,
      'x-csrf-token': session.json().csrfToken,
    } });
    const remote = await app.inject({ method: 'POST', url: '/api/mutate', headers: {
      host: 'localhost:3109', origin: 'http://attacker.example:3000', cookie: `${cookie.name}=${cookie.value}`,
      'x-csrf-token': session.json().csrfToken,
    } });
    expect(allowed.statusCode).toBe(200);
    expect(otherPort.statusCode).toBe(403);
    expect(remote.statusCode).toBe(403);
    await app.close();
  });

  it('accepts the internal Fastify Host while validating mutations against the public Next origin', async () => {
    const app = Fastify();
    registerLocalSession(app, { port: 3000, backendPort: 3109 });
    app.post('/api/mutate', async () => ({ ok: true }));
    const session = await app.inject({ method: 'GET', url: '/api/session', headers: { host: 'localhost:3109' } });
    const cookie = session.cookies[0];
    const allowed = await app.inject({ method: 'POST', url: '/api/mutate', headers: {
      host: 'localhost:3109', origin: 'https://localhost:3000', cookie: `${cookie.name}=${cookie.value}`,
      'x-csrf-token': session.json().csrfToken,
    } });
    const wrongOrigin = await app.inject({ method: 'POST', url: '/api/mutate', headers: {
      host: 'localhost:3109', origin: 'https://localhost:3101', cookie: `${cookie.name}=${cookie.value}`,
      'x-csrf-token': session.json().csrfToken,
    } });
    expect(session.statusCode).toBe(200);
    expect(allowed.statusCode).toBe(200);
    expect(wrongOrigin.statusCode).toBe(403);
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
      host: 'localhost:3109', origin: 'https://attacker.example', cookie: `${cookie.name}=${cookie.value}`,
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

  it('OPS-31 X1 A0: exposes a derived, non-reversible actor id that is never the cookie value', async () => {
    const app = Fastify();
    registerLocalSession(app);
    app.get('/api/who', async (request) => ({ id: request.localSession.id, actorId: request.localSession.actorId }));
    const first = await app.inject({ method: 'GET', url: '/api/session', headers: { host: 'localhost:3000' } });
    const cookie = first.cookies[0];
    const headers = { host: 'localhost:3000', cookie: `${cookie.name}=${cookie.value}` };
    const who = (await app.inject({ method: 'GET', url: '/api/who', headers })).json();
    const expected = `panel_${createHash('sha256').update(`queuebot:panel-actor:v1:${cookie.value}`).digest('hex').slice(0, 16)}`;
    expect(who.id).toBe(cookie.value);
    expect(who.actorId).toBe(expected);
    expect(who.actorId).toMatch(/^panel_[0-9a-f]{16}$/);
    expect(who.actorId).not.toContain(cookie.value);
    expect(cookie.value).not.toContain(who.actorId.slice('panel_'.length));
    expect(sessionActorId(cookie.value)).toBe(expected);
    const other = await app.inject({ method: 'GET', url: '/api/session', headers: { host: 'localhost:3000' } });
    expect(sessionActorId(other.cookies[0].value)).not.toBe(expected);
    // The reference is not a usable credential: presenting it as the cookie opens no session.
    const forged = await app.inject({ method: 'GET', url: '/api/who', headers: { host: 'localhost:3000', cookie: `${cookie.name}=${who.actorId}` } });
    expect(forged.statusCode).toBe(401);
    expect(() => sessionActorId('')).toThrow(TypeError);
    await app.close();
  });
});
