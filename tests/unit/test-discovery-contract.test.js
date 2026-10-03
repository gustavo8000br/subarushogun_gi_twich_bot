import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const configPath = fileURLToPath(new URL('../../vitest.config.js', import.meta.url));

describe('product Vitest discovery contract', () => {
  it('limits product tests to the owned tests directory', () => {
    const config = readFileSync(configPath, 'utf8');
    expect(config).toMatch(/include\s*:\s*\[[^\]]*tests\/\*\*\/\*\.test\.js/s);
    expect(config).toMatch(/exclude\s*:\s*\[[^\]]*\.aiox-core/s);
  });
});
