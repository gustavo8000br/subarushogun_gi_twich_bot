const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

/** Keep development capability URLs issued before the panel and API origins were separated working. */
export function registerDevelopmentOverlayAlias(app, { origin }) {
  const target = new URL(origin);
  if (target.protocol !== 'https:' || !LOOPBACK_HOSTS.has(target.hostname)
    || target.username || target.password || target.pathname !== '/' || target.search || target.hash) {
    throw new TypeError('Development overlay origin must be an HTTPS loopback origin.');
  }

  app.get('/overlay.html', async (request, reply) => {
    const parameters = new URL(request.url, target).searchParams;
    const reference = parameters.get('ref');
    if (parameters.size !== 1 || !/^[A-Za-z0-9_-]{22}$/.test(reference ?? '')) {
      return reply.code(404).send({ message: 'Not Found', error: 'Not Found', statusCode: 404 });
    }
    return reply.code(307).header('location', `${target.origin}/overlay.html?ref=${encodeURIComponent(reference)}`).send();
  });
}
