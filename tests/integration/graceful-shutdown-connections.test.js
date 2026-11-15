// OPS-15 FT-68: a REAL Fastify/Node HTTP server with real sockets. A client that sent only part of a request body
// keeps `app.close()` pending forever (Fastify's default only drops idle connections); the shutdown controller must
// finish within its grace period. No database is involved: the defect lives in the HTTP layer.
import Fastify from 'fastify';
import net from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { createGracefulShutdown } from '../../apps/api/src/graceful-shutdown.mjs';

const sockets = [];
afterEach(() => { for (const socket of sockets.splice(0)) socket.destroy(); });

async function startServer() {
  const app = Fastify({ logger: false });
  app.post('/x', async () => ({ ok: true }));
  app.get('/health', async () => ({ ok: true }));
  await app.listen({ host: '127.0.0.1', port: 0 });
  return app;
}

async function openRaw(app, text) {
  const socket = net.connect({ host: '127.0.0.1', port: app.server.address().port });
  socket.on('error', () => undefined);
  sockets.push(socket);
  await new Promise((resolve) => socket.once('connect', resolve));
  socket.write(text);
  await new Promise((resolve) => setTimeout(resolve, 100));
  return socket;
}

const withTimeout = (promise, ms) => Promise.race([promise, new Promise((_, reject) => setTimeout(() => reject(new Error('shutdown hung')), ms))]);

function controllerFor(app) {
  return createGracefulShutdown({
    stop: () => app.close(),
    closeIdleConnections: () => app.server.closeIdleConnections(),
    closeAllConnections: () => app.server.closeAllConnections(),
    exit: () => undefined, writeError: () => undefined,
    graceMs: 300, hardTimeoutMs: 5_000,
  });
}

describe('API shutdown against real sockets', () => {
  it('baseline: plain app.close() hangs while a request body is half-sent', async () => {
    const app = await startServer();
    await openRaw(app, 'POST /x HTTP/1.1\r\nHost: x\r\nContent-Type: application/json\r\nContent-Length: 100\r\n\r\nab');
    await expect(withTimeout(app.close(), 1_000)).rejects.toThrow('shutdown hung');
    app.server.closeAllConnections();
  });

  it.each([
    ['half-sent body', 'POST /x HTTP/1.1\r\nHost: x\r\nContent-Type: application/json\r\nContent-Length: 100\r\n\r\nab'],
    ['half-sent headers', 'GET /health HTTP/1.1\r\nHost: x\r\n'],
  ])('finishes within the grace period with a %s connection open', async (_label, request) => {
    const app = await startServer();
    await openRaw(app, request);
    const started = Date.now();
    await withTimeout(controllerFor(app).shutdown(), 3_000);
    expect(Date.now() - started).toBeLessThan(2_500);
    expect(app.server.listening).toBe(false);
  });

  it('closes an idle keep-alive connection immediately, without waiting for the grace period', async () => {
    const app = await startServer();
    await openRaw(app, 'GET /health HTTP/1.1\r\nHost: x\r\nConnection: keep-alive\r\n\r\n');
    const started = Date.now();
    await withTimeout(controllerFor(app).shutdown(), 3_000);
    expect(Date.now() - started).toBeLessThan(250);
  });
});
