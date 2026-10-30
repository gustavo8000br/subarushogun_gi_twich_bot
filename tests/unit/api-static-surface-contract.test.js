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

// OPS-15 cutover wave 3: the vanilla overlay and every `/overlay.html` alias are retired
// (OW-09, no active users until rc). Next serves the overlay at `/overlay` and the widget
// link points there directly; no redirect, rewrite or static route keeps the old path.
describe('the /overlay.html alias is retired (OPS-15 cutover wave 3)', () => {
  it('does not register the development overlay redirect in the API process', () => {
    const server = readFileSync(join(apiSource, 'server.mjs'), 'utf8');
    expect(server).not.toMatch(/registerDevelopmentOverlayAlias/);
    expect(server).not.toMatch(/dev-overlay-alias\.mjs/);
    expect(existsSync(join(apiSource, 'http/dev-overlay-alias.mjs'))).toBe(false);
  });

  it('keeps no application module that serves, rewrites or emits the /overlay.html path', () => {
    const producers = ['apps/api/src', 'apps/frontend', 'apps/shared', 'apps/infra']
      .flatMap((directory) => listApplicationSources(join(root, directory)))
      .filter((path) => readFileSync(path, 'utf8').includes('overlay.html'))
      .map((path) => relative(root, path));
    expect(producers).toEqual([]);
  });
});

function listApplicationSources(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    if (['node_modules', '.next', 'out'].includes(entry.name)) return [];
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return listApplicationSources(path);
    return /\.(?:mjs|js|cjs|jsx|ts|mts|tsx|json|ya?ml|html)$/.test(entry.name) ? [path] : [];
  });
}
