/** @typedef {'alpha' | 'beta' | 'rc' | 'stable'} ReleaseStage */

const ALLOWED_STAGES = new Set(['alpha', 'beta', 'rc', 'stable']);
const BASE_SEMVER_PATTERN = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const SHA_PREFIX_PATTERN = /^[0-9a-f]{7}$/;
const FULL_GIT_SHA_PATTERN = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/i;
const UNMATERIALIZED_SHA = '0000000';

/** @param {string} value */
function assertBaseVersion(value) {
  if (typeof value !== 'string' || !BASE_SEMVER_PATTERN.test(value)) {
    throw new Error('Base product version must be plain MAJOR.MINOR.PATCH SemVer.');
  }
}

/** @param {string} stage */
function assertReleaseStage(stage) {
  if (!ALLOWED_STAGES.has(stage)) {
    throw new Error('Release stage must be alpha, beta, rc, or stable.');
  }
}

/**
 * Validate the independently stored product version sources without mutating them.
 * @param {{baseVersion: string, stage: ReleaseStage, sourceSha: string, runtimeVersion: string}} input
 * @returns {{valid: true, version: string}}
 */
export function validateVersionSources({ baseVersion, stage, sourceSha, runtimeVersion }) {
  assertBaseVersion(baseVersion);
  assertReleaseStage(stage);

  if (typeof sourceSha !== 'string' || !SHA_PREFIX_PATTERN.test(sourceSha)) {
    throw new Error('Runtime source identity must contain exactly seven lowercase hexadecimal characters.');
  }

  const expectedVersion = `v${baseVersion}-${sourceSha}-${stage}`;
  if (runtimeVersion !== expectedVersion) {
    throw new Error(`Runtime version does not match package, stage, and source identity; expected ${expectedVersion}.`);
  }

  return { valid: true, version: expectedVersion };
}

/**
 * Build an identity from a source commit. A Git-enabled build without a valid
 * commit identity is an error; only a build with no Git metadata gets the marker.
 * @param {{baseVersion: string, stage: ReleaseStage, gitAvailable: boolean, sourceCommitSha?: string}} input
 * @returns {string}
 */
export function materializeVersion({ baseVersion, stage, gitAvailable, sourceCommitSha }) {
  assertBaseVersion(baseVersion);
  assertReleaseStage(stage);

  if (!gitAvailable) {
    return `v${baseVersion}-${UNMATERIALIZED_SHA}-${stage}`;
  }

  if (typeof sourceCommitSha !== 'string' || !FULL_GIT_SHA_PATTERN.test(sourceCommitSha)) {
    throw new Error('Git is available but a full source commit SHA could not be discovered.');
  }

  return `v${baseVersion}-${sourceCommitSha.slice(0, 7).toLowerCase()}-${stage}`;
}
