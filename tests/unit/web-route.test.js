import Fastify from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { registerWebRoutes } from '../../apps/api/src/web-route.mjs';

const webRoot = fileURLToPath(new URL('../../apps/web/', import.meta.url));
const applications = [];

afterEach(async () => {
  await Promise.all(applications.splice(0).map((app) => app.close()));
});

describe('local web entrypoint', () => {
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
    expect(page).toMatch(/data-panel-page="operations"[\s\S]*?id="operation-list"/);
    expect(page).toContain('name="maxRedemptionsPerStream"');
    expect(page).toContain('name="maxRedemptionsPerUserPerStream"');
    expect(page).toContain('name="globalCooldownSeconds"');

    const script = await app.inject({ method: 'GET', url: '/app.js' });
    expect(script.body).toContain("from './panel-navigation.mjs'");
    expect(script.body).toContain('getInitialPanelPage(setup)');
    expect(script.body).toContain("selectPanelPage(pageId");
    expect(script.body).toContain('maxRedemptionsPerStream: optionalLimit(values.get');
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
    expect(script.body).toContain('twitchStatusLabel(setup)');
    expect(script.body).not.toContain('setup.status.toUpperCase()');
    expect(script.body).toContain('Twitch não confirmou');
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
    expect(script.body).toContain('Histórico recente');
    expect(script.body).toContain("action('Mover ↑', 'move-up'");
    expect(script.body).toContain('/move`');
    expect(script.body).toContain("from './priority-labels.mjs'");
    expect(script.body).toContain('Prioritária · conferida pelo operador');
    expect(script.body).toContain("action(entry.priorityClass === 'priority' ? 'Remover prioridade' : 'Marcar prioritária'");
    expect(page.body).toContain('Prioridade conferida por mim');
    expect(page.body).toContain('O bot não verifica pagamento/inscrição nem guarda comprovantes.');
    expect(script.body).toContain("from './application-setup.mjs'");
    const setupModule = await app.inject({ method: 'GET', url: '/application-setup.mjs' });
    expect(setupModule.statusCode).toBe(200);
    expect(setupModule.body).toContain("form.elements.namedItem('clientSecret')");
    const healthModule = await app.inject({ method: 'GET', url: '/health-status.mjs' });
    expect(healthModule.statusCode).toBe(200);
    expect(healthModule.body).toContain('function formatHealthStatus');
    const priorityLabels = await app.inject({ method: 'GET', url: '/priority-labels.mjs' });
    expect(priorityLabels.statusCode).toBe(200);
    expect(priorityLabels.body).toContain('function priorityBenefitLabel');
  });

  it('serves the called-entry resend action in the panel script', async () => {
    const app = Fastify();
    await registerWebRoutes(app, webRoot);
    const script = await app.inject({ method: 'GET', url: '/app.js' });
    expect(script.statusCode).toBe(200);
    expect(script.body).toContain("action('Reenviar chamada', 'resend-call'");
    expect(script.body).toContain("actionName === 'resend-call'");
    expect(script.body).toContain("action('Desarquivar', 'unarchive-queue'");
    expect(script.body).toContain("action('Arquivar', 'archive-queue'");
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
    expect(script.body).toContain("action('Configurar', 'edit-settings'");
    expect(script.body).toContain('/settings`');
    expect(script.body).toContain("action('Editar recompensa', 'edit-reward-settings'");
    expect(script.body).toContain('/reward-settings`');
    await app.close();
  });

  it('offers explicit queue deletion confirmation and freezes mutation actions while deletion is pending', async () => {
    const app = Fastify();
    await registerWebRoutes(app, webRoot);
    const script = await app.inject({ method: 'GET', url: '/app.js' });
    expect(script.body).toContain("action('Excluir fila', 'delete-queue'");
    expect(script.body).toContain('body: JSON.stringify({ confirm: true })');
    expect(script.body).toContain('A recompensa só será excluída depois da confirmação de todos os cancelamentos');
    expect(script.body).toContain('Exclusão pendente: aguardando confirmação');
    await app.close();
  });
});
