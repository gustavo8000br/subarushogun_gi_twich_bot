import { copyFile, mkdir, stat } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const outputRoot = resolve(scriptDirectory, '../out');
const overlayDocument = resolve(outputRoot, 'overlay/index.html');
const legacyOverlayUrlDocument = resolve(outputRoot, 'overlay.html');

await stat(overlayDocument);
await mkdir(outputRoot, { recursive: true });
await copyFile(overlayDocument, legacyOverlayUrlDocument);
