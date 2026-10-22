import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { getDevelopmentComposeProject } from '../../apps/frontend/scripts/dev-database.mjs';
import { runDevelopmentPreflight } from '../../apps/frontend/scripts/dev-preflight.mjs';

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

describe('Windows native development contract', () => {
  it('derives a valid Compose project name from a Windows checkout path with spaces and drive letter', () => {
    const name = getDevelopmentComposeProject('C:\\Users\\Gustavo Rocha\\Projects\\Queue Bot');
    expect(name).toMatch(/^queuebot-dev-[a-z0-9-]+$/);
    expect(name).not.toMatch(/[\\: ]/);
    expect(name).toBe(getDevelopmentComposeProject('C:\\Users\\Gustavo Rocha\\Projects\\Queue Bot'));
    expect(name).not.toBe(getDevelopmentComposeProject('C:\\Users\\Gustavo Rocha\\Projects\\Queue Bot Copy'));
  });

  it('reports actionable Docker Desktop guidance when the engine is unavailable', async () => {
    const checkCommand = (command, args) => {
      if (command === process.execPath) return { status: 0, stdout: 'v24.20.0' };
      if (args[0] === 'compose') return { status: 0, stdout: 'Docker Compose version v2.40.0' };
      return { status: 1, stdout: '' };
    };
    await expect(runDevelopmentPreflight({ env: {}, root: 'C:\\repo', checkCommand, checkDependencies: async () => true }))
      .rejects.toThrow(/Docker Desktop\/Engine/);
  });

  it('lets a developer with an explicit DATABASE_URL skip Docker entirely', async () => {
    const calls = [];
    const checkCommand = (command) => { calls.push(command); return { status: 0, stdout: 'v24.20.0' }; };
    await runDevelopmentPreflight({ env: { DATABASE_URL: 'postgresql://x' }, root: 'C:\\repo', checkCommand, checkDependencies: async () => true });
    expect(calls).not.toContain('docker');
  });
});

describe('development Compose project override', () => {
  it('keeps the derived name when no override is set, so existing development databases stay linked', () => {
    expect(getDevelopmentComposeProject('/home/a/queue-bot', {})).toBe(getDevelopmentComposeProject('/home/a/queue-bot'));
  });

  it('separates checkouts that share the same path tail when an override is provided', () => {
    const first = '/home/a/subarushogun-twitch-queue-bot-checkout';
    const second = '/srv/b/subarushogun-twitch-queue-bot-checkout';
    expect(getDevelopmentComposeProject(first)).toBe(getDevelopmentComposeProject(second));
    expect(getDevelopmentComposeProject(second, { DEV_COMPOSE_PROJECT: 'queuebot-dev-b' })).toBe('queuebot-dev-b');
  });

  it('rejects names Compose would not accept', () => {
    for (const invalid of ['Has Space', 'UPPER', '-leading', 'a/b', 'x'.repeat(64)]) {
      expect(() => getDevelopmentComposeProject('/home/a/queue-bot', { DEV_COMPOSE_PROJECT: invalid })).toThrow(/DEV_COMPOSE_PROJECT/);
    }
  });
});

describe('line-ending policy for cross-platform checkouts', () => {
  const attributes = read('.gitattributes');

  it('forces LF for every file consumed by Linux containers or POSIX shells', () => {
    expect(attributes).toMatch(/^\* text=auto eol=lf$/m);
    for (const pattern of ['*.sh', '*.mjs', '*.sql', '*.yaml', '*.yml', 'Dockerfile']) {
      expect(attributes).toContain(`${pattern} text eol=lf`);
    }
  });

  it('keeps native Windows launchers on CRLF', () => {
    expect(attributes).toMatch(/^\*\.bat text eol=crlf$/m);
    expect(attributes).toMatch(/^\*\.cmd text eol=crlf$/m);
    expect(attributes).toMatch(/^\*\.ps1 eol=crlf$/m);
  });
});
