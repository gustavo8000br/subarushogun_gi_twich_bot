import Fastify from 'fastify';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { registerLocalSession } from '../../apps/api/src/http/local-session.mjs';
import { registerLocalizationRoutes } from '../../apps/api/src/http/localization-routes.mjs';

const roots = [];
const baseCatalogs = {
  'pt-BR': 'translation.unavailable\tTexto do produto indisponível.\nsetup.title\tConfigurar canal\nsetup.callback.success_message\tO canal {channel} está autorizado para esta instalação.\nsetup.callback.return_message\tRetorno em {seconds} segundos.\n',
  en: 'translation.unavailable\tProduct text unavailable.\nsetup.title\tConnect channel\nsetup.callback.success_message\tThe channel {channel} is authorized for this installation.\nsetup.callback.return_message\tReturn in {seconds} seconds.\n',
  es: 'translation.unavailable\tTexto no disponible.\nsetup.title\tConectar canal\nsetup.callback.success_message\tEl canal {channel} está autorizado para esta instalación.\nsetup.callback.return_message\tVolver en {seconds} segundos.\n',
};
const chatCatalogs = {
  'pt-BR': 'translation.unavailable\tTexto do produto indisponível.\nchat.account.current\tConta atual: {label}.\nchat.ping.response\tPong · {version} · {latency}\nchat.queue.position\t@{user}: {position}\nchat.queue.viewer_called\t@{user} chamado\nchat.queue.viewer_in_progress\t@{user} em atendimento\nchat.queue.more.one\t e mais {count}\nchat.queue.more.many\t e mais {count}\nchat.queue.more.other\t e mais {count}\nchat.queue.called_many.one\t{count} chamado\nchat.queue.called_many.many\t{count} chamados\nchat.queue.called_many.other\t{count} chamados\nchat.queue.added\t@{user} adicionado\nchat.queue.clear_confirm\t!{queue} {clear_command} {confirm_command} {count} {refunds}\nchat.queue.clear_done\t{count} {refunds}\n',
  en: 'translation.unavailable\tProduct text unavailable.\nchat.account.current\tCurrent account: {label}.\nchat.ping.response\tPong · {version} · {latency}\nchat.queue.position\t@{user}: {position}\nchat.queue.viewer_called\t@{user} called\nchat.queue.viewer_in_progress\t@{user} in service\nchat.queue.more.one\t and {count} more\nchat.queue.more.other\t and {count} more\nchat.queue.called_many.one\t{count} called\nchat.queue.called_many.other\t{count} called\nchat.queue.added\t@{user} added\nchat.queue.clear_confirm\t!{queue} {clear_command} {confirm_command} {count} {refunds}\nchat.queue.clear_done\t{count} {refunds}\n',
  es: 'translation.unavailable\tTexto no disponible.\nchat.account.current\tCuenta actual: {label}.\nchat.ping.response\tPong · {version} · {latency}\nchat.queue.position\t@{user}: {position}\nchat.queue.viewer_called\t@{user} llamado\nchat.queue.viewer_in_progress\t@{user} en atención\nchat.queue.more.one\t y {count} más\nchat.queue.more.many\t y {count} más\nchat.queue.more.other\t y {count} más\nchat.queue.called_many.one\t{count} llamados\nchat.queue.called_many.many\t{count} llamados\nchat.queue.called_many.other\t{count} llamados\nchat.queue.added\t@{user} agregado\nchat.queue.clear_confirm\t!{queue} {clear_command} {confirm_command} {count} {refunds}\nchat.queue.clear_done\t{count} {refunds}\n',
};

async function createCatalogRoot() {
  const root = await mkdtemp(join(tmpdir(), 'queuebot-catalog-route-'));
  roots.push(root);
  for (const moduleName of ['setup', 'chat']) {
    const moduleRoot = join(root, moduleName);
    await mkdir(moduleRoot);
    const catalogs = moduleName === 'chat' ? chatCatalogs : baseCatalogs;
    await Promise.all(Object.entries(catalogs).map(([locale, contents]) => (
      writeFile(join(moduleRoot, `${locale}.tsv`), contents)
    )));
  }
  return root;
}

