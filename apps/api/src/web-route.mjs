import fastifyStatic from '@fastify/static';
import { resolve } from 'node:path';

/**
 * Register the local browser UI and its static assets.
 * @param {import('fastify').FastifyInstance} app
 * @param {string} webRoot
 * @param {string} [sharedBrowserRoot]
 */
export async function registerWebRoutes(app, webRoot, sharedBrowserRoot) {
  await app.register(fastifyStatic, {
    root: resolve(webRoot),
    prefix: '/',
    index: ['index.html'],
    maxAge: 0,
    immutable: false,
  });
  if (sharedBrowserRoot) {
    await app.register(fastifyStatic, {
      root: resolve(sharedBrowserRoot),
      prefix: '/shared/browser/',
      decorateReply: false,
      maxAge: 0,
      immutable: false,
    });
  }
}
