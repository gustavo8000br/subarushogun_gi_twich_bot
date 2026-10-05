import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = new URL('../../', import.meta.url);

describe('AIOX OpenGrep quality-gate contract', () => {
  it('uses one enabled local scan command and excludes automatic code changes', () => {
    const config = readFileSync(fileURLToPath(new URL('.aiox-core/core/quality-gates/quality-gate-config.yaml', root)), 'utf8');
    const projectConfig = JSON.parse(readFileSync(fileURLToPath(new URL('.aiox-core/core/config/schemas/project-config.schema.json', root)), 'utf8'));
    const storyTemplate = readFileSync(fileURLToPath(new URL('.aiox-core/product/templates/story-tmpl.yaml', root)), 'utf8');
    const scannerTemplate = readFileSync(fileURLToPath(new URL('.aiox-core/infrastructure/templates/opengrep.yaml.template', root)), 'utf8');
    const packageJson = JSON.parse(readFileSync(fileURLToPath(new URL('package.json', root)), 'utf8'));

    expect(config.match(/^ {2}opengrep:$/gm)).toHaveLength(1);
    expect(config).toContain('command: "npm run review:static"');
    expect(projectConfig.properties.static_review.properties.command.type).toBe('string');
    expect(projectConfig.properties.static_review.properties).not.toHaveProperty('self_healing');
    expect(storyTemplate).toContain('the scanner does not modify files');
    expect(storyTemplate).not.toContain('auto_fix');
    expect(scannerTemplate).toContain('rules:');
    expect(scannerTemplate).toContain('id: no-unsafe-html-sink');
    expect(scannerTemplate).not.toContain('auto_review:');
    expect(packageJson.scripts['review:static']).toContain('--error');
  });
});
