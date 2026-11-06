import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const root = fileURLToPath(new URL('../../', import.meta.url));
const require = createRequire(import.meta.url);
const yaml = require('js-yaml');
const workflow = yaml.load(readFileSync(`${root}/.github/workflows/release.yml`, 'utf8'));
const job = workflow.jobs['publish-release'];
const tagStep = job.steps.find((step) => /git tag -a/.test(step.run ?? ''));

describe('release.yml publish job: annotated tag contract', () => {
  it('sets the git committer identity before creating the annotated tag', () => {
    expect(tagStep).toBeDefined();
    const run = tagStep.run;
    const tagAt = run.indexOf('git tag -a');
    const nameAt = run.search(/git config (--local )?user\.name "github-actions\[bot\]"/);
    const emailAt = run.search(/git config (--local )?user\.email "41898282\+github-actions\[bot\]@users\.noreply\.github\.com"/);
    expect(nameAt).toBeGreaterThanOrEqual(0);
    expect(emailAt).toBeGreaterThanOrEqual(0);
    expect(nameAt).toBeLessThan(tagAt);
    expect(emailAt).toBeLessThan(tagAt);
  });

  it('runs the tag step in bash and sends the tag to origin after creating it', () => {
    expect(tagStep.shell).toBe('bash');
    const sendAt = tagStep.run.indexOf('git push origin "refs/tags/$RELEASE_TAG"');
    expect(sendAt).toBeGreaterThan(tagStep.run.indexOf('git tag -a'));
  });

  it('grants contents: write to the job and keeps checkout credentials for the tag upload', () => {
    expect(job.permissions.contents).toBe('write');
    const checkout = job.steps.find((step) => /actions\/checkout/.test(step.uses ?? ''));
    expect(checkout.with?.['persist-credentials']).not.toBe(false);
  });

  it('publishes with GH_TOKEN, --verify-tag and --prerelease', () => {
    const publish = job.steps.find((step) => /gh release create/.test(step.run ?? ''));
    expect(publish.env.GH_TOKEN).toBeTruthy();
    expect(publish.run).toContain('--verify-tag');
    expect(publish.run).toContain('--prerelease');
  });
});
