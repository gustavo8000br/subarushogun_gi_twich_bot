import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const modulePath = new URL('../../apps/infra/src/version.mjs', import.meta.url);
const moduleIsPresent = existsSync(fileURLToPath(modulePath));
const versionPolicy = moduleIsPresent ? await import(modulePath.href) : {};

function expectBehaviorError(operation) {
  let observedError;
  try {
    operation();
  } catch (error) {
    observedError = error;
  }
  expect(observedError).toBeInstanceOf(Error);
  expect(observedError?.name).not.toBe('TypeError');
}

describe('runtime product version policy', () => {
  it('provides a version policy module', () => {
    expect(moduleIsPresent, 'version policy behavior is not implemented yet').toBe(true);
  });

  it('validates the pre-Git marker and consistent version sources', () => {
    expect(versionPolicy.validateVersionSources({
      baseVersion: '0.1.0',
      stage: 'alpha',
      sourceSha: '0000000',
      runtimeVersion: 'v0.1.0-0000000-alpha',
    })).toEqual({ valid: true, version: 'v0.1.0-0000000-alpha' });
  });

  it('accepts only a plain base SemVer without prefix or build identity', () => {
    expectBehaviorError(() => versionPolicy.validateVersionSources({
      baseVersion: 'v0.1.0',
      stage: 'alpha',
      sourceSha: '0000000',
      runtimeVersion: 'v0.1.0-0000000-alpha',
    }));
    expectBehaviorError(() => versionPolicy.validateVersionSources({
      baseVersion: '0.1.0-rc.1',
      stage: 'alpha',
      sourceSha: '0000000',
      runtimeVersion: 'v0.1.0-0000000-alpha',
    }));
  });

  it.each(['alpha', 'beta', 'rc', 'stable'])('accepts the allowed stage %s', (stage) => {
    const version = `v0.1.0-0000000-${stage}`;
    expect(versionPolicy.validateVersionSources({
      baseVersion: '0.1.0', stage, sourceSha: '0000000', runtimeVersion: version,
    }).version).toBe(version);
  });

  it('rejects unsupported stages, malformed seven-character SHA, and inconsistent files', () => {
    expectBehaviorError(() => versionPolicy.validateVersionSources({
      baseVersion: '0.1.0', stage: 'preview', sourceSha: '0000000',
      runtimeVersion: 'v0.1.0-0000000-preview',
    }));
    expectBehaviorError(() => versionPolicy.validateVersionSources({
      baseVersion: '0.1.0', stage: 'alpha', sourceSha: 'abcdef',
      runtimeVersion: 'v0.1.0-abcdef-alpha',
    }));
    expectBehaviorError(() => versionPolicy.validateVersionSources({
      baseVersion: '0.1.0', stage: 'alpha', sourceSha: 'abcdef0',
      runtimeVersion: 'v0.1.0-abcdef1-alpha',
    }));
  });

  it('uses the explicit marker when Git metadata is unavailable', () => {
    expect(versionPolicy.materializeVersion({
      baseVersion: '0.1.0', stage: 'alpha', gitAvailable: false,
    })).toBe('v0.1.0-0000000-alpha');
  });

  it('takes exactly seven hex characters from the full source commit identity', () => {
    expect(versionPolicy.materializeVersion({
      baseVersion: '0.1.0', stage: 'alpha', gitAvailable: true,
      sourceCommitSha: 'a1b2c3d4e5f6789012345678901234567890abcd',
    })).toBe('v0.1.0-a1b2c3d-alpha');
  });

  it('fails when Git exists but source commit discovery or validation fails', () => {
    expectBehaviorError(() => versionPolicy.materializeVersion({
      baseVersion: '0.1.0', stage: 'alpha', gitAvailable: true,
    }));
    expectBehaviorError(() => versionPolicy.materializeVersion({
      baseVersion: '0.1.0', stage: 'alpha', gitAvailable: true,
      sourceCommitSha: 'not-a-git-sha',
    }));
  });
});
