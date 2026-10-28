import { execFile } from 'node:child_process';
import { readFile, stat } from 'node:fs/promises';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const execFileAsync = promisify(execFile);
const repositoryRoot = fileURLToPath(new URL('../../', import.meta.url));
const frontendRoot = join(repositoryRoot, 'apps/frontend');

describe('Next.js production overlay server build', () => {
  it('builds a runtime-served overlay and production Fastify proxy routes', async () => {
    const packageJson = JSON.parse(await readFile(join(repositoryRoot, 'package.json'), 'utf8'));
    expect(packageJson.dependencies.next).toBeTruthy();
    expect(packageJson.scripts['build:frontend']).toBe('next build apps/frontend');

    await execFileAsync(process.execPath, ['node_modules/next/dist/bin/next', 'build', 'apps/frontend'], { cwd: repositoryRoot });

    const outputRoot = join(frontendRoot, '.next');
    await expect(stat(join(outputRoot, 'BUILD_ID'))).resolves.toBeTruthy();
    const appPaths = JSON.parse(await readFile(join(outputRoot, 'server/app-paths-manifest.json'), 'utf8'));
    expect(Object.keys(appPaths)).toContain('/(overlay)/overlay/page');
    expect(Object.keys(appPaths)).toContain('/(panel)/page');

    const routes = JSON.parse(await readFile(join(outputRoot, 'routes-manifest.json'), 'utf8'));
    expect(routes.rewrites.beforeFiles).toContainEqual(expect.objectContaining({
      source: '/api/:path*', destination: 'https://localhost:3109/api/:path*',
    }));
    // OPS-15 cutover wave 1: the Next overview owns `/`; no vanilla document or asset is proxied.
    expect(routes.rewrites.beforeFiles.filter(({ source }) => ['/', '/styles.css', '/app.js'].includes(source))).toEqual([]);
    // OPS-15 cutover wave 3: the /overlay.html alias is retired; the built Next app serves /overlay itself.
    const allRewrites = [...routes.rewrites.beforeFiles, ...routes.rewrites.afterFiles, ...routes.rewrites.fallback];
    expect(allRewrites.filter(({ source }) => source.includes('overlay.html'))).toEqual([]);
  }, 120_000);
});
