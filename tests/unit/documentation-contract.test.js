import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const root = new URL('../../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

describe('foundation operator documentation contract', () => {
  it('puts each shipping changelog version above its own entries in both languages', async () => {
    const [englishPublic, englishInternal, portuguesePublic, portugueseInternal] = await Promise.all([
      read('CHANGELOG.md'), read('CHANGELOG_INTERNAL.md'),
      read('docs/pt-BR/CHANGELOG.md'), read('docs/pt-BR/CHANGELOG_INTERNAL.md'),
    ]);

    for (const changelog of [englishPublic, englishInternal, portuguesePublic, portugueseInternal]) {
      expect(changelog.indexOf('## v0.4.0-alpha')).toBeGreaterThanOrEqual(0);
      expect(changelog.indexOf('## v0.3.0-alpha')).toBeGreaterThan(changelog.indexOf('## v0.4.0-alpha'));
    }
  });
  it('defines the owner-controlled per-PR version increment and release-stage policy in both languages', async () => {
    const [english, portuguese] = await Promise.all([
      read('docs/VERSIONING.md'), read('docs/pt-BR/VERSIONING.md'),
    ]);
    const englishPolicy = english.replaceAll('`', '');
    const portuguesePolicy = portuguese.replaceAll('`', '');
    expect(englishPolicy).toContain('Increment PATCH for a small fix or documentation-only change.');
    expect(englishPolicy).toContain('Increment MINOR for a new feature, a large implementation, or a complex fix.');
    expect(englishPolicy).toContain('Increment MAJOR only for a major product change');
    expect(englishPolicy).toContain('Only the product owner may change the release stage.');
    expect(portuguesePolicy).toContain('Incremente PATCH para uma correção pequena ou mudança somente documental.');
    expect(portuguesePolicy).toContain('Incremente MINOR para uma funcionalidade nova, implementação grande ou correção complexa.');
    expect(portuguesePolicy).toContain('Incremente MAJOR somente para uma mudança significativa do produto');
    expect(portuguesePolicy).toContain('Somente o proprietário do produto decide quando avançar o estágio.');
  });

  it('requires DevOps to update the linked issue after publishing a completed story', async () => {
    const instructions = await read('AGENTS.md');
    expect(instructions).toContain('O @devops atualiza o corpo e o status da issue correspondente quando publicar uma story marcada como Done por PR');
    expect(instructions).toContain('comentários só são publicados se forem necessários');
  });

  it('keeps public changelogs concise and readable without implementation jargon in both languages', async () => {
    const [english, portuguese] = await Promise.all([
      read('CHANGELOG.md'), read('docs/pt-BR/CHANGELOG.md'),
    ]);
    const technicalTerms = /advisory lock|outbox|retry-after|qemu|prisma|opengrep|ghcr|linux\/amd64|linux\/arm64|959\s*mb|musl|endpoint|ci quality gates|identidade runtime|identidade de runtime|backoff|worker durável/i;
    for (const document of [english, portuguese]) {
      expect(document).not.toMatch(technicalTerms);
      expect(document).toContain('v0.3.0-alpha');
      expect(document).toContain('v0.2.0-alpha');
      expect(document).toContain('v0.1.0-3e0c935-alpha');
      const releaseSections = document.split(/^## /m).slice(1);
      for (const section of releaseSections) {
        const bulletCount = section.split('\n').filter((line) => /^-\s/.test(line)).length;
        expect(bulletCount).toBeLessThanOrEqual(5);
        expect(section.split('\n').filter((line) => /^-\s/.test(line)).join(' ')).not.toMatch(/\b(API|CI|SDK|UID|PostgreSQL|HTTPS|OAuth|Twitch Helix)\b/i);
      }
    }
    expect(english.toLowerCase()).toContain('streamer');
    expect(portuguese.toLowerCase()).toContain('streamer');
  });

  it('provides linked English and Brazilian Portuguese setup and operations guides', async () => {
    const [english, portuguese, englishGuide, portugueseGuide, englishUse, portugueseUse] = await Promise.all([
      read('README.md'), read('README.pt-BR.md'),
      read('docs/INSTALLATION.md'), read('docs/pt-BR/INSTALACAO.md'),
      read('docs/USER_GUIDE-en_US.md'), read('docs/MANUAL_DE_USUARIO-pt_BR.md'),
    ]);
    expect(english).toContain('[Português brasileiro](README.pt-BR.md)');
    expect(portuguese).toContain('[English](README.md)');
    expect(english).toContain('docs/INSTALLATION.md');
    expect(portuguese).toContain('docs/pt-BR/INSTALACAO.md');
    expect(englishUse).toContain('[Leia em português brasileiro](MANUAL_DE_USUARIO-pt_BR.md)');
    expect(portugueseUse).toContain('[Read in English](USER_GUIDE-en_US.md)');
    for (const [document, terms] of [
      [englishGuide, ['Docker Compose', 'localhost:3000', 'volume']],
      [portugueseGuide, ['Docker Compose', 'localhost:3000', 'volume']],
      [englishUse, ['stop', 'update']],
      [portugueseUse, ['stop', 'atualizador']],
    ]) {
      for (const term of terms) expect(document.toLowerCase()).toContain(term.toLowerCase());
    }
    const [englishResearch, portugueseResearch] = await Promise.all([
      read('docs/stories/FND-6/ux-research.md'), read('docs/pt-BR/stories/FND-6/ux-research.md'),
    ]);
    for (const reference of ['Streamer.bot', 'StreamElements', 'Twitch Channel Points']) {
      expect(englishResearch).toContain(reference);
      expect(portugueseResearch).toContain(reference);
    }
  });

  it('documents version-scoped approximate hardware requirements and complete Windows HTTPS first run in both languages', async () => {
    const [english, portuguese] = await Promise.all([read('docs/INSTALLATION.md'), read('docs/pt-BR/INSTALACAO.md')]);
    for (const term of ['Approximate', 'CPU', 'memory', 'GB', 'change between versions', 'Windows', 'WSL', 'wsl --version', 'Import-Certificate', 'https://localhost:3000/callback']) {
      expect(english.toLowerCase()).toContain(term.toLowerCase());
    }
    for (const term of ['aproximad', 'CPU', 'memória', 'GB', 'mudar entre versões', 'Windows', 'WSL', 'wsl --version', 'Import-Certificate', 'https://localhost:3000/callback']) {
      expect(portuguese.toLowerCase()).toContain(term.toLowerCase());
    }
    expect(english).toContain('docs.docker.com/desktop/setup/install/windows-install/');
    expect(portuguese).toContain('docs.docker.com/desktop/setup/install/windows-install/');
    const instructions = await read('AGENTS.md');
    expect(instructions.toLowerCase()).toContain('documentacao e obrigatoria');
    expect(instructions.toLowerCase()).toContain('em ingles e pt-br');
    expect(instructions.toLowerCase()).toContain('antes de concluir story ou pr');
  });

  it('documents Linux and macOS executable permissions before first start in both languages', async () => {
    const [english, portuguese] = await Promise.all([read('docs/INSTALLATION.md'), read('docs/pt-BR/INSTALACAO.md')]);
    for (const document of [english, portuguese]) {
      expect(document).toContain('chmod +x subarushogun_twich_bot_setup.sh');
      expect(document).toMatch(/### macOS/);
      expect(document).toContain('./subarushogun_twich_bot_setup.sh');
      expect(document).toContain('Docker Desktop');
      expect(document).toContain('security add-trusted-cert');
    }
  });

  it('documents safe updater and interactive uninstall behavior in both languages', async () => {
    const [english, portuguese] = await Promise.all([read('docs/USER_GUIDE-en_US.md'), read('docs/MANUAL_DE_USUARIO-pt_BR.md')]);
    for (const term of ['subarushogun_twich_bot_update.bat', 'subarushogun_twich_bot_update.sh', '`main` branch', 'clean Git checkout', 'subarushogun_twich_bot_uninstall.bat', 'subarushogun_twich_bot_uninstall.sh', 'asks whether to keep or delete', 'docker compose down']) {
      expect(english.toLowerCase()).toContain(term.toLowerCase());
    }
    for (const term of ['subarushogun_twich_bot_update.bat', 'subarushogun_twich_bot_update.sh', 'main', 'alterações locais', 'subarushogun_twich_bot_uninstall.bat', 'subarushogun_twich_bot_uninstall.sh', 'pergunta se deve manter ou apagar', 'docker compose down']) {
      expect(portuguese.toLowerCase()).toContain(term.toLowerCase());
    }
  });

  it('documents checked Twitch SDK operations, scopes, versions and consultation date in both languages', async () => {
    const [english, portuguese] = await Promise.all([
      read('docs/integrations.md'), read('docs/pt-BR/integrations.md'),
    ]);
    expect(english).toContain('[Português brasileiro](pt-BR/integrations.md)');
    expect(portuguese).toContain('[English](../integrations.md)');
    expect(english).toMatch(/\*\*Documentation checked:\*\*\s*\d{4}-\d{2}-\d{2}/);
    expect(portuguese).toMatch(/\*\*Documentação consultada:\*\*\s*\d{4}-\d{2}-\d{2}/);
    for (const term of ['getCustomRewards(broadcasterId, false)', 'channel:manage:redemptions', 'user:read:chat', 'user:write:chat', 'is_sent', 'queue creation durably requests a paused twitch reward']) {
      expect(english.toLowerCase()).toContain(term.toLowerCase());
    }
    expect(portuguese.toLowerCase()).toContain('getcustomrewards(broadcasterid, false)');
    expect(portuguese.toLowerCase()).toContain('channel:manage:redemptions');
    expect(portuguese.toLowerCase()).toContain('user:read:chat');
    expect(portuguese.toLowerCase()).toContain('user:write:chat');
    expect(portuguese.toLowerCase()).toContain('is_sent');
    expect(portuguese.toLowerCase()).toContain('criar uma fila registra duravelmente a solicitação de recompensa twitch pausada');
  });
});
