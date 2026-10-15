import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import Fastify from 'fastify';
import { registerWebRoutes } from '../../apps/api/src/web-route.mjs';

const execFileAsync = promisify(execFile);
const repositoryRoot = fileURLToPath(new URL('../../', import.meta.url));
const frontendRoot = join(repositoryRoot, 'apps/frontend');

describe('Next.js static frontend foundation', () => {
  it('builds panel and isolated overlay documents as a static export with the legacy URL alias', async () => {
    const packageJson = JSON.parse(await readFile(join(repositoryRoot, 'package.json'), 'utf8'));
    expect(packageJson.dependencies.next).toBeTruthy();
    expect(packageJson.dependencies.react).toBeTruthy();
    expect(packageJson.dependencies['react-dom']).toBeTruthy();
    expect(packageJson.scripts['build:frontend']).toBeTruthy();

    await execFileAsync('npm', ['run', 'build:frontend'], { cwd: repositoryRoot });

    const outputRoot = join(frontendRoot, 'out');
    const panelHtml = await readFile(join(outputRoot, 'index.html'), 'utf8');
    const newQueueHtml = await readFile(join(outputRoot, 'new-queue', 'index.html'), 'utf8');
    const operationsHtml = await readFile(join(outputRoot, 'operations', 'index.html'), 'utf8');
    const connectionHtml = await readFile(join(outputRoot, 'connection', 'index.html'), 'utf8');
    const overlayHtml = await readFile(join(outputRoot, 'overlay', 'index.html'), 'utf8');
    const overlayAlias = await readFile(join(outputRoot, 'overlay.html'), 'utf8');

    expect(overlayAlias).toBe(overlayHtml);
    expect(panelHtml).toContain('data-next-panel-entry');
    expect(newQueueHtml).toContain('data-next-panel-entry');
    expect(newQueueHtml).toContain('Criar fila');
    expect(operationsHtml).toContain('data-next-panel-entry');
    expect(connectionHtml).toContain('data-next-panel-entry');
    expect(overlayHtml).toContain('data-next-overlay-entry');
    expect(overlayHtml).not.toContain('data-next-panel-entry');

    const panelScripts = [...panelHtml.matchAll(/<script[^>]+src="([^"]+)"/g)].map((match) => match[1]);
    const overlayScripts = [...overlayHtml.matchAll(/<script[^>]+src="([^"]+)"/g)].map((match) => match[1]);
    expect(panelScripts.length).toBeGreaterThan(0);
    expect(overlayScripts.length).toBeGreaterThan(0);
    expect(overlayScripts).not.toEqual(panelScripts);
    expect(overlayScripts.every((asset) => asset.startsWith('/_next/'))).toBe(true);

    const panelEntryBundle = await findScriptContaining(outputRoot, panelScripts, 'panel-sidebar');
    const overlayEntryBundle = await findScriptContaining(outputRoot, overlayScripts, 'overlay-widget');
    expect(panelEntryBundle).toBeTruthy();
    expect(overlayEntryBundle).toBeTruthy();
    expect(overlayScripts).not.toContain(panelEntryBundle);
    expect(panelScripts).not.toContain(overlayEntryBundle);

    const app = Fastify({ logger: false });
    app.get('/callback', async () => ({ route: 'oauth-callback' }));
    app.get('/api/route-contract', async () => ({ route: 'api' }));
    app.get('/health', async () => ({ route: 'health' }));
    app.get('/overlay/api/route-contract', async () => ({ route: 'overlay-api' }));
    await registerWebRoutes(app, outputRoot);

    try {
      const panel = await app.inject({ method: 'GET', url: '/' });
      const overlay = await app.inject({ method: 'GET', url: '/overlay/' });
      const operations = await app.inject({ method: 'GET', url: '/operations/' });
      const connection = await app.inject({ method: 'GET', url: '/connection/' });
      const legacyOverlay = await app.inject({ method: 'GET', url: '/overlay.html?ref=browser-source#capability' });
      expect(panel.statusCode).toBe(200);
      expect(panel.body).toContain('data-next-panel-entry');
      expect(overlay.statusCode).toBe(200);
      expect(operations.statusCode).toBe(200);
      expect(operations.body).toContain('data-next-panel-entry');
      expect(connection.statusCode).toBe(200);
      expect(connection.body).toContain('data-next-panel-entry');
      expect(overlay.body).toContain('data-next-overlay-entry');
      expect(legacyOverlay.statusCode).toBe(200);
      expect(legacyOverlay.headers.location).toBeUndefined();
      expect(legacyOverlay.body).toBe(overlayHtml);

      const routeContracts = new Map([
        ['/callback', 'oauth-callback'],
        ['/api/route-contract', 'api'],
        ['/health', 'health'],
        ['/overlay/api/route-contract', 'overlay-api'],
      ]);
      for (const [route, expectedRoute] of routeContracts) {
        const response = await app.inject({ method: 'GET', url: route });
        expect(response.statusCode, route).toBe(200);
        expect(JSON.parse(response.body).route, route).toBe(expectedRoute);
      }

      for (const asset of overlayScripts) {
        const response = await app.inject({ method: 'GET', url: asset });
        expect(response.statusCode, asset).toBe(200);
        expect(response.headers['content-type']).toContain('javascript');
      }
    } finally {
      await app.close();
    }
  }, 120_000);
});

async function findScriptContaining(outputRoot, scripts, marker) {
  for (const script of scripts) {
    const filePath = join(outputRoot, script.replace(/^\//, ''));
    const contents = await readFile(filePath, 'utf8');
    if (contents.includes(marker)) return script;
  }
  return undefined;
}
