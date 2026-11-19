import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = fileURLToPath(new URL('../../', import.meta.url));
const yaml = createRequire(import.meta.url)('js-yaml');
const source = readFileSync(`${root}/.github/workflows/research-freshness.yml`, 'utf8');
const workflow = yaml.load(source);

describe('research freshness workflow contract', () => {
  it('runs weekly (Monday) and on demand', () => {
    expect(workflow.on.schedule).toEqual([{ cron: '0 12 * * 1' }]);
    expect(workflow.on).toHaveProperty('workflow_dispatch');
  });

  it('is read-only, secret-free and creates no issue or comment', () => {
    expect(workflow.permissions).toEqual({ contents: 'read' });
    expect(source).not.toMatch(/secrets\.|GH_TOKEN|github\.token|gh (issue|pr)|permissions:[\s\S]*write/);
    expect(workflow.concurrency.group).toBe('research-freshness');
  });

  it('runs the strict gate with parity check on a short-lived job', () => {
    const job = workflow.jobs.freshness;
    expect(job['timeout-minutes']).toBeLessThanOrEqual(10);
    const commands = job.steps.filter((step) => step.run).map((step) => step.run.trim());
    expect(commands).toEqual(['npm run research:stale -- --strict --check-both']);
  });

  it('pins actions by SHA, uses the project Node.js pin and does not persist credentials', () => {
    const job = workflow.jobs.freshness;
    for (const step of job.steps.filter((entry) => entry.uses)) expect(step.uses).toMatch(/@[0-9a-f]{40}$/);
    expect(job.steps.find((step) => step.uses?.startsWith('actions/setup-node@')).with['node-version']).toBe('24.22.3');
    expect(job.steps.find((step) => step.uses?.startsWith('actions/checkout@')).with['persist-credentials']).toBe(false);
  });

  it('step lookup by action tolerates steps without uses', () => {
    const steps = [{ run: 'echo no-uses' }, { uses: 'actions/checkout@abc', with: { marker: 1 } }];
    expect(() => steps.find((step) => step.uses?.startsWith('actions/checkout@'))).not.toThrow();
    expect(steps.find((step) => step.uses?.startsWith('actions/checkout@')).with.marker).toBe(1);
  });
});
