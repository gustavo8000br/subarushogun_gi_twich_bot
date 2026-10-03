import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = new URL('../../', import.meta.url);
const packagePath = fileURLToPath(new URL('package.json', root));

describe('free local source review configuration', () => {
  it('disables the paid CodeRabbit gate and defines local OpenGrep rules', () => {
    const qualityConfig = readFileSync(fileURLToPath(new URL('.aiox-core/core/quality-gates/quality-gate-config.yaml', root)), 'utf8');
    const rules = readFileSync(fileURLToPath(new URL('.opengrep/rules.yml', root)), 'utf8');
    const devAgent = readFileSync(fileURLToPath(new URL('.aiox-core/development/agents/dev.md', root)), 'utf8');
    const { scripts } = JSON.parse(readFileSync(packagePath, 'utf8'));

    expect(qualityConfig).toMatch(/coderabbit:\s*\n\s+enabled:\s+false/);
    expect(qualityConfig).toContain('opengrep:\n    enabled: true\n    command: "npm run review:static"');
    expect(qualityConfig).not.toContain('cli_path: ~/.local/bin/coderabbit');
    expect(devAgent).toContain('command: npm run review:static');
    expect(devAgent).not.toMatch(/coderabbit_integration:\s*\n\s+enabled:\s+true/);
    expect(rules).toContain('id: no-unsafe-html-sink');
    expect(rules).toContain('id: no-credential-logging');
    expect(rules).toContain('languages: [javascript]');
    expect(scripts['review:static']).toBe('opengrep scan --config .opengrep/rules.yml --no-git-ignore apps');
  });
});
