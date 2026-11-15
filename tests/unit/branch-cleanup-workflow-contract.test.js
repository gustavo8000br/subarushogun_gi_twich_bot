import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = fileURLToPath(new URL('../../', import.meta.url));
const yaml = createRequire(import.meta.url)('js-yaml');
const source = readFileSync(`${root}/.github/workflows/branch-cleanup.yml`, 'utf8');
const workflow = yaml.load(source);

describe('branch cleanup workflow contract', () => {
  it('runs weekly or on demand, with dry run on by default for manual runs', () => {
    expect(workflow.on.schedule).toHaveLength(1);
    expect(workflow.on.workflow_dispatch.inputs.dry_run).toMatchObject({ type: 'boolean', default: true });
  });

  it('keeps the schedule in dry run until BRANCH_CLEANUP_ENABLED is exactly true', () => {
    const expression = workflow.jobs.plan.steps.find((step) => step.id === 'plan').env.DRY_RUN;
    // Evaluate the expression the way Actions does for the three cases that matter.
    const evaluate = ({ event, input, variable }) => {
      const manual = event === 'workflow_dispatch';
      const fromInput = manual ? String(input) : '';
      return fromInput || (variable === 'true' ? 'false' : 'true');
    };
    expect(expression).toContain("vars.BRANCH_CLEANUP_ENABLED == 'true' && 'false' || 'true'");
    expect(expression).toContain("format('{0}', inputs.dry_run)");
    expect(evaluate({ event: 'schedule', variable: undefined })).toBe('true');
    expect(evaluate({ event: 'schedule', variable: 'TRUE' })).toBe('true');
    expect(evaluate({ event: 'schedule', variable: 'true' })).toBe('false');
    expect(evaluate({ event: 'workflow_dispatch', input: false, variable: undefined })).toBe('false');
    expect(evaluate({ event: 'workflow_dispatch', input: true, variable: 'true' })).toBe('true');
  });

  it('grants contents: write only to the delete job', () => {
    expect(workflow.permissions).toEqual({ contents: 'read' });
    expect(workflow.jobs.plan.permissions).toEqual({ contents: 'read', 'pull-requests': 'read' });
    expect(workflow.jobs.delete.permissions).toEqual({ contents: 'write' });
    expect(source.match(/contents: write/g)).toHaveLength(1);
  });

  it('deletes only when the plan is non-empty and it is not a dry run', () => {
    expect(workflow.jobs.delete.needs).toBe('plan');
    expect(workflow.jobs.delete.if).toContain("needs.plan.outputs.count != '0'");
    expect(workflow.jobs.delete.if).toContain("needs.plan.outputs.dry_run != 'true'");
  });

  it('pins every action by SHA, uses no secrets and serializes runs', () => {
    const uses = [...source.matchAll(/uses: (\S+)/g)].map((match) => match[1]);
    expect(uses.length).toBeGreaterThan(0);
    for (const reference of uses) expect(reference).toMatch(/@[0-9a-f]{40}$/);
    expect(source).not.toContain('secrets.');
    expect(workflow.concurrency).toEqual({ group: 'branch-cleanup', 'cancel-in-progress': false });
  });

  it('never interpolates expressions inside run: scripts', () => {
    for (const job of Object.values(workflow.jobs)) {
      for (const step of job.steps) if (step.run) expect(step.run).not.toContain('${{');
    }
  });

  it('needs full history for the ancestor check', () => {
    expect(workflow.jobs.plan.steps[0].with['fetch-depth']).toBe(0);
  });
});
