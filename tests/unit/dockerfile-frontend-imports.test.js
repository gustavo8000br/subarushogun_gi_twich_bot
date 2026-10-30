import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(import.meta.dirname, '../..');
const frontendDir = join(root, 'apps/frontend');
const sourceExtensions = ['.jsx', '.mjs', '.js'];
const importPattern = /(?:\bfrom\s*|\bimport\s*\(?\s*)['"](\.{1,2}\/[^'"]+)['"]/g;

function listSources(directory) {
  return readdirSync(directory).flatMap((name) => {
    if (name === 'node_modules' || name === '.next') return [];
    const path = join(directory, name);
    if (statSync(path).isDirectory()) return listSources(path);
    return sourceExtensions.some((extension) => name.endsWith(extension)) ? [path] : [];
  });
}

function resolveImport(fromFile, specifier) {
  const base = resolve(dirname(fromFile), specifier);
  const candidates = [base, ...sourceExtensions.map((extension) => `${base}${extension}`)];
  return candidates.find((candidate) => existsSync(candidate) && statSync(candidate).isFile()) ?? base;
}

function toRepoPath(path) {
  return relative(root, path).split(sep).join('/');
}

function isSharedTarget(repoPath) {
  return repoPath.startsWith('apps/web/') || repoPath.startsWith('apps/shared/');
}

function collectSharedTargets() {
  const targets = new Map();
  const queue = listSources(frontendDir);
  const visited = new Set();
  while (queue.length > 0) {
    const file = queue.shift();
    if (visited.has(file)) continue;
    visited.add(file);
    for (const match of readFileSync(file, 'utf8').matchAll(importPattern)) {
      const target = resolveImport(file, match[1]);
      const repoPath = toRepoPath(target);
      if (!isSharedTarget(repoPath)) continue;
      if (!targets.has(repoPath)) targets.set(repoPath, toRepoPath(file));
      if (existsSync(target)) queue.push(target);
    }
  }
  return targets;
}

function frontendBuildCopySources() {
  const lines = readFileSync(join(root, 'Dockerfile'), 'utf8').split('\n');
  const sources = [];
  let inStage = false;
  for (const line of lines) {
    const stage = line.match(/^FROM\s+\S+(?:\s+AS\s+(\S+))?/i);
    if (stage) {
      inStage = stage[1] === 'frontend-build';
      continue;
    }
    const copy = line.match(/^COPY\s+(?!--from)(.+)$/i);
    if (inStage && copy) sources.push(...copy[1].trim().split(/\s+/).slice(0, -1));
  }
  return sources.map((source) => source.replace(/^\.\//, '').replace(/\/$/, ''));
}

function isCovered(repoPath, sources) {
  return sources.some((source) => repoPath === source || repoPath.startsWith(`${source}/`));
}

describe('Dockerfile frontend build stage', () => {
  it('copies every apps/web and apps/shared module imported by the Next frontend', () => {
    const sources = frontendBuildCopySources();
    const targets = collectSharedTargets();
    expect(targets.size).toBeGreaterThan(0);
    const missing = [...targets].filter(([path]) => !isCovered(path, sources)).map(([path, from]) => `${path} (imported by ${from})`);
    expect(missing).toEqual([]);
  });

  it('never imports apps/web from the Next frontend after the S-03 relocation', () => {
    const webTargets = [...collectSharedTargets()].filter(([path]) => path.startsWith('apps/web/')).map(([path, from]) => `${path} (imported by ${from})`);
    expect(webTargets).toEqual([]);
  });

  it('copies nothing from apps/web into the frontend build stage: the catalogs ship inside apps/shared (OPS-15 cutover wave 2)', () => {
    const webSources = frontendBuildCopySources().filter((source) => source.startsWith('apps/web'));
    expect(webSources).toEqual([]);
    expect(frontendBuildCopySources()).toContain('apps/shared');
    expect(readFileSync(join(root, 'Dockerfile'), 'utf8')).not.toMatch(/apps\/web/);
  });

  it('only resolves imports to files that exist', () => {
    const missingFiles = [...collectSharedTargets().keys()].filter((path) => !existsSync(join(root, path)));
    expect(missingFiles).toEqual([]);
  });
});
