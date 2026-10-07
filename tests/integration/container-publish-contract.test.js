import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = fileURLToPath(new URL('../../', import.meta.url));
const require = createRequire(import.meta.url);
const yaml = require('js-yaml');
const workflow = (() => { try { return readFileSync(`${root}/.github/workflows/main-cd.yml`, 'utf8'); } catch { return ''; } })();
const parsedWorkflow = yaml.load(workflow);
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
    expect(workflow).toContain('Promote current architecture images and moving main manifest');
    expect(workflow).toContain(`"${image}:$GITHUB_SHA-linux-amd64"`);
    expect(workflow).toContain(`"${image}:$GITHUB_SHA-linux-arm64"`);
    expect(workflow).not.toMatch(/Build and publish AMD64 image[\s\S]*?--tag "\$\{image\}:main-linux-amd64"/);
    expect(workflow).not.toMatch(/Build and publish ARM64 image[\s\S]*?--tag "\$\{image\}:main-linux-arm64"/);
  });

  it('publishes the exact versioned manifest even when a newer main commit supersedes this run', () => {
    const steps = parsedWorkflow.jobs['publish-image'].steps;
    const versionManifest = steps.find((step) => step.name === 'Publish and verify versioned multi-platform manifest');
    const movingTags = steps.find((step) => step.name === 'Promote current architecture images and moving main manifest');

    expect(versionManifest).toBeDefined();
    expect(versionManifest.if).toBeUndefined();
    expect(versionManifest.run).toContain(`--tag "${image}:$PRODUCT_VERSION"`);
    expect(versionManifest.run).toContain(`${image}:$GITHUB_SHA-linux-amd64`);
    expect(versionManifest.run).toContain(`${image}:$GITHUB_SHA-linux-arm64`);
    expect(movingTags.if).toContain("steps.source-current.outputs.current == 'true'");
    expect(movingTags.run).toContain(`--tag "${image}:main"`);
    expect(movingTags.run).not.toContain(`--tag "${image}:$PRODUCT_VERSION"`);
  });

  it('binds the versioned manifest to the full source SHA before it can be resolved by a release', () => {
    const steps = parsedWorkflow.jobs['publish-image'].steps;
    const manifest = steps.find((step) => step.name === 'Publish and verify versioned multi-platform manifest');

    expect(manifest.run).toContain('--annotation "index:org.opencontainers.image.revision=$GITHUB_SHA"');
    expect(manifest.run).toContain('.annotations["org.opencontainers.image.revision"]');
    expect(manifest.run).toContain('== $sha');
    expect(manifest.run).toContain('--arg sha "$GITHUB_SHA"');
  });
});
