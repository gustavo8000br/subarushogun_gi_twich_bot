import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const devcontainerUrl = new URL('../../.devcontainer/devcontainer.json', import.meta.url);
const setupUrl = new URL('../../.devcontainer/post-create.sh', import.meta.url);
const developmentGuideUrls = [
  new URL('../../docs/DEVELOPMENT.md', import.meta.url),
  new URL('../../docs/pt-BR/DESENVOLVIMENTO.md', import.meta.url),
];

describe('GitHub Codespaces development environment', () => {
  it('pins the project Node runtime and provides Docker Compose v2 in Docker-in-Docker', async () => {
    const config = JSON.parse(await readFile(devcontainerUrl, 'utf8'));

    expect(config.name).toBe('SubaruShogun Twitch Queue Bot');
    expect(config.features['ghcr.io/devcontainers/features/node:2.1.1'].version).toBe('24.20.0');
    expect(config.features['ghcr.io/devcontainers/features/docker-in-docker:4.1.3']).toMatchObject({
      dockerDashComposeVersion: 'v2',
      installDockerBuildx: true,
    });
    expect(config.features['ghcr.io/devcontainers/features/github-cli:1.1.3']).toBeDefined();
    expect(config.privileged).toBe(true);
  });

  it('installs locked project dependencies and pinned local development tools', async () => {
    const config = JSON.parse(await readFile(devcontainerUrl, 'utf8'));
    const setup = await readFile(setupUrl, 'utf8');

    expect(config.postCreateCommand).toBe('bash .devcontainer/post-create.sh');
    expect(setup).toContain('npm ci');
    expect(setup).toContain('readonly CODEX_CLI_VERSION="0.161.0"');
    expect(setup).toContain('"@openai/codex@${CODEX_CLI_VERSION}"');
    expect(setup).toContain('readonly OPENGREP_VERSION="v1.30.0"');
    expect(setup).toContain('"${OPENGREP_VERSION}"');
    expect(setup).toContain('opengrep --version');
    expect(setup).toContain('codex --version');
    expect(setup).toContain('docker compose version');
  });

  it('documents Codespaces setup and first use in both project languages', async () => {
    const [english, portuguese] = await Promise.all(
      developmentGuideUrls.map((url) => readFile(url, 'utf8')),
    );

    for (const guide of [english, portuguese]) {
      expect(guide).toMatch(/Codespaces/i);
      expect(guide).toMatch(/Codex CLI/i);
      expect(guide).toMatch(/npm ci/);
      expect(guide).toMatch(/Docker Compose/i);
      expect(guide).toMatch(/codex login/);
    }
  });
});
