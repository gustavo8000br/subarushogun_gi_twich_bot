import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const packagePath = fileURLToPath(new URL('../../package.json', import.meta.url));

describe('project quality scripts', () => {
  it('defines lint and JSDoc-aware no-emit typecheck scripts for application code', () => {
    const { scripts } = JSON.parse(readFileSync(packagePath, 'utf8'));
    expect(scripts.lint).toBe('eslint apps tests --max-warnings=0');
    expect(scripts.typecheck).toBe('tsc --noEmit');
  });
});
