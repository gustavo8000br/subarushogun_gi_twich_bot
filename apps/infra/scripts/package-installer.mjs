import { chmod, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dump, load } from 'js-yaml';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const options = new Map();
for (let index = 2; index < process.argv.length; index += 2) {
  const name = process.argv[index];
  const value = process.argv[index + 1];
  if (!['--platform', '--output', '--image-tag', '--product-version'].includes(name)) {
    process.stderr.write(`Unknown argument: ${name}\n`);
    process.exit(2);
  }
  if (!value || value.startsWith('--')) {
    process.stderr.write(`${name} requires a value.\n`);
    process.exit(2);
  }
  options.set(name, value);
}
const platform = options.get('--platform');
const output = resolve(options.get('--output') ?? 'artifacts/installer');
const imageTag = options.get('--image-tag') ?? 'main';
const productVersion = options.get('--product-version') ?? imageTag.split('@', 1)[0];
const validImageTag = /^(main|v(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)-[0-9a-f]{7}-(?:alpha|beta|rc|stable))(?:@sha256:[0-9a-f]{64})?$/;
const validProductVersion = /^(main|v(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)-[0-9a-f]{7}-(?:alpha|beta|rc|stable))$/;
if (!['linux', 'macos', 'windows'].includes(platform)) {
  process.stderr.write('Usage: node apps/infra/scripts/package-installer.mjs --platform <linux|macos|windows> --output <directory> [--image-tag <main|materialized-version[@sha256:digest]>]\n');
  process.exit(2);
}
if (!validImageTag.test(imageTag)) {
  process.stderr.write('Invalid image reference; use main or a materialized version identity, optionally pinned by its SHA-256 digest.\n');
  process.exit(2);
}
if (!validProductVersion.test(productVersion) || (imageTag !== 'main' && productVersion !== imageTag.split('@', 1)[0])) {
  process.stderr.write('Invalid product version; it must match the version identity in the installer image reference.\n');
  process.exit(2);
}

/** @type {{services: Record<string, {build?: unknown, volumes?: Array<string | {source?: string}>}>}} */
const compose = /** @type {any} */ (load(await readFile(join(root, 'compose.yaml'), 'utf8')));
for (const service of Object.values(compose.services)) {
  delete service.build;
  service.volumes = (service.volumes ?? []).filter((volume) => {
    const source = typeof volume === 'string' ? volume.split(':', 1)[0] : volume.source ?? '';
    return !source.startsWith('./') && source !== 'package.json';
  });
}
const composeBase64 = Buffer.from(dump(compose, { lineWidth: -1 })).toString('base64');
await mkdir(output, { recursive: true });

let filename;
let artifact;
if (platform === 'windows') {
  filename = 'subarushogun_twich_bot_setup.bat';
  const source = await readFile(join(root, 'apps/infra/installer/installer.ps1'), 'utf8');
  const powershell = source.replace('__COMPOSE_B64__', composeBase64).replaceAll('__IMAGE_TAG__', imageTag).replaceAll('__PRODUCT_VERSION__', productVersion);
  const encoded = Buffer.from(powershell, 'utf16le').toString('base64').match(/.{1,76}/g).join('\r\n');
  artifact = [
    '@echo off',
    'setlocal',
    'goto :run',
    'rem One directly launchable Windows installer: Install / Start, Update, Uninstall.',
    'rem Update choices: Keep data and update; Erase data and install cleanly.',
    'rem Offers clean erase only after typed APAGAR, DELETE, or ELIMINAR confirmation.',
    'rem Docker and shared host dependencies remain installed after product removal.',
    'rem Preserves postgres_data and operational_secrets unless the operator confirms erasure.',
    ':payload',
    encoded,
    ':endpayload',
    ':run',
    'set "QUEUEBOT_INSTALLER_ARGS=%*"',
    `powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -Command "$raw=[IO.File]::ReadAllText('%~f0');$encoded=[regex]::Match($raw,'(?s):payload\\r?\\n(.*?)\\r?\\n:endpayload').Groups[1].Value -replace '\\s','';$code=[Text.Encoding]::Unicode.GetString([Convert]::FromBase64String($encoded));& ([ScriptBlock]::Create($code));exit $LASTEXITCODE"`,
    'exit /b %errorlevel%',
    '',
  ].join('\r\n');
} else {
  filename = platform === 'macos' ? 'subarushogun_twich_bot_setup.command' : 'subarushogun_twich_bot_setup.sh';
  const source = await readFile(join(root, 'apps/infra/installer/installer.sh'), 'utf8');
  artifact = source.replace('__COMPOSE_B64__', composeBase64).replaceAll('__IMAGE_TAG__', imageTag).replaceAll('__PRODUCT_VERSION__', productVersion);
}

const target = join(output, filename);
await writeFile(target, artifact, { mode: platform === 'windows' ? 0o644 : 0o755 });
if (platform !== 'windows') await chmod(target, 0o755);
process.stdout.write(`${target}\n`);
