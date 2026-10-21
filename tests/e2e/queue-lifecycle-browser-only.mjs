import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';

const appOrigin = process.env.APP_ORIGIN ?? 'https://localhost:3000';
const parsedOrigin = new URL(appOrigin);
assert.equal(parsedOrigin.protocol, 'https:', 'browser-only queue test requires HTTPS');
assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(parsedOrigin.hostname), 'APP_ORIGIN must be loopback');

const browser = await chromium.launch({
  channel: process.env.CHROME_CHANNEL ?? 'chrome',
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});
const context = await browser.newContext({ ignoreHTTPSErrors: true });
const page = await context.newPage();
const calls = [];
let cancelMode = 'processing';

const queue = {
  id: 'queue-1', slug: 'arena', title: 'Arena', isOpen: false, version: 4, lifecycleStatus: 'deleting',
  queueMode: 'channel_points', rewardOrigin: 'twitch', rewardId: 'reward-1', remoteSyncStatus: 'delete_pending',
  modeTransitionStatus: 'none', isArchived: false, entries: [],
};
const catalog = {
  'panel.queues.title': 'Filas e atendimentos',
  'panel.queue.status.pending_delete': 'Exclusão pendente',
  'panel.queue.action.cancel_delete': 'Cancelar exclusão',
  'panel.confirmation.title': 'Confirmar ação',
  'panel.dialog.cancel': 'Voltar',
  'panel.dialog.confirm': 'Confirmar',
  'panel.queue.confirm.cancel_delete': 'Confirme o cancelamento da exclusão de “{title}”.',
  'panel.queue.delete.cancel.processing': 'Uma operação da reward ainda está em andamento. Aguarde, atualize o painel e confira a fila antes de tentar novamente.',
  'panel.queue.delete.cancel.uncertain': 'Não foi possível confirmar se o cancelamento foi concluído. Atualize o painel e confira o estado da exclusão antes de tentar novamente.',
  'panel.error.reference': 'Referência: {id}',
};

try {
  await page.route('**/*', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.origin !== parsedOrigin.origin || !url.pathname.startsWith('/api/')) return route.continue();

    calls.push({ path: url.pathname, method: request.method(), headers: await request.allHeaders() });
    if (url.pathname === '/api/session') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ csrfToken: 'csrf-token-for-browser-test-0001' }) });
    }
    if (url.pathname === '/api/localization/catalogs') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
        locales: ['pt-BR'], modules: { panel: { catalogs: { 'pt-BR': catalog } } },
      }) });
    }
    if (url.pathname === '/api/state') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
        product_version: '0.2.0-beta', account: { label: 'Streamer' }, pending_operations: [],
      }) });
    }
    if (url.pathname === '/api/setup') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
    }
    if (url.pathname === '/api/queues' && request.method() === 'GET') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([queue]) });
    }
    if (url.pathname === '/api/queues/queue-1/delete/cancel' && request.method() === 'POST') {
      if (cancelMode === 'processing') {
        return route.fulfill({
          status: 409, contentType: 'application/json',
          body: JSON.stringify({ code: 'QUEUE_REWARD_OPERATION_PROCESSING', error: 'private server copy' }),
        });
      }
      return route.fulfill({
        status: 503, contentType: 'application/json', headers: { 'x-error-reference': 'cancel-op-17' },
        body: JSON.stringify({ code: 'INTERNAL_ERROR', error: 'private server copy' }),
      });
    }
    return route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ code: 'NOT_FOUND' }) });
  });

  await page.goto(`${appOrigin}/queues/`);
  await page.getByRole('button', { name: 'Cancelar exclusão' }).waitFor();
  await page.getByRole('button', { name: 'Cancelar exclusão' }).click();
  await page.getByRole('button', { name: 'Confirmar' }).click();

  const alert = page.locator('.queue-action-feedback[role="alert"]');
  await alert.waitFor();
  const conflictText = await alert.textContent();
  assert.match(conflictText, /Uma operação da reward ainda está em andamento/);
  assert.doesNotMatch(conflictText, /private server copy|Exclusão cancelada/);
  assert.equal(await page.locator('dialog[open]').count(), 0, 'confirmation dialog closes after the conflict is announced');

  cancelMode = 'uncertain';
  await page.getByRole('button', { name: 'Cancelar exclusão' }).click();
  await page.getByRole('button', { name: 'Confirmar' }).click();
  await page.waitForFunction(() => document.querySelector('.queue-action-feedback[role="alert"]')?.textContent.includes('Não foi possível confirmar se o cancelamento foi concluído'));
  const uncertainText = await alert.textContent();
  assert.match(uncertainText, /Referência: cancel-op-17/);
  assert.doesNotMatch(uncertainText, /private server copy|Exclusão cancelada/);

  const cancelCalls = calls.filter((call) => call.path === '/api/queues/queue-1/delete/cancel');
  assert.equal(cancelCalls.length, 2, 'both attempts reached only the intercepted same-origin API');
  for (const cancelCall of cancelCalls) {
    assert.equal(cancelCall.method, 'POST');
    assert.equal(cancelCall.headers['x-csrf-token'], 'csrf-token-for-browser-test-0001');
    assert.ok(cancelCall.headers['idempotency-key'], 'mutation keeps the existing idempotency contract');
  }

  console.log('PASS queue lifecycle browser-only: QRA-23 processing conflict and uncertain server result, localized alerts, safe diagnostic reference, no false success, CSRF and idempotency headers.');
  console.log('Boundary: API responses were intercepted fixtures; no product API, database, Twitch, Docker, OBS, or CEF mutation was performed.');
}
finally {
  await context.close();
  await browser.close();
}