async function createApp(catalogRoot, repository = {}, writeHostProjection = async () => undefined) {
  const app = Fastify();
  registerLocalSession(app, { port: 3000, secure: false });
  registerLocalizationRoutes(app, { catalogRoot, repository, writeHostProjection });
  const session = await app.inject({ method: 'GET', url: '/api/session', headers: { host: 'localhost:3000' } });
  const cookie = session.cookies[0];
  const sessionHeaders = { host: 'localhost:3000', cookie: `${cookie.name}=${cookie.value}` };
  const headers = { ...sessionHeaders, origin: 'https://localhost:3000', 'x-csrf-token': session.json().csrfToken };
  return { app, headers, sessionHeaders };
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('localization catalog API', () => {
  it('requires the local panel session and returns only complete product catalogs', async () => {
    const root = await createCatalogRoot();
    const { app, headers } = await createApp(root);

    const denied = await app.inject({ method: 'GET', url: '/api/localization/catalogs', headers: { host: 'localhost:3000' } });
    expect(denied.statusCode).toBe(401);

    const response = await app.inject({ method: 'GET', url: '/api/localization/catalogs', headers });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      locales: ['en', 'es', 'pt-BR'],
      modules: { setup: { catalogs: { en: { 'setup.title': 'Connect channel' } } } },
    });
    expect(response.headers['cache-control']).toContain('no-store');
    await app.close();
  });

  it('detects and interprets a complete community locale file added while the panel is running', async () => {
    const root = await createCatalogRoot();
    const { app, headers } = await createApp(root);
    const before = await app.inject({ method: 'GET', url: '/api/localization/catalogs', headers });
    expect(before.json().locales).not.toContain('de');

    const germanSetup = 'translation.unavailable\tProdukttext nicht verfügbar.\nsetup.title\tKanal verbinden\nsetup.callback.success_message\tKanal {channel}\nsetup.callback.return_message\tZurück in {seconds}\n';
    const germanChat = 'translation.unavailable\tProdukttext nicht verfügbar.\nchat.account.current\tAktuelles Konto: {label}.\nchat.ping.response\tPong · {version} · {latency}\nchat.queue.position\t@{user}: {position}\nchat.queue.viewer_called\t@{user} gerufen\nchat.queue.viewer_in_progress\t@{user} im Dienst\nchat.queue.more.one\t und {count} weitere\nchat.queue.more.other\t und {count} weitere\nchat.queue.called_many.one\t{count} gerufen\nchat.queue.called_many.other\t{count} gerufen\nchat.queue.added\t@{user} hinzugefügt\nchat.queue.clear_confirm\t!{queue} {clear_command} {confirm_command} {count} {refunds}\nchat.queue.clear_done\t{count} {refunds}\n';
    await Promise.all([
      writeFile(join(root, 'setup', 'de.tsv'), germanSetup),
      writeFile(join(root, 'chat', 'de.tsv'), germanChat),
    ]);

    const after = await app.inject({ method: 'GET', url: '/api/localization/catalogs', headers });
    expect(after.statusCode).toBe(200);
    expect(after.json().locales).toContain('de');
    expect(after.json().modules.setup.catalogs.de['setup.title']).toBe('Kanal verbinden');
    await app.close();
  });

  it('does not expose filesystem errors or catalog paths when files are invalid', async () => {
    const root = await createCatalogRoot();
    await writeFile(join(root, 'chat', 'en.tsv'), 'invalid absolute path /srv/private/catalog.tsv');
    const { app, headers } = await createApp(root);
    const response = await app.inject({ method: 'GET', url: '/api/localization/catalogs', headers });
    expect(response.statusCode).toBe(503);
    expect(response.body).not.toContain(root);
    expect(response.body).not.toContain('/srv/private/catalog.tsv');
    await app.close();
  });

  it('changes the persistent locale only to a locale in the complete discovered catalog bundle', async () => {
    const root = await createCatalogRoot();
    const repository = { setProductLocale: vi.fn(async ({ locale }) => ({ locale, revision: 2 })) };
    const { app, headers, sessionHeaders } = await createApp(root, repository);

    const denied = await app.inject({ method: 'PATCH', url: '/api/localization/locale', headers: sessionHeaders, payload: { locale: 'en', expectedRevision: 1 } });
    expect(denied.statusCode).toBe(403);

    const invalid = await app.inject({ method: 'PATCH', url: '/api/localization/locale', headers, payload: { locale: 'de', expectedRevision: 1 } });
    expect(invalid.statusCode).toBe(400);
    expect(repository.setProductLocale).not.toHaveBeenCalled();

    const changed = await app.inject({ method: 'PATCH', url: '/api/localization/locale', headers, payload: { locale: 'en', expectedRevision: 1 } });
    expect(changed.statusCode).toBe(200);
    expect(changed.json()).toEqual({ locale: 'en', revision: 2 });
    expect(repository.setProductLocale).toHaveBeenCalledWith({ locale: 'en', expectedRevision: 1, actorId: expect.any(String) });
    await app.close();
  });

  it('returns a conflict when another panel request already changed the locale revision', async () => {
    const root = await createCatalogRoot();
    const repository = { setProductLocale: vi.fn(async () => { throw Object.assign(new Error('stale'), { code: 'PRODUCT_LOCALE_VERSION_CONFLICT' }); }) };
    const { app, headers } = await createApp(root, repository);
    const response = await app.inject({ method: 'PATCH', url: '/api/localization/locale', headers, payload: { locale: 'es', expectedRevision: 1 } });
    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ code: 'PRODUCT_LOCALE_VERSION_CONFLICT' });
    expect(response.body).not.toContain('stale');
    await app.close();
  });

  it('writes the successful database locale revision to the host projection after commit', async () => {
    const root = await createCatalogRoot();
    const repository = { setProductLocale: vi.fn(async ({ locale }) => ({ locale, revision: 8 })) };
    const writeHostProjection = vi.fn(async () => undefined);
    const { app, headers } = await createApp(root, repository, writeHostProjection);
    const response = await app.inject({ method: 'PATCH', url: '/api/localization/locale', headers, payload: { locale: 'en', expectedRevision: 7 } });
    expect(response.statusCode).toBe(200);
    expect(writeHostProjection).toHaveBeenCalledWith({ locale: 'en', revision: 8 });
    await app.close();
  });
});
