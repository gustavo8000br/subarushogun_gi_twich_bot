import { existsSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = fileURLToPath(new URL('../../', import.meta.url));
const composePath = `${root}/compose.yaml`;
const dockerfilePath = `${root}/Dockerfile`;

function getComposeConfig() {
  return spawnSync('docker', ['compose', '-f', composePath, 'config', '--format', 'json'], {
    cwd: root,
    encoding: 'utf8',
  });
}

describe('local Compose runtime contract', () => {
  it('provides a valid Compose graph with bootstrap, database, migration and bot ordering', () => {
    expect(existsSync(composePath), 'product Compose configuration is missing').toBe(true);
    const result = getComposeConfig();
    expect(result.status, result.stderr).toBe(0);
    const config = JSON.parse(result.stdout);
    expect(Object.keys(config.services).sort()).toEqual(['bootstrap', 'bot', 'db', 'migrate']);
    expect(config.services.db.depends_on.bootstrap.condition).toBe('service_completed_successfully');
    expect(config.services.migrate.depends_on.db.condition).toBe('service_healthy');
    expect(config.services.bot.depends_on.db.condition).toBe('service_healthy');
    expect(config.services.bot.depends_on.migrate.condition).toBe('service_completed_successfully');
  });

  it('keeps PostgreSQL private and publishes only the bot to host loopback', () => {
    expect(existsSync(composePath), 'product Compose configuration is missing').toBe(true);
    const result = getComposeConfig();
    expect(result.status, result.stderr).toBe(0);
    const config = JSON.parse(result.stdout);
    expect(config.services.db.ports ?? []).toHaveLength(0);
    expect(config.services.bot.ports).toContainEqual(expect.objectContaining({
      host_ip: '127.0.0.1', target: 3000, published: '3000',
    }));
    expect(config.services.bot.environment.APP_PORT).toBe('3000');
    expect(config.services.bot.environment.PUBLIC_BASE_URL).toBe('https://localhost:3000');
    expect(config.services.bot.environment.CALLBACK_URL).toBe('https://localhost:3000/callback');
    expect(config.services.bot.environment.TLS_CERT_FILE).toBe('/run/secrets/localhost.crt');
    expect(config.services.bot.environment.TLS_KEY_FILE).toBe('/run/secrets/localhost.key');
    expect(config.volumes).toHaveProperty('postgres_data');
    expect(config.volumes).toHaveProperty('operational_secrets');
  });

  it('keeps an advanced published port consistent in the app and OAuth callback', () => {
    const result = spawnSync('docker', ['compose', '-f', composePath, 'config', '--format', 'json'], {
      cwd: root,
      encoding: 'utf8',
      env: { ...process.env, APP_PORT: '3217' },
    });
    expect(result.status, result.stderr).toBe(0);
    const config = JSON.parse(result.stdout);
    expect(config.services.bot.ports).toContainEqual(expect.objectContaining({
      host_ip: '127.0.0.1', target: 3217, published: '3217',
    }));
    expect(config.services.bot.environment.APP_PORT).toBe('3217');
    expect(config.services.bot.environment.PUBLIC_BASE_URL).toBe('https://localhost:3217');
    expect(config.services.bot.environment.CALLBACK_URL).toBe('https://localhost:3217/callback');
  });

  it('mounts the same generated secret read-only for database consumers and runs the bot without root', () => {
    expect(existsSync(composePath), 'product Compose configuration is missing').toBe(true);
    expect(existsSync(dockerfilePath), 'product Dockerfile is missing').toBe(true);
    const result = getComposeConfig();
    expect(result.status, result.stderr).toBe(0);
    const config = JSON.parse(result.stdout);
    for (const serviceName of ['db', 'migrate', 'bot']) {
      expect(config.services[serviceName].volumes).toContainEqual(expect.objectContaining({
        source: 'operational_secrets', target: '/run/secrets', read_only: true,
      }));
    }
    expect(config.services.db.environment.POSTGRES_PASSWORD_FILE).toBe('/run/secrets/db_password');
    expect(Number(config.services.bot.user.split(':')[0])).toBeGreaterThan(0);
    expect(readFileSync(dockerfilePath, 'utf8')).toMatch(/^USER\s+(?!0(?:\s|:))\d+/m);
  });

  it('mounts the host-readable locale projection with a dedicated non-root write group', () => {
    const result = getComposeConfig();
    expect(result.status, result.stderr).toBe(0);
    const config = JSON.parse(result.stdout);
    expect(config.services.bot.volumes).toContainEqual(expect.objectContaining({
      type: 'bind', source: resolve(root, '.local'), target: '/app/.local',
    }));
    expect(config.services.bot.group_add).toContain('10001');
  });

  it('grants non-root migration and bot processes read access to the postgres-owned secret group', () => {
    const result = getComposeConfig();
    expect(result.status, result.stderr).toBe(0);
    const config = JSON.parse(result.stdout);
    expect(config.services.migrate.group_add).toContain('999');
    expect(config.services.bot.group_add).toContain('999');
  });

  it('defaults local app images to the main tag while keeping product identity separate', () => {
    expect(existsSync(composePath), 'product Compose configuration is missing').toBe(true);
    const result = getComposeConfig();
    expect(result.status, result.stderr).toBe(0);
    const config = JSON.parse(result.stdout);
    for (const serviceName of ['bootstrap', 'migrate', 'bot']) {
      expect(typeof config.services[serviceName].image).toBe('string');
      expect(config.services[serviceName].image).toMatch(/^ghcr\.io\/gustavo8000br\/subarushogun_gi_twich_bot:main$/);
      expect(config.services[serviceName].build.args.PRODUCT_VERSION).toBe('');
    }
    const dockerfile = readFileSync(dockerfilePath, 'utf8');
    expect(dockerfile).toMatch(/^FROM node:24\.20\.0-alpine3\.24 AS dependencies$/m);
    expect(dockerfile).toMatch(/^RUN apk add --no-cache openssl$/m);
  });

  it('allows IMAGE_TAG to select a platform-specific GHCR image explicitly', () => {
    const result = spawnSync('docker', ['compose', '-f', composePath, 'config', '--format', 'json'], {
      cwd: root,
      encoding: 'utf8',
      env: { ...process.env, IMAGE_TAG: 'main-linux-arm64' },
    });
    expect(result.status, result.stderr).toBe(0);
    const config = JSON.parse(result.stdout);
    for (const serviceName of ['bootstrap', 'migrate', 'bot']) {
      expect(config.services[serviceName].image)
        .toBe('ghcr.io/gustavo8000br/subarushogun_gi_twich_bot:main-linux-arm64');
    }
  });

  it('serves the callback over HTTPS with TLS material created by bootstrap', () => {
    const result = getComposeConfig();
    expect(result.status, result.stderr).toBe(0);
    const config = JSON.parse(result.stdout);
    expect(config.services.bootstrap.volumes).toContainEqual(expect.objectContaining({
      source: 'operational_secrets', target: '/var/lib/aiox/secrets',
    }));
    expect(config.services.bot.volumes).toContainEqual(expect.objectContaining({
      source: 'operational_secrets', target: '/run/secrets', read_only: true,
    }));
    expect(readFileSync(`${root}/apps/api/src/server.mjs`, 'utf8')).toMatch(/https:\s*\{/);
  });
});
