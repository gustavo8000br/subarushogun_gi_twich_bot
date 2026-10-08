import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const html = await readFile(new URL('../../apps/web/index.html', import.meta.url), 'utf8');
const css = await readFile(new URL('../../apps/web/styles.css', import.meta.url), 'utf8');

describe('reward association dialog interaction contract', () => {
  it('uses an explicit close button that cannot submit the association form', () => {
    expect(html).toMatch(/<button[^>]*id="reward-dialog-close"[^>]*type="button"/);
  });

  it('gives the dialog responsive space and separates its actions', () => {
    expect(css).toMatch(/\.reward-dialog\s*\{[^}]*max-height:\s*min\(86vh/);
    expect(css).toMatch(/\.reward-dialog \.form-actions\s*\{[^}]*gap:\s*12px/);
    expect(css).toMatch(/\.reward-notice\s*\{[^}]*font-size:\s*14px/);
  });
});
