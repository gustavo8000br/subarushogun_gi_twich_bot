import Fastify from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { registerWebRoutes } from '../../apps/api/src/web-route.mjs';

const webRoot = fileURLToPath(new URL('../../apps/web/', import.meta.url));
const sharedRoot = fileURLToPath(new URL('../../apps/shared/browser/', import.meta.url));
const applications = [];

afterEach(async () => {
  await Promise.all(applications.splice(0).map((app) => app.close()));
});

describe('local web entrypoint', () => {
  it('serves only shared localization ESM from the browser module prefix', async () => {
    const app = Fastify({ logger: false });
    applications.push(app);
    await registerWebRoutes(app, webRoot, sharedRoot);

    const response = await app.inject({ method: 'GET', url: '/shared/browser/translate-catalog.mjs' });
    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toContain('javascript');
    expect(response.body).toContain('export function translateCatalog');
    const privateModule = await app.inject({ method: 'GET', url: '/shared/browser/discover-catalog-bundle.mjs' });
    expect(privateModule.statusCode).toBe(404);
    await app.close();
  });

  it('serves overview, queues, new queue, finances, settings, and connection as separate panel pages', async () => {
    const app = Fastify({ logger: false });
    applications.push(app);
    await registerWebRoutes(app, webRoot);
    const response = await app.inject({ method: 'GET', url: '/' });
    const page = response.body;

    expect(page).toContain('aria-label="Navegação principal"');
    for (const id of ['overview', 'queues', 'new-queue', 'operations', 'settings', 'connection']) {
      expect(page).toContain(`data-page-target="${id}"`);
      expect(page).toContain(`data-panel-page="${id}"`);
    }
    expect(page).toContain('id="connection-wizard"');
    expect(page).toContain('id="connection-summary"');
    expect(page).toContain('id="setup-notice"');
    expect(page).toMatch(/name="clientSecret"[^>]*required/);
    expect(page).toContain('id="credentials-form"');
    expect(page).toMatch(/data-panel-page="queues"[\s\S]*?id="queue-list"/);
    expect(page).toMatch(/data-panel-page="new-queue"[\s\S]*?id="queue-form"/);
    expect(page).toContain('name="queueMode"');
    expect(page).toContain('value="manual_only"');
    expect(page).toContain('id="queue-reward-fields"');
    expect(page).toContain('id="queue-cost-field"');
    expect(page).toMatch(/data-panel-page="operations"[\s\S]*?id="operation-list"/);
    expect(page).toContain('name="maxRedemptionsPerStream"');
    expect(page).toContain('name="maxRedemptionsPerUserPerStream"');
    expect(page).toContain('name="globalCooldownSeconds"');

    const script = await app.inject({ method: 'GET', url: '/app.js' });
    expect(script.body).toContain("from './panel-navigation.mjs'");
    expect(script.body).toContain('getInitialPanelPage(setup)');
    expect(script.body).toContain("selectPanelPage(pageId");
    expect(script.body).toContain('maxRedemptionsPerStream: optionalLimit(values.get');
    expect(script.body).toContain("queueMode === 'channel_points'");
    expect(script.body).toContain('queue-reward-fields');
    expect(script.body).toContain('/manual-mode');
    expect(script.body).toContain("queue.modeTransitionStatus === 'pending_pause'");
    expect(script.body).toContain('getCallDeadlinePresentation(entry)');
    expect(script.body).toContain('panelText(deadline.key, deadline.values)');
  });

  it('offers a locale picker populated from discovered catalogs and saves it without restarting', async () => {
    const app = Fastify({ logger: false });
    applications.push(app);
    await registerWebRoutes(app, webRoot);
    const page = await app.inject({ method: 'GET', url: '/' });
    const script = await app.inject({ method: 'GET', url: '/app.js' });
    expect(page.body).toContain('id="product-locale"');
    expect(page.body).toContain('id="save-product-locale"');
    expect(page.body).toContain('id="product-locale-notice"');
    expect(script.body).toContain("request('/api/localization/catalogs')");
    expect(script.body).toContain("'/api/localization/locale'");
    expect(script.body).toContain('state.localizationCatalogs?.locales?.includes(locale)');
    expect(script.body).toContain('const locales = state.localizationCatalogs?.locales ?? []');
    expect(script.body).toContain('twitchEligibilityMessage(setup, activeProductLocale(), state.localizationCatalogs)');
    expect(script.body).toContain('window.setInterval(refreshLocalizationCatalogs, 30000)');
    await app.close();
  });

  it('serves the bundled pt-BR streamer operations panel from apps/web at the root path', async () => {
    const app = Fastify({ logger: false });
    applications.push(app);
    await registerWebRoutes(app, webRoot);

    const response = await app.inject({ method: 'GET', url: '/' });

    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toContain('text/html');
    expect(response.body).toContain('<html lang="pt-BR">');
    expect(response.body).toContain('Suas filas,');
    expect(response.body).toContain('Conectar canal');

    const stylesheet = await app.inject({ method: 'GET', url: '/styles.css' });
    expect(stylesheet.statusCode).toBe(200);
    expect(stylesheet.headers['content-type']).toContain('text/css');
    expect(stylesheet.body).toContain('.queue-card');
    expect(stylesheet.body).not.toMatch(/https?:\/\//i);

    const script = await app.inject({ method: 'GET', url: '/app.js' });
    expect(script.statusCode).toBe(200);
    expect(script.body).toContain('clear-preview');
    expect(script.body).toContain('clear-confirm');
    expect(script.body).toContain('/api/account/default');
    expect(script.body).toContain('/resolve-unknown');
    expect(script.body).toContain('twitchStatusLabel(setup, activeProductLocale(), state.localizationCatalogs)');
    expect(script.body).not.toContain('setup.status.toUpperCase()');
    expect(script.body).toContain('const statusKey = `panel.operation.status.${operation.status}`');
    expect(script.body).toContain('reward-candidates');
    expect(script.body).toContain('resolve-reward');
    const page = await app.inject({ method: 'GET', url: '/' });
    expect(page.body).toContain('id="reward-dialog"');
    expect(page.body).toContain('id="database-health"');
    expect(page.body).toContain('id="twitch-api-health"');
    expect(page.body).toContain('id="twitch-api-ping"');
    expect(script.body).toContain("from './health-status.mjs'");
    expect(script.body).toContain("request('/health')");
    expect(script.body).toContain('/api/queues/${queue.id}/history');
    expect(script.body).toContain("panelText('panel.queue.history.title')");
    expect(script.body).toContain("action(panelText('panel.entry.action.move_up'), 'move-up'");
    expect(script.body).toContain('/move`');
    expect(script.body).toContain("panelText('panel.entry.priority_badge')");
    expect(script.body).toContain("panelText(entry.priorityClass === 'priority' ? 'panel.entry.action.remove_priority' : 'panel.entry.action.mark_priority')");
    expect(page.body).toContain('Prioridade conferida por mim');
    expect(page.body).toContain('O bot não verifica pagamento/inscrição nem guarda comprovantes.');
    expect(script.body).toContain("from './application-setup.mjs'");
    const setupModule = await app.inject({ method: 'GET', url: '/application-setup.mjs' });
    expect(setupModule.statusCode).toBe(200);
    expect(setupModule.body).toContain("form.elements.namedItem('clientSecret')");
    const healthModule = await app.inject({ method: 'GET', url: '/health-status.mjs' });
    expect(healthModule.statusCode).toBe(200);
    expect(healthModule.body).toContain('function formatHealthStatus');
  });

  it('serves the called-entry resend action in the panel script', async () => {
    const app = Fastify();
    await registerWebRoutes(app, webRoot);
    const script = await app.inject({ method: 'GET', url: '/app.js' });
    expect(script.statusCode).toBe(200);
    expect(script.body).toContain("action(panelText('panel.entry.action.resend'), 'resend-call'");
    expect(script.body).toContain("actionName === 'resend-call'");
    expect(script.body).toContain("action(panelText('panel.queue.action.unarchive'), 'unarchive-queue'");
    expect(script.body).toContain("action(panelText('panel.queue.action.archive'), 'archive-queue'");
    await app.close();
  });

  it('offers a queue settings editor backed by the versioned local settings route', async () => {
    const app = Fastify();
    await registerWebRoutes(app, webRoot);
    const page = await app.inject({ method: 'GET', url: '/' });
    const script = await app.inject({ method: 'GET', url: '/app.js' });
    expect(page.body).toContain('id="queue-settings-dialog"');
    expect(page.body).toContain('name="callTimeoutMin"');
    const localSettingsDialog = page.body.match(/<dialog id="queue-settings-dialog">[\s\S]*?<\/dialog>/)?.[0] ?? '';
    const rewardSettingsDialog = page.body.match(/<dialog id="reward-settings-dialog">[\s\S]*?<\/dialog>/)?.[0] ?? '';
    expect(rewardSettingsDialog).toContain('name="uidMode"');
    expect(localSettingsDialog).not.toContain('name="uidMode"');
    expect(page.body).toContain('id="reward-settings-dialog"');
    expect(page.body).toContain('id="reward-settings-form"');
    expect(page.body).toContain('name="globalCooldownSeconds"');
    expect(page.body).toContain('id="reconcile-now"');
    expect(script.body).toContain("request('/api/reconciliation'");
    expect(script.body).toContain("'idempotency-key': idempotencyKey ?? globalThis.crypto.randomUUID()");
    expect(script.body).toContain("action(panelText('panel.queue.action.configure'), 'edit-settings'");
    expect(script.body).toContain('/settings`');
    expect(script.body).toContain("action(panelText('panel.queue.action.edit_reward'), 'edit-reward-settings'");
    expect(script.body).toContain('/reward-settings`');
    await app.close();
  });

  it('offers explicit queue deletion confirmation and freezes mutation actions while deletion is pending', async () => {
    const app = Fastify();
    await registerWebRoutes(app, webRoot);
    const script = await app.inject({ method: 'GET', url: '/app.js' });
    expect(script.body).toContain("action(panelText('panel.queue.action.delete'), 'delete-queue'");
    expect(script.body).toContain("action(panelText('panel.queue.action.retry_local_delete'), 'delete-queue'");
    expect(script.body).toContain('body: JSON.stringify({ confirm: true })');
    expect(script.body).toContain("panelText(getQueueConfirmationCopy(queue, 'delete'), { title: queue?.title ?? '', count: activeCount })");
    expect(script.body).toContain("panel.queue.delete.pending");
    await app.close();
  });
});
