import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = fileURLToPath(new URL('../../', import.meta.url));
const workflow = (() => { try { return readFileSync(`${root}/.github/workflows/main-cd.yml`, 'utf8'); } catch { return ''; } })();
const image = 'ghcr.io/$GITHUB_REPOSITORY';

describe('GHCR multi-platform publish contract', () => {
  it('publishes each Linux architecture and a combined manifest only after main CI passes', () => {
    expect(workflow).toContain('publish-image:');
    expect(workflow).toMatch(/publish-image:[\s\S]*?needs:\s*\[quality-gates\]/);
    expect(workflow).toMatch(/branches:\s*\n\s*- main/);
    expect(workflow).toContain('packages: write');
    expect(workflow).toContain('docker login ghcr.io');
    expect(workflow).toContain('--platform linux/amd64');
    expect(workflow).toContain(`--tag "${image}:main-linux-amd64"`);
    expect(workflow).toContain('--platform linux/arm64');
    expect(workflow).toContain(`--tag "${image}:main-linux-arm64"`);
    expect(workflow).toContain(`--tag "${image}:main"`);
    expect(workflow).toContain(`"${image}:main-linux-amd64"`);
    expect(workflow).toContain(`"${image}:main-linux-arm64"`);
  });

  it('uses the exact seven-character materialized product identity for versioned platform and manifest tags', () => {
    expect(workflow).toContain('materialize-version.mjs');
    expect(workflow).toContain(`${image}:$PRODUCT_VERSION-linux-amd64`);
    expect(workflow).toContain(`${image}:$PRODUCT_VERSION-linux-arm64`);
    expect(workflow).toContain(`--tag "${image}:$PRODUCT_VERSION"`);
  });

  it('promotes moving architecture tags only from immutable images after confirming the source is current', () => {
    expect(workflow).toContain(`--tag "${image}:$GITHUB_SHA-linux-amd64"`);
    expect(workflow).toContain(`--tag "${image}:$GITHUB_SHA-linux-arm64"`);
    expect(workflow).toContain('Promote current architecture images and manifests');
    expect(workflow).toContain(`"${image}:$GITHUB_SHA-linux-amd64"`);
    expect(workflow).toContain(`"${image}:$GITHUB_SHA-linux-arm64"`);
    expect(workflow).not.toMatch(/Build and publish AMD64 image[\s\S]*?--tag "\$\{image\}:main-linux-amd64"/);
    expect(workflow).not.toMatch(/Build and publish ARM64 image[\s\S]*?--tag "\$\{image\}:main-linux-arm64"/);
  });
});
