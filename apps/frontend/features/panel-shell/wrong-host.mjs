// LA-17 (FT-67): the panel session only works at the "localhost" origin. When the page is opened by a loopback
// IP literal, a failed load is explained with a link to the right address instead of the generic "check the service".
const LOOPBACK_IP_HOSTS = new Set(['127.0.0.1', '[::1]', '::1']);

/**
 * @param {{ hostname?: string, port?: string, pathname?: string } | null | undefined} location
 * @returns {{ host: string, url: string } | null}
 */
export function wrongHostForPanel(location = globalThis.location) {
  const host = typeof location?.hostname === 'string' ? location.hostname : '';
  if (!LOOPBACK_IP_HOSTS.has(host)) return null;
  const port = location?.port ? `:${location.port}` : '';
  const pathname = typeof location?.pathname === 'string' && location.pathname.startsWith('/') ? location.pathname : '/';
  // No query string and no hash: one-time outcome parameters are never copied into the suggested address.
  return { host, url: `https://localhost${port}${pathname}` };
}
