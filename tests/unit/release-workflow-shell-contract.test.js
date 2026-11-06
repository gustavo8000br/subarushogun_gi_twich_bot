import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const root = fileURLToPath(new URL('../../', import.meta.url));
const require = createRequire(import.meta.url);
const yaml = require('js-yaml');
const dir = `${root}/.github/workflows`;

const runsOnWindows = (job) => {
  const runsOn = String(job['runs-on'] ?? '');
  if (/windows/i.test(runsOn)) return true;
  const include = job.strategy?.matrix?.include ?? [];
  return /matrix\./.test(runsOn) && include.some((entry) => /windows/i.test(String(entry.runner ?? '')));
};

// bash-style env expansion ($VAR, ${VAR}, "$VAR") outside GitHub expressions; PowerShell needs $env:VAR.
const bashStyleVariables = (script) => {
  const withoutExpressions = script.replace(/\$\{\{[\s\S]*?\}\}/g, '');
  return [...withoutExpressions.matchAll(/\$\{?([A-Za-z_][A-Za-z0-9_]*)\}?(?!:)/g)]
    .map((match) => match[1])
    .filter((name) => name.toLowerCase() !== 'env' && /^[A-Z][A-Z0-9_]*$/.test(name));
};

describe('workflow shell contract for Windows runners', () => {
  const files = readdirSync(dir).filter((name) => name.endsWith('.yml'));

  it.each(files)('%s: PowerShell steps never use bash-style environment expansion', (file) => {
    const workflow = yaml.load(readFileSync(`${dir}/${file}`, 'utf8'));
    const offenders = [];
    for (const [jobId, job] of Object.entries(workflow.jobs ?? {})) {
      if (!job.steps) continue;
      const windows = runsOnWindows(job);
      const jobShell = job.defaults?.run?.shell;
      for (const step of job.steps) {
        if (typeof step.run !== 'string') continue;
        const shell = step.shell ?? jobShell ?? (windows ? 'pwsh' : 'bash');
        if (!/^(pwsh|powershell)/.test(shell)) continue;
        const names = bashStyleVariables(step.run);
        if (names.length > 0) offenders.push(`${jobId} / ${step.name ?? step.run.slice(0, 40)}: ${names.join(', ')}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('release.yml packages the shared matrix installer step with an explicit bash shell', () => {
    const workflow = yaml.load(readFileSync(`${dir}/release.yml`, 'utf8'));
    const step = workflow.jobs['build-installers'].steps.find((item) => /package-installer\.mjs/.test(item.run ?? ''));
    expect(step.shell).toBe('bash');
    expect(step.run).toContain('--image-tag "$RELEASE_IMAGE_REF"');
  });
});
