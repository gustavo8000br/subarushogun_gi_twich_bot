import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { resolveDryRun } from '../../apps/infra/scripts/branch-cleanup.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const yaml = createRequire(import.meta.url)('js-yaml');
const source = readFileSync(`${root}/.github/workflows/branch-cleanup.yml`, 'utf8');
const workflow = yaml.load(source);

describe('branch cleanup workflow contract', () => {
  it('runs weekly or on demand, with dry run on by default for manual runs', () => {
    expect(workflow.on.schedule).toHaveLength(1);
    expect(workflow.on.workflow_dispatch.inputs.dry_run).toMatchObject({ type: 'boolean', default: true });
  });

  it('passes the raw inputs to the script and never decides the mode in an expression', () => {
    const env = workflow.jobs.plan.steps.find((step) => step.id === 'plan').env;
    expect(env.EVENT_NAME).toBe('${{ github.event_name }}');
    expect(env.DISPATCH_DRY_RUN).toBe('${{ inputs.dry_run }}');
    expect(env.BRANCH_CLEANUP_ENABLED).toBe('${{ vars.BRANCH_CLEANUP_ENABLED }}');
    expect(env).not.toHaveProperty('DRY_RUN');
    // Actions' `==` is case-insensitive, so no step may compare the variable inside an expression.
    expect(source).not.toMatch(/BRANCH_CLEANUP_ENABLED\s*==/);
  });

  it('keeps the schedule in dry run until BRANCH_CLEANUP_ENABLED is exactly true (real function)', () => {
    const schedule = (variable) => resolveDryRun({ EVENT_NAME: 'schedule', BRANCH_CLEANUP_ENABLED: variable });
    expect(schedule('true')).toBe(false);
    for (const value of ['TRUE', 'True', ' true', 'true ', '1', '', undefined, 'false', 'yes']) {
      expect(schedule(value)).toBe(true);
    }
    const manual = (input, variable) => resolveDryRun({
      EVENT_NAME: 'workflow_dispatch', DISPATCH_DRY_RUN: input, BRANCH_CLEANUP_ENABLED: variable,
    });
    expect(manual('false', undefined)).toBe(false);
    expect(manual('true', 'true')).toBe(true);
    expect(manual('', 'true')).toBe(true);
    expect(manual(undefined, 'true')).toBe(true);
  });

  it('is fail-safe: only an exact false dispatch input deletes, anything else is a dry run', () => {
    const manual = (input) => resolveDryRun({ EVENT_NAME: 'workflow_dispatch', DISPATCH_DRY_RUN: input });
    expect(manual('false')).toBe(false);
    for (const value of ['FALSE', 'False', '0', ' false', '', undefined, 'true', 'no']) expect(manual(value)).toBe(true);
    expect(resolveDryRun({})).toBe(true);
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
