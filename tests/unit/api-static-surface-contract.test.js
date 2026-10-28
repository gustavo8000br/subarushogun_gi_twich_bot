import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = fileURLToPath(new URL('../../', import.meta.url));
const apiSource = join(root, 'apps/api/src');

function listModules(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return listModules(path);
    return /\.(?:mjs|js|cjs|ts|mts)$/.test(entry.name) ? [path] : [];
  });
}

// OPS-15 cutover wave 1: Next owns every panel document, so the API process must
// not serve browser files. Fastify answers only API, overlay API, health and callback.
describe('API process serves no browser files (OPS-15 cutover wave 1)', () => {
  it('does not register the vanilla static web routes in the server entrypoint', () => {
    const server = readFileSync(join(apiSource, 'server.mjs'), 'utf8');
    expect(server).not.toMatch(/registerWebRoutes/);
    expect(server).not.toMatch(/web-route\.mjs/);
    expect(server).not.toContain("new URL('../../web/', import.meta.url)");
    expect(server).not.toContain("new URL('../../shared/browser/', import.meta.url)");
    expect(server).not.toContain("new URL('../../shared/panel/', import.meta.url)");
    expect(existsSync(join(apiSource, 'web-route.mjs'))).toBe(false);
  });

  it('has no API module that imports a static file server', () => {
    const importers = listModules(apiSource)
      .filter((path) => /['"]@fastify\/static['"]/.test(readFileSync(path, 'utf8')))
      .map((path) => relative(root, path));
    expect(importers).toEqual([]);
  });
});
