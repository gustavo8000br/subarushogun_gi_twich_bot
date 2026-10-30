import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

export function resolveFastifyDevOrigin(env = process.env) {
  const port = env.APP_PORT ?? '3000';
  const rawOrigin = env.FASTIFY_DEV_ORIGIN ?? `https://localhost:${port}`;
  let target;
  try { target = new URL(rawOrigin); } catch { throw new TypeError('FASTIFY_DEV_ORIGIN must be a valid loopback URL.'); }
  if (!['http:', 'https:'].includes(target.protocol) || !LOOPBACK_HOSTS.has(target.hostname)
    || target.username || target.password || !['', '/'].includes(target.pathname)
    || target.search || target.hash || !target.port) {
    throw new TypeError('FASTIFY_DEV_ORIGIN must use a loopback host and explicit port.');
  }
  return target.origin;
}

export function buildDevProxyRules(env = process.env) {
  if (env.NODE_ENV !== 'development') return [];
  const origin = resolveFastifyDevOrigin(env);
  return [
    { source: '/api/:path*', destination: `${origin}/api/:path*` },
    { source: '/overlay/api/:path*', destination: `${origin}/overlay/api/:path*` },
    { source: '/health', destination: `${origin}/health` },
    { source: '/callback', destination: `${origin}/callback` },
  ];
}

export function buildProductionProxyRules(env = process.env) {
  const apiPort = env.API_PORT ?? '3109';
  const origin = env.FASTIFY_INTERNAL_ORIGIN ?? `https://localhost:${apiPort}`;
  let target;
  try { target = new URL(origin); } catch { throw new TypeError('FASTIFY_INTERNAL_ORIGIN must be a valid local HTTPS URL.'); }
  if (target.protocol !== 'https:' || !['localhost', '127.0.0.1'].includes(target.hostname)
    || target.username || target.password || !target.port || target.pathname !== '/' || target.search || target.hash) {
    throw new TypeError('FASTIFY_INTERNAL_ORIGIN must use HTTPS and a loopback host with an explicit port.');
  }
  return {
    beforeFiles: [
      { source: '/api/:path*', destination: `${target.origin}/api/:path*` },
      { source: '/overlay/api/:path*', destination: `${target.origin}/overlay/api/:path*` },
      { source: '/health', destination: `${target.origin}/health` },
      { source: '/callback', destination: `${target.origin}/callback` },
    ],
    afterFiles: [],
    fallback: [],
  };
}

export function trustLocalDevelopmentCa(env, repositoryRoot) {
  if (env.NODE_EXTRA_CA_CERTS) return env;
  const certDirectory = env.LOCAL_CERT_DIRECTORY ?? '.local';
  const caPath = resolve(repositoryRoot, certDirectory, 'localhost-ca.crt');
  if (existsSync(caPath)) env.NODE_EXTRA_CA_CERTS = caPath;
  return env;
}
