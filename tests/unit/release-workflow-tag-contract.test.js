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
    const sendAt = tagStep.run.indexOf('push origin "refs/tags/$RELEASE_TAG"');
    expect(sendAt).toBeGreaterThan(tagStep.run.indexOf('git tag -a'));
  });

  it('grants contents: write to the job and authenticates only the tag upload with the job token', () => {
    expect(job.permissions.contents).toBe('write');
    const checkout = job.steps.find((step) => /actions\/checkout/.test(step.uses ?? ''));
    // zizmor artipacked: checkout does not persist the token...
    expect(checkout.with?.['persist-credentials']).toBe(false);
    // ...so the tag upload must supply it explicitly, scoped to that single git command.
    expect(tagStep.env.GH_TOKEN).toBeTruthy();
    expect(tagStep.run).toMatch(/git -c "http\.https:\/\/github\.com\/\.extraheader=AUTHORIZATION: basic \$auth_header" push origin/);
    expect(tagStep.run).toContain('::add-mask::$auth_header');
  });

  it('publishes with GH_TOKEN and --verify-tag, marking only alpha/beta/rc as prerelease', () => {
    const publish = job.steps.find((step) => /gh release create/.test(step.run ?? ''));
    expect(publish.env.GH_TOKEN).toBeTruthy();
    expect(publish.run).toContain('--verify-tag');
    expect(publish.run).toContain('alpha|beta|rc) release_args+=(--prerelease --latest=false)');
    expect(publish.run).toContain('stable) release_args+=(--latest)');
    expect(publish.run).not.toMatch(/gh release create[^\n]*--prerelease/);
  });
});
