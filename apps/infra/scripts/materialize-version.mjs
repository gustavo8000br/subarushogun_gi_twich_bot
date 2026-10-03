#!/usr/bin/env node
import { resolve } from 'node:path';
import { materializeVersionFile } from '../src/version-files.mjs';

function parseArguments(args) {
  const values = new Map();
  for (let index = 0; index < args.length; index += 1) {
    const name = args[index];
    if (!['--root', '--output'].includes(name)) throw new Error(`Unknown argument: ${name}`);
    const value = args[index + 1];
    if (!value || value.startsWith('--')) throw new Error(`${name} requires a value.`);
    values.set(name, value);
    index += 1;
  }
  return {
    root: resolve(values.get('--root') ?? process.cwd()),
    output: values.get('--output'),
  };
}

try {
  const { root, output } = parseArguments(process.argv.slice(2));
  const version = await materializeVersionFile(root, output);
  process.stdout.write(`Materialized product version: ${version}\n`);
} catch (error) {
  process.stderr.write(`Version materialization failed: ${error.message}\n`);
  process.exitCode = 1;
}
