import { randomBytes as generateRandomBytes, timingSafeEqual } from 'node:crypto';

/** @typedef {import('fastify').FastifyRequest & {localSession?: {id: string, csrfToken: string}}} LocalRequest */

const cookieName = 'queuebot_session';
const sessions = new Map();
const localHosts = new Set(['localhost', '127.0.0.1', '[::1]']);

function parseCookies(header = '') {
  return Object.fromEntries(header.split(';').map((part) => part.trim().split(/=(.*)/s).slice(0, 2)).filter(([key, value]) => key && value));
}

function safeEqual(left, right) {
  if (typeof left !== 'string' || typeof right !== 'string') return false;
  const first = Buffer.from(left);
  const second = Buffer.from(right);
  return first.length === second.length && timingSafeEqual(first, second);
}

/** @param {import('fastify').FastifyInstance} app @param {{randomBytes?: (size: number) => Buffer, port?: number, secure?: boolean}} options */
export function registerLocalSession(app, { randomBytes = generateRandomBytes, port = Number(process.env.APP_PORT ?? 3000), secure = true } = {}) {
  const expectedAuthority = new Set([`localhost:${port}`, `127.0.0.1:${port}`, `[::1]:${port}`]);
  app.addHook('onRequest', async (request, reply) => {
    /** @type {LocalRequest} */
    const localRequest = request;
    const host = request.headers.host;
    if (typeof host !== 'string' || (!expectedAuthority.has(host) && !(port === 80 && localHosts.has(host)))) {
      return reply.code(403).send({ error: 'Acesso local inválido.' });
    }
    const origin = request.headers.origin;
    if (origin) {
      let originUrl;
      try { originUrl = new URL(origin); } catch { return reply.code(403).send({ error: 'Origem inválida.' }); }
      if (originUrl.protocol !== 'https:' || !localHosts.has(originUrl.hostname) || originUrl.port !== String(port)) {
        return reply.code(403).send({ error: 'Origem inválida.' });
      }
    }
    const id = parseCookies(request.headers.cookie)[cookieName];
    const session = id ? sessions.get(id) : null;
    if (session) localRequest.localSession = { id, csrfToken: session.csrfToken };
    if (request.url.startsWith('/api/') && request.url !== '/api/session' && !session) {
      return reply.code(401).send({ error: 'Abra o painel local para iniciar uma sessão.' });
    }
    if (request.method !== 'GET' && request.method !== 'HEAD' && request.url !== '/callback') {
      const csrf = request.headers['x-csrf-token'];
      if (!session || !safeEqual(csrf, session.csrfToken)) return reply.code(403).send({ error: 'Sessão ou proteção CSRF inválida.' });
    }
  });
  app.decorateRequest('localSession', null);
  app.get('/api/session', async (request, reply) => {
    /** @type {LocalRequest} */
    const localRequest = request;
    let session = localRequest.localSession;
    if (!session) {
      const id = randomBytes(32).toString('hex');
      session = { id, csrfToken: randomBytes(32).toString('hex') };
      sessions.set(id, session);
      reply.header('set-cookie', `${cookieName}=${id}; Path=/; HttpOnly; SameSite=Lax${secure ? '; Secure' : ''}`);
      localRequest.localSession = session;
    }
    return { csrfToken: session.csrfToken };
  });
}

export function clearLocalSessionsForTests() { sessions.clear(); }
