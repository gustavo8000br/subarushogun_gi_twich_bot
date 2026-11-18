import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const yaml = require('js-yaml');
const root = fileURLToPath(new URL('../../', import.meta.url));
const compose = yaml.load(readFileSync(`${root}compose.yaml`, 'utf8'));

describe('Compose restart policy (G1-4)', () => {
  it('keeps the long-running services up after a crash or a reboot', () => {
    expect(compose.services.bot.restart).toBe('unless-stopped');
    expect(compose.services.db.restart).toBe('unless-stopped');
  });

  it('never restarts the one-shot bootstrap and migrate jobs', () => {
    expect(compose.services.bootstrap.restart).toBe('no');
    expect(compose.services.migrate.restart ?? 'no').toBe('no');
  });

  it.each([
    ['installer.sh', /compose down(?: --volumes)? --remove-orphans/],
    ['installer.ps1', /Compose @\('down',(?:'--volumes',)?'--remove-orphans'\)/],
  ])('the uninstaller in %s removes the containers with compose down, so a restart policy cannot bring them back', (file, pattern) => {
    const script = readFileSync(`${root}apps/infra/installer/${file}`, 'utf8');
    expect(script).toMatch(pattern);
    expect(script).not.toMatch(/compose (?:stop|kill)\b(?! .*down)/);
  });
});
