#!/usr/bin/env node
import { resolve } from 'node:path';
import { validateVersionFiles } from '../src/version-files.mjs';

function parseRoot(args) {
  const index = args.indexOf('--root');
  if (index < 0) return process.cwd();
  const root = args[index + 1];
  if (!root || root.startsWith('--')) throw new Error('--root requires a directory path.');
  return resolve(root);
}

try {
  const result = await validateVersionFiles(parseRoot(process.argv.slice(2)));
  process.stdout.write(`Product version is valid: ${result.version}\n`);
} catch (error) {
  process.stderr.write(`Version validation failed: ${error.message}\n`);
  process.exitCode = 1;
}
