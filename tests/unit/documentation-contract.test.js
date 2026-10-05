import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const root = new URL('../../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

describe('foundation operator documentation contract', () => {
  it('provides linked English and Brazilian Portuguese setup and operations guides', async () => {
    const [english, portuguese] = await Promise.all([read('README.md'), read('README.pt-BR.md')]);
    expect(english).toContain('[Português brasileiro](README.pt-BR.md)');
    expect(portuguese).toContain('[English](README.md)');
    for (const term of ['Docker Compose', 'localhost:3000', 'logs', 'volume']) {
      expect(english.toLowerCase()).toContain(term.toLowerCase());
      expect(portuguese.toLowerCase()).toContain(term.toLowerCase());
    }
    for (const reference of ['Streamer.bot', 'PhantomBot', 'twitch-voxer']) {
      expect(english).toContain(reference);
      expect(portuguese).toContain(reference);
    }
  });

  it('documents version-scoped approximate hardware requirements and complete Windows HTTPS first run in both languages', async () => {
    const [english, portuguese] = await Promise.all([read('README.md'), read('README.pt-BR.md')]);
    for (const term of ['Approximate', 'CPU', 'RAM', 'GB', 'vary by release', 'Windows', 'WSL', 'wsl --version', 'Import-Certificate', 'https://localhost:3000/callback']) {
      expect(english.toLowerCase()).toContain(term.toLowerCase());
    }
    for (const term of ['aproximad', 'CPU', 'RAM', 'GB', 'variar por versão', 'Windows', 'WSL', 'wsl --version', 'Import-Certificate', 'https://localhost:3000/callback']) {
      expect(portuguese.toLowerCase()).toContain(term.toLowerCase());
    }
    expect(english).toContain('docs.docker.com/desktop/setup/install/windows-install/');
    expect(portuguese).toContain('docs.docker.com/desktop/setup/install/windows-install/');
    const instructions = await read('AGENTS.md');
    expect(instructions.toLowerCase()).toContain('documentacao e obrigatoria');
    expect(instructions.toLowerCase()).toContain('em ingles e pt-br');
    expect(instructions.toLowerCase()).toContain('antes de concluir story ou pr');
  });

  it('documents safe updater and interactive uninstall behavior in both languages', async () => {
    const [english, portuguese] = await Promise.all([read('README.md'), read('README.pt-BR.md')]);
    for (const term of ['atualizar.bat', 'atualizar.sh', 'on the `main` branch', 'clean Git checkout', 'desinstalar.bat', 'desinstalar.sh', 'type `APAGAR`', 'by default', 'docker compose down --volumes']) {
      expect(english.toLowerCase()).toContain(term.toLowerCase());
    }
    for (const term of ['atualizar.bat', 'atualizar.sh', 'branch `main`', 'cópia Git limpa', 'desinstalar.bat', 'desinstalar.sh', 'digite `APAGAR`', 'preservando por padrão', 'docker compose down --volumes']) {
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
    for (const term of ['getCustomRewards(broadcasterId, false)', 'channel:manage:redemptions', 'user:read:chat', 'user:write:chat', 'is_sent', 'durable worker creates paused rewards', 'editing/open-close/archive/delete remain pending']) {
      expect(english.toLowerCase()).toContain(term.toLowerCase());
    }
    expect(portuguese.toLowerCase()).toContain('getcustomrewards(broadcasterid, false)');
    expect(portuguese.toLowerCase()).toContain('channel:manage:redemptions');
    expect(portuguese.toLowerCase()).toContain('user:read:chat');
    expect(portuguese.toLowerCase()).toContain('user:write:chat');
    expect(portuguese.toLowerCase()).toContain('is_sent');
    expect(portuguese.toLowerCase()).toContain('worker durável usa');
    expect(portuguese.toLowerCase()).toContain('edição/abertura/fechamento/arquivamento/exclusão seguem pendentes');
  });
});
