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
      [portugueseUse, ['parar', 'atualizar']],
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
      expect(document).toContain('sh "$HOME/Downloads/subarushogun_twich_bot_setup.sh"');
      expect(document).toContain('chmod +x subarushogun_twich_bot_setup.sh');
      expect(document).toMatch(/### macOS/);
      expect(document).toContain('./subarushogun_twich_bot_setup.sh');
      expect(document).toContain('subarushogun_twich_bot_setup.command');
      expect(document).toContain('subarushogun_twich_bot_setup.bat');
      expect(document).toContain('Docker Desktop');
      expect(document).toContain('security add-trusted-cert');
    }
  });

  it('documents the single-file lifecycle menu and safe data choices in both languages', async () => {
    const [english, portuguese] = await Promise.all([read('docs/USER_GUIDE-en_US.md'), read('docs/MANUAL_DE_USUARIO-pt_BR.md')]);
    for (const term of ['subarushogun_twich_bot_setup.bat', 'subarushogun_twich_bot_setup.command', 'subarushogun_twich_bot_setup.sh', 'Update', 'Uninstall', 'asks whether to keep or erase', 'shared host dependencies remain installed']) {
      expect(english.toLowerCase()).toContain(term.toLowerCase());
    }
    for (const term of ['subarushogun_twich_bot_setup.bat', 'subarushogun_twich_bot_setup.command', 'subarushogun_twich_bot_setup.sh', 'atualizar', 'desinstalar', 'manter ou apagar', 'continuam instaladas']) {
      expect(portuguese.toLowerCase()).toContain(term.toLowerCase());
    }
  });

  it('uses GitHub Releases as the end-user installer download path', async () => {
    const [englishReadme, portugueseReadme, englishInstallers, portugueseInstallers, englishVersions, portugueseVersions] = await Promise.all([
      read('README.md'), read('README.pt-BR.md'), read('docs/INSTALLERS.md'), read('docs/pt-BR/INSTALADORES.md'),
      read('docs/VERSIONING.md'), read('docs/pt-BR/VERSIONING.md'),
    ]);
    expect(englishReadme).toContain('docs/INSTALLERS.md');
    expect(portugueseReadme).toContain('docs/pt-BR/INSTALADORES.md');
    expect(englishInstallers).toContain('[Português brasileiro](pt-BR/INSTALADORES.md)');
    expect(portugueseInstallers).toContain('[English](../INSTALLERS.md)');
    for (const name of ['subarushogun_twich_bot_setup.bat', 'subarushogun_twich_bot_setup.command', 'subarushogun_twich_bot_setup.sh']) {
      expect(englishInstallers).toContain(name);
      expect(portugueseInstallers).toContain(name);
    }
    for (const term of ['Install / Start', 'Update', 'Uninstall']) expect(englishInstallers).toContain(term);
    for (const term of ['Instalar / Iniciar', 'Atualizar', 'Desinstalar']) expect(portugueseInstallers).toContain(term);
    expect(englishInstallers).toContain('image matching its release identity');
    expect(portugueseInstallers).toContain('imagem GHCR correspondente à identidade da própria release');
    expect(englishVersions).toContain('Each attached installer embeds the full release identity and the verified GHCR manifest digest');
    expect(portugueseVersions).toContain('Cada instalador anexado incorpora a identidade completa da release e o digest do manifest GHCR validado');
    expect(englishVersions).toContain('<version>@sha256:<digest>');
    expect(portugueseVersions).toContain('<versão>@sha256:<digest>');
    for (const guide of [englishInstallers, portugueseInstallers]) {
      expect(guide.toLowerCase()).toContain('/releases');
      expect(guide.toLowerCase()).toContain('fnd-9');
      expect(guide.toLowerCase()).toContain('changelog');
      expect(guide.toLowerCase()).not.toContain('actions → ci');
      expect(guide.toLowerCase()).toMatch(/first canonical beta|primeira beta canônica/);
      expect(guide.toLowerCase()).toMatch(/matching version sections|seções correspondentes/);
      expect(guide).toContain('CHANGELOG.md');
      expect(guide).toContain('docs/pt-BR/CHANGELOG.md');
    }
    for (const document of [englishReadme, portugueseReadme, englishInstallers, portugueseInstallers]) {
      expect(document).not.toContain('subarushogun_twich_bot_installer');
      expect(document).not.toContain('queue-bot-installer-');
    }
    for (const document of [englishReadme, portugueseReadme, englishInstallers, portugueseInstallers]) {
      expect(document.toLowerCase()).not.toContain('latest successful ci run');
      expect(document.toLowerCase()).not.toContain('workflow-artifact');
    }
  });

  it('labels initial Greenfield planning as historical and keeps later story candidates bilingual', async () => {
    const [englishPlanning, portuguesePlanning, englishRoadmap, portugueseRoadmap] = await Promise.all([
      read('docs/planning-validation.md'), read('docs/pt-BR/planning-validation.md'),
      read('docs/ROADMAP.md'), read('docs/pt-BR/ROADMAP.md'),
    ]);
    expect(englishPlanning).toContain('Historical planning record');
    expect(portuguesePlanning).toContain('Registro histórico de planejamento');
    expect(englishRoadmap.toLowerCase()).toContain('eventsub');
    expect(englishRoadmap.toLowerCase()).toContain('screenshots');
    expect(englishRoadmap.toLowerCase()).toContain('not scoped stories or issues');
    expect(portugueseRoadmap.toLowerCase()).toContain('eventsub');
    expect(portugueseRoadmap.toLowerCase()).toContain('capturas de tela');
    expect(portugueseRoadmap.toLowerCase()).toContain('ainda não são stories ou issues refinadas');
  });

  it('tells Linux users how to launch the standalone release file without extracting an Actions artifact', async () => {
    const [english, portuguese, englishGuide, portugueseGuide, englishInstallerGuide, portugueseInstallerGuide] = await Promise.all([
      read('README.md'), read('README.pt-BR.md'), read('docs/INSTALLATION.md'), read('docs/pt-BR/INSTALACAO.md'),
      read('docs/INSTALLERS.md'), read('docs/pt-BR/INSTALADORES.md'),
    ]);
    expect(english.toLowerCase()).toContain('github releases');
    expect(english.toLowerCase()).toContain('download the installer for your system');
    expect(english.toLowerCase()).toContain('installer download guide');
    expect(portuguese.toLowerCase()).toContain('github releases');
    expect(portuguese.toLowerCase()).toContain('baixe o instalador do seu sistema');
    expect(portuguese.toLowerCase()).toContain('guia de download do instalador');
    expect(englishGuide).toContain('subarushogun_twich_bot_setup.sh');
    expect(portugueseGuide).toContain('subarushogun_twich_bot_setup.sh');
    expect(englishGuide).toContain('GitHub Releases');
    expect(portugueseGuide).toContain('GitHub Releases');
    expect(englishGuide).toContain('sh "$HOME/Downloads/subarushogun_twich_bot_setup.sh"');
    expect(portugueseGuide).toContain('sh "$HOME/Downloads/subarushogun_twich_bot_setup.sh"');
    for (const guide of [englishInstallerGuide, portugueseInstallerGuide]) {
      expect(guide).toContain('subarushogun_twich_bot_setup.sh');
      expect(guide.toLowerCase()).toMatch(/releases do github|github releases/);
    }
  });

  it('keeps lifecycle instructions aligned around one unified per-platform artifact', async () => {
    const documents = await Promise.all([
      read('docs/INSTALLATION.md'), read('docs/pt-BR/INSTALACAO.md'),
      read('docs/INSTALLERS.md'), read('docs/pt-BR/INSTALADORES.md'), read('docs/USER_GUIDE-en_US.md'),
      read('docs/MANUAL_DE_USUARIO-pt_BR.md'),
    ]);
    for (const document of documents) {
      expect(document).toContain('subarushogun_twich_bot_setup.bat');
      expect(document).toContain('subarushogun_twich_bot_setup.command');
      expect(document).toContain('subarushogun_twich_bot_setup.sh');
      expect(document).not.toContain('subarushogun_twich_bot_update');
      expect(document).not.toContain('subarushogun_twich_bot_uninstall');
    }
  });

  it('documents the public repository without assuming the GHCR package is public', async () => {
    const [englishReadme, portugueseReadme, englishContributing, portugueseContributing,
      englishInstallation, portugueseInstallation, englishInstallers, portugueseInstallers,
      englishIntegrations, portugueseIntegrations] = await Promise.all([
      read('README.md'), read('README.pt-BR.md'), read('docs/CONTRIBUTING.md'), read('docs/pt-BR/CONTRIBUICAO.md'),
      read('docs/INSTALLATION.md'), read('docs/pt-BR/INSTALACAO.md'), read('docs/INSTALLERS.md'), read('docs/pt-BR/INSTALADORES.md'),
      read('docs/integrations.md'), read('docs/pt-BR/integrations.md'),
    ]);
    for (const document of [englishReadme, portugueseReadme, englishContributing, portugueseContributing, englishInstallation, portugueseInstallation, englishInstallers, portugueseInstallers]) {
      expect(document.toLowerCase()).not.toMatch(/repository is private|private repository|repositório (está )?privado|repositório privado/);
    }
    expect(englishInstallation.toLowerCase()).toContain('the ghcr image package is currently private');
    expect(portugueseInstallation.toLowerCase()).toContain('o pacote de imagem ghcr está privado neste momento');
    expect(englishInstallers.toLowerCase()).toContain('the package must be made public');
    expect(portugueseInstallers.toLowerCase()).toContain('o pacote deve ser tornado público');
    for (const document of [englishIntegrations, portugueseIntegrations]) {
      expect(document.toLowerCase()).toMatch(/(source repository|repositório-fonte).{0,100}(public|público)/);
      expect(document).toContain('HTTP 403');
    }
  });

  it('documents the FND-9-gated first beta and changelog-derived bilingual release notes', async () => {
    const [english, portuguese] = await Promise.all([read('docs/VERSIONING.md'), read('docs/pt-BR/VERSIONING.md')]);
    expect(english).toContain('first canonical public beta');
    expect(english).toContain('after FND-9');
    expect(english).toContain('matching version section in both `CHANGELOG.md` and `docs/pt-BR/CHANGELOG.md`');
    expect(english).toContain('Tags and releases are created exclusively by `@devops`');
    expect(portuguese).toContain('primeira beta pública canônica');
    expect(portuguese).toContain('depois de concluir a FND-9');
    expect(portuguese).toContain('`CHANGELOG.md` e `docs/pt-BR/CHANGELOG.md`');
    expect(portuguese).toContain('Somente `@devops` cria tags e releases');
  });

  it('separates end-user runtime estimates from developer image-build requirements in both installation guides', async () => {
    const [english, portuguese] = await Promise.all([read('docs/INSTALLATION.md'), read('docs/pt-BR/INSTALACAO.md')]);
    expect(english).toContain('pulls a prebuilt image');
    expect(english).toContain('Local image builds are only needed for development');
    expect(english).not.toContain('during the first image build');
    expect(portuguese).toContain('baixa uma imagem pré-construída');
    expect(portuguese).toContain('Compilar a imagem localmente é necessário apenas para desenvolvimento');
    expect(portuguese).not.toContain('no primeiro build');
  });

  it('documents checked Twitch SDK operations, scopes, versions and consultation date in both languages', async () => {
    const [english, portuguese] = await Promise.all([
      read('docs/integrations.md'), read('docs/pt-BR/integrations.md'),
    ]);
    expect(english).toContain('[Português brasileiro](pt-BR/integrations.md)');
    expect(portuguese).toContain('[English](../integrations.md)');
    expect(english).toMatch(/\*\*Documentation checked:\*\*\s*\d{4}-\d{2}-\d{2}/);
    expect(portuguese).toMatch(/\*\*Documentação consultada:\*\*\s*\d{4}-\d{2}-\d{2}/);
    for (const term of ['getCustomRewards(broadcasterId, false)', 'channel:manage:redemptions', 'user:read:chat', 'user:write:chat', 'is_sent', 'is_in_stock', 'Twurple 8.2.0']) {
      expect(english.toLowerCase()).toContain(term.toLowerCase());
    }
    expect(portuguese.toLowerCase()).toContain('getcustomrewards(broadcasterid, false)');
    expect(portuguese.toLowerCase()).toContain('channel:manage:redemptions');
    expect(portuguese.toLowerCase()).toContain('user:read:chat');
    expect(portuguese.toLowerCase()).toContain('user:write:chat');
    expect(portuguese.toLowerCase()).toContain('is_sent');
    expect(portuguese.toLowerCase()).toContain('is_in_stock');
    expect(portuguese.toLowerCase()).toContain('twurple 8.2.0');
    expect(english).toContain('updateCustomReward');
    expect(english).toContain('not an update request field');
    expect(portuguese.toLowerCase()).toContain('updatecustomreward');
    expect(portuguese.toLowerCase()).toContain('não aceita esse campo no corpo de atualização');
    expect(portuguese.toLowerCase()).not.toContain('captura/restauração do estoque twitch');
  });
});
