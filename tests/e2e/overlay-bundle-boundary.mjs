import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import vm from 'node:vm';

const frontendRoot = resolve(process.env.FRONTEND_BUILD_DIRECTORY ?? 'apps/frontend');
const buildRoot = resolve(frontendRoot, '.next');

async function readRouteManifest(relativePath, routeKey) {
  const filename = resolve(buildRoot, 'server/app', relativePath, 'page_client-reference-manifest.js');
  const context = { globalThis: {} };
  vm.runInNewContext(await readFile(filename, 'utf8'), context, { filename });
  const manifest = context.globalThis.__RSC_MANIFEST?.[routeKey];
  assert.ok(manifest, `Next client-reference manifest must contain ${routeKey}`);
  const entryKey = Object.keys(manifest.entryJSFiles ?? {}).find((key) => key.endsWith(routeKey.replace('/(overlay)', '/(overlay)').replace('/(panel)', '/(panel)')));
  assert.ok(entryKey, `Next manifest must expose client entry files for ${routeKey}`);
  return new Set(manifest.entryJSFiles[entryKey].map((file) => file.replace(/^\//, '')));
}

const overlayFiles = await readRouteManifest('(overlay)/overlay', '/(overlay)/overlay/page');
const panelFiles = await readRouteManifest('(panel)/queues', '/(panel)/queues/page');
assert.ok(overlayFiles.size > 0, 'overlay entry must have a browser bundle');
assert.ok(panelFiles.size > 0, 'panel queue entry must have a browser bundle');

const panelOnlyFiles = [...panelFiles].filter((file) => !overlayFiles.has(file));
assert.ok(panelOnlyFiles.length > 0, 'panel route must have route-specific chunks');
for (const file of panelOnlyFiles) {
  assert.ok(!overlayFiles.has(file), `overlay client entry must not include panel chunk ${file}`);
}

console.log(`PASS Next bundle boundary: overlay entry has ${overlayFiles.size} chunk(s); panel entry has ${panelFiles.size}; ${panelOnlyFiles.length} panel-only chunk(s) excluded.`);
