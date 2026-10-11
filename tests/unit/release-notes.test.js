import { describe, expect, it } from 'vitest';
import { createReleaseNotes, getChangelogHeading, getChangelogPaths } from '../../apps/infra/scripts/create-release-notes.mjs';

describe('release notes from bilingual public changelogs', () => {
  it('maps a materialized runtime identity to its matching bilingual changelog sections', () => {
    const english = '# Changelog\n\n## v1.0.0-beta\n\n- Queue improvements.\n\n## v0.9.0-alpha\n\n- Older change.\n';
    const portuguese = '# Histórico\n\n## v1.0.0-beta\n\n- Melhorias nas filas.\n\n## v0.9.0-alpha\n\n- Mudança antiga.\n';

    expect(getChangelogHeading('v1.0.0-a1b2c3d-beta')).toBe('v1.0.0-beta');
    expect(getChangelogPaths('v1.0.0-a1b2c3d-beta')).toEqual({
      english: 'CHANGELOG-beta.md',
      portuguese: 'docs/pt-BR/CHANGELOG-beta.md',
    });
    expect(getChangelogPaths('v1.0.0-a1b2c3d-stable')).toEqual({
      english: 'CHANGELOG-stable.md',
      portuguese: 'docs/pt-BR/CHANGELOG-stable.md',
    });
    expect(createReleaseNotes({ version: 'v1.0.0-a1b2c3d-beta', english, portuguese })).toBe([
      '# v1.0.0-a1b2c3d-beta',
      '',
      '## English',
      '',
      '- Queue improvements.',
      '',
      '## Português brasileiro',
      '',
      '- Melhorias nas filas.',
      '',
    ].join('\n'));
  });

  it('rejects malformed identities instead of guessing a changelog section', () => {
    expect(() => getChangelogHeading('v1.0.0-abcdef-alpha')).toThrow(/seven hexadecimal characters/i);
    expect(() => getChangelogHeading('v1.0.0-a1b2c3d-preview')).toThrow(/release identity/i);
    for (const stage of ['alpha', 'beta', 'rc', 'stable']) {
      const paths = getChangelogPaths(`v1.0.0-a1b2c3d-${stage}`);
      expect(paths.english).toBe(`CHANGELOG-${stage}.md`);
      expect(paths.portuguese).toBe(`docs/pt-BR/CHANGELOG-${stage}.md`);
    }
  });

  it('fails when either public-language changelog has no matching release section', () => {
    expect(() => createReleaseNotes({
      version: 'v1.0.0-a1b2c3d-beta',
      english: '# Changelog\n\n## v1.0.0-beta\n\n- English change.\n',
      portuguese: '# Histórico\n\n## v0.9.0-beta\n\n- Mudança antiga.\n',
    })).toThrow(/matching section.*Português brasileiro/i);
  });
});
