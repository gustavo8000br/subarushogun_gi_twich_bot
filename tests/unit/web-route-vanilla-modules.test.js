import Fastify from 'fastify';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { registerWebRoutes } from '../../apps/api/src/web-route.mjs';

const webRoot = fileURLToPath(new URL('../../apps/web/', import.meta.url));
const sharedBrowserRoot = fileURLToPath(new URL('../../apps/shared/browser/', import.meta.url));
const sharedPanelRoot = fileURLToPath(new URL('../../apps/shared/panel/', import.meta.url));
const staticImportPattern = /^\s*(?:import|export)\b[^'"]*?\bfrom\s*['"]([^'"]+)['"]|^\s*import\s+['"]([^'"]+)['"]/gm;

let app;

beforeAll(async () => {
  app = Fastify({ logger: false });
  await registerWebRoutes(app, webRoot, sharedBrowserRoot, { sharedPanelRoot });
});

afterAll(async () => {
  await app.close();
});

/** Follow every static import the browser would request, starting at the vanilla entrypoints. */
async function crawl(entrypoints) {
  const results = new Map();
  const queue = [...entrypoints];
  while (queue.length > 0) {
    const path = queue.shift();
    if (results.has(path)) continue;
    const response = await app.inject({ method: 'GET', url: path });
    results.set(path, { status: response.statusCode, type: response.headers['content-type'] ?? '' });
    if (response.statusCode !== 200) continue;
    for (const match of response.body.matchAll(staticImportPattern)) {
      const specifier = match[1] ?? match[2];
      queue.push(new URL(specifier, `https://panel.local${path}`).pathname);
    }
  }
  return results;
}

describe('vanilla panel module graph served by Fastify (OPS-15 S-03)', () => {
  it('serves every module transitively imported by app.js and overlay.js as JavaScript', async () => {
    const results = await crawl(['/app.js', '/overlay.js']);
    const paths = [...results.keys()];
    expect(paths).toContain('/shared/panel/panel-navigation.mjs');
    expect(paths).toContain('/shared/panel/overlay-renderer.mjs');
    expect(paths).toContain('/shared/browser/translate-catalog.mjs');
    expect(paths.length).toBeGreaterThan(20);
    const broken = [...results]
      .filter(([, { status, type }]) => status !== 200 || !type.includes('javascript'))
      .map(([path, { status, type }]) => `${path} ${status} ${type}`);
    expect(broken).toEqual([]);
  });

  it('returns 404 for a module that does not exist under each module prefix', async () => {
    for (const url of ['/shared/panel/missing-module.mjs', '/shared/browser/missing-module.mjs', '/missing-module.mjs']) {
      const response = await app.inject({ method: 'GET', url });
      expect(response.statusCode, url).toBe(404);
    }
  });
});
