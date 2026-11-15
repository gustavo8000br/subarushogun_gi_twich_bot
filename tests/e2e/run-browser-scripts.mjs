import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { request } from 'node:https';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ensureLocalTlsCertificate } from '../../apps/infra/src/bootstrap-secret.mjs';

// Runs every script listed in browser-only-manifest.json against a disposable Next dev server (HTTPS, loopback only).
// The scripts intercept every API response with fixtures: no PostgreSQL, Docker, Twitch, OBS or secrets are involved.
// Usage: node tests/e2e/run-browser-scripts.mjs [--only <substring>]
// Optional BROWSER_ONLY_NEXT_ARGS (space-separated) is appended to `next dev`, e.g. `--webpack` in a worktree whose node_modules is a symlink.
const root = resolve(fileURLToPath(new URL('../../', import.meta.url)));
const manifest = JSON.parse(readFileSync(resolve(root, 'tests/e2e/browser-only-manifest.json'), 'utf8'));
const onlyIndex = process.argv.indexOf('--only');
const only = onlyIndex > 0 ? process.argv[onlyIndex + 1] : undefined;
const scripts = manifest.covered.filter((entry) => !only || entry.file.includes(only));
if (scripts.length === 0) throw new Error('No browser-only script selected.');

const port = process.env.NEXT_DEV_PORT ?? '3000';
const origin = `https://localhost:${port}`;
const tlsDirectory = resolve(root, '.local/browser-only-ci/tls');
await ensureLocalTlsCertificate({ directory: tlsDirectory, exportDirectory: tlsDirectory });

const server = spawn(process.execPath, [
  resolve(root, 'node_modules/next/dist/bin/next'), 'dev', 'apps/frontend', '--hostname', '127.0.0.1', '--port', port,
  '--experimental-https', '--experimental-https-key', resolve(tlsDirectory, 'localhost.key'),
  '--experimental-https-cert', resolve(tlsDirectory, 'localhost.crt'), '--experimental-https-ca', resolve(tlsDirectory, 'localhost-ca.crt'),
  ...(process.env.BROWSER_ONLY_NEXT_ARGS ? process.env.BROWSER_ONLY_NEXT_ARGS.split(' ').filter(Boolean) : []),
], {
  cwd: root,
  env: { ...process.env, NODE_ENV: 'development', NEXT_DEV_PORT: port, FASTIFY_DEV_ORIGIN: 'https://localhost:3109', NEXT_TELEMETRY_DISABLED: '1' },
  stdio: ['ignore', 'inherit', 'inherit'],
});
let serverExited = false;
server.on('exit', () => { serverExited = true; });

function probe() {
  return new Promise((done) => {
    const req = request(`${origin}/`, { rejectUnauthorized: false, timeout: 5000 }, (res) => { res.resume(); done(true); });
    req.on('error', () => done(false));
    req.on('timeout', () => { req.destroy(); done(false); });
    req.end();
  });
}

function runScript(file) {
  return new Promise((done) => {
    const child = spawn(process.execPath, [resolve(root, 'tests/e2e', file)], {
      cwd: root, env: { ...process.env, APP_ORIGIN: origin }, stdio: 'inherit',
    });
    child.on('exit', (code) => done(code ?? 1));
    child.on('error', () => done(1));
  });
}

const results = [];
try {
  const deadline = Date.now() + 180_000;
  while (!(await probe())) {
    if (serverExited || Date.now() > deadline) throw new Error('The Next dev server did not become ready.');
    await new Promise((wait) => setTimeout(wait, 1000));
  }
  for (const entry of scripts) {
    process.stdout.write(`\n=== ${entry.file} ===\n`);
    results.push({ file: entry.file, code: await runScript(entry.file) });
  }
} finally {
  if (!serverExited) server.kill('SIGTERM');
}

process.stdout.write('\nBrowser-only summary\n');
for (const { file, code } of results) process.stdout.write(`${code === 0 ? 'PASS' : 'FAIL'}  ${file}\n`);
process.exitCode = results.length === scripts.length && results.every(({ code }) => code === 0) ? 0 : 1;
