import fastifyStatic from '@fastify/static';
import { resolve } from 'node:path';

/**
 * Register the local browser UI and its static assets.
 * @param {import('fastify').FastifyInstance} app
 * @param {string} webRoot
 * @param {string} [sharedBrowserRoot]
 * @param {{ apiOnly?: boolean, sharedPanelRoot?: string }} [options]
 *   `sharedPanelRoot` serves `apps/shared/panel` at `/shared/panel/` so the vanilla
 *   panel can load the modules it shares with Next (transitional; removed with the vanilla panel).
 */
export async function registerWebRoutes(app, webRoot, sharedBrowserRoot, { apiOnly = false, sharedPanelRoot } = {}) {
  if (apiOnly) return;

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
  if (sharedPanelRoot) {
    await app.register(fastifyStatic, {
      root: resolve(sharedPanelRoot),
      prefix: '/shared/panel/',
      decorateReply: false,
      maxAge: 0,
      immutable: false,
    });
  }
}
