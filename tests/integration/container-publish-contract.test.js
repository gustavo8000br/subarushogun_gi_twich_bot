import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = fileURLToPath(new URL('../../', import.meta.url));
const workflow = readFileSync(`${root}/.github/workflows/ci.yml`, 'utf8');
const image = 'ghcr.io/$GITHUB_REPOSITORY';

describe('GHCR multi-platform publish contract', () => {
  it('publishes each Linux architecture and a combined manifest only after main CI passes', () => {
    expect(workflow).toContain('container-publish:');
    expect(workflow).toMatch(/container-publish:[\s\S]*?needs:\s*\[app-quality, lint-tests, tests, static-analysis, container-build\]/);
    expect(workflow).toMatch(/container-publish:[\s\S]*?if:\s*github\.event_name == 'push' && github\.ref == 'refs\/heads\/main'/);
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
});
