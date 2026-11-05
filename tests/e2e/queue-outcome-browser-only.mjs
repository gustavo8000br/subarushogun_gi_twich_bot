import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { chromium } from 'playwright-core';

// FT-23 (#103) browser-only E2E: navigation and messages after creating or deleting a queue (E23-01..E23-09).
// Real Chromium against the Next panel; every API response is an intercepted same-origin fixture; external origins are aborted.
const appOrigin = process.env.APP_ORIGIN ?? 'https://localhost:3000';
const parsedOrigin = new URL(appOrigin);
assert.equal(parsedOrigin.protocol, 'https:', 'browser-only queue test requires HTTPS');
assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(parsedOrigin.hostname), 'APP_ORIGIN must be loopback');

const catalog = Object.fromEntries(readFileSync('apps/shared/localization/catalogs/panel/pt-BR.tsv', 'utf8').trim().split('\n').map((line) => {
  const separator = line.indexOf('\t');
  return [line.slice(0, separator), line.slice(separator + 1)];
}));
const ID_A = '0b1f1ef0-0ac0-4e63-b71c-e608f5aa1b20';
const ID_B = '7c9d3f10-1d2e-4a55-9a43-0a8f1f6d2b11';
const ID_C = '3a8e1d52-5f61-4b0c-8a77-2f1f9d6c4e33';

const browser = await chromium.launch({
  channel: process.env.CHROME_CHANNEL ?? 'chrome',
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});
const context = await browser.newContext({ ignoreHTTPSErrors: true });
const page = await context.newPage();

const base = (id, title, extra = {}) => ({
  id, slug: title.toLowerCase().replaceAll(' ', '-'), title, isOpen: false, isArchived: false, version: 4, lifecycleStatus: 'active',
  queueMode: 'channel_points', rewardOrigin: 'twitch', rewardId: `reward-${id}`, remoteSyncStatus: 'synced', modeTransitionStatus: 'none', entries: [],
  ...extra,
});
const deletingQueue = (id, title, extra = {}) => base(id, title, {
  lifecycleStatus: 'deleting', remoteSyncStatus: 'delete_pending', isArchived: true,
  deletionState: 'pending', blockReason: null, blockingOperations: 0, canCancelDeletion: true, cancellationInProgress: false, ...extra,
});

let queues = [];
let operations = [];
let setupConnected = false;
let postHandler = () => null;
const apiCalls = [];

await page.route('**/*', async (route) => {
  const request = route.request();
  const url = new URL(request.url());
  if (url.origin !== parsedOrigin.origin) return route.abort();
  if (!url.pathname.startsWith('/api/') && url.pathname !== '/health') return route.continue();
  const json = (status, body, headers = {}) => route.fulfill({ status, contentType: 'application/json', headers, body: JSON.stringify(body) });
  apiCalls.push({ path: url.pathname + url.search, method: request.method() });
  if (url.pathname === '/api/session') return json(200, { csrfToken: 'csrf-token-for-browser-test-0001' });
  if (url.pathname === '/api/localization/catalogs') return json(200, { locales: ['pt-BR'], modules: { panel: { catalogs: { 'pt-BR': catalog } } } });
  if (url.pathname === '/health') return json(200, { status: 'ok', dependencies: { database: 'connected', twitch_api: 'connected', twitch_chat: 'connected' } });
  if (url.pathname === '/api/state') return json(200, { product_version: '0.2.1-beta', account: { label: 'Streamer' }, pending_operations: [] });
  if (url.pathname === '/api/setup') return json(200, { connected: setupConnected });
  if (url.pathname === '/api/operations') return json(200, operations);
  if (url.pathname === '/api/queues' && request.method() === 'GET') return json(200, queues);
  if (request.method() === 'POST') {
    const answer = postHandler(url.pathname, request.postDataJSON?.() ?? {});
    if (answer) return json(answer.status ?? 200, answer.body ?? {}, answer.headers ?? {});
  }
  return json(404, { code: 'NOT_FOUND' });
});

const statusText = async () => (await page.locator('.outcome-region [role="status"]').textContent()) ?? '';
const alertText = async () => (await page.locator('.outcome-region [role="alert"]').textContent()) ?? '';
const activeId = () => page.evaluate(() => document.activeElement?.id ?? '');
const activeTag = () => page.evaluate(() => document.activeElement?.tagName ?? '');

async function openQueues() {
  await page.goto(`${appOrigin}/queues/`);
  await page.locator('main h1').waitFor();
}
async function confirmDialogAccept() {
  const dialog = page.locator('dialog[open]');
  await dialog.waitFor();
  await dialog.locator('button').nth(1).click();
}

try {
  // E23-01 create (Channel Points) -> /queues/ with focus on the new title and a message that does not promise Twitch success.
  {
    queues = [];
    setupConnected = true;
    postHandler = (path) => {
      if (path !== '/api/queues') return null;
      const created = base(ID_C, 'Nova Fila', { remoteSyncStatus: 'synced', slug: 'nova-fila' });
      queues = [created];
      return { status: 201, body: created };
    };
    await page.goto(`${appOrigin}/new-queue/`);
    await page.getByRole('textbox', { name: /Nome da fila/ }).fill('Nova Fila');
    await page.getByRole('button', { name: 'Criar fila' }).click();
    await page.waitForURL((url) => url.pathname === '/queues/' || url.pathname === '/queues');
    await page.locator(`#queue-title-${ID_C}`).waitFor();
    await page.waitForFunction((id) => document.activeElement?.id === id, `queue-title-${ID_C}`);
    const text = await statusText();
    assert.match(text, /^Fila criada\./);
    assert.doesNotMatch(text, /sincronizada|funcionando|com sucesso/i, 'the create message must not promise that Twitch succeeded');
    assert.equal(await page.locator('.outcome-region [role="alert"]').textContent(), '', 'the alert element stays empty for a success');
    assert.equal(new URL(page.url()).search, '', 'both URL parameters are removed after the outcome is applied');
    // E23-07: a reload does not replay the message.
    await page.reload();
    await page.locator('main h1').waitFor();
    assert.equal(await statusText(), '');
    assert.equal(await alertText(), '');
  }

  // E23-02 delete (Channel Points) keeps the persistent message after the card unmounts; focus moves to the h1.
  {
    queues = [base(ID_A, 'Arena'), base(ID_B, 'Duelo')];
    postHandler = (path) => {
      if (path !== `/api/queues/${ID_A}/delete`) return null;
      queues = [base(ID_B, 'Duelo')];
      return { body: { status: 'deleted', activeRemoved: 0, refundsRequested: 0, deletionState: null, queue: { ...base(ID_A, 'Arena'), lifecycleStatus: 'deleted' } } };
    };
    await openQueues();
    const card = page.locator('article', { has: page.getByRole('heading', { level: 2, name: 'Arena', exact: true }) });
    await card.getByRole('button', { name: 'Excluir fila' }).click();
    await confirmDialogAccept();
    await page.getByRole('heading', { level: 2, name: 'Arena', exact: true }).waitFor({ state: 'detached' });
    assert.match(await statusText(), /^Fila excluída\. A Twitch confirmou que a recompensa foi excluída/);
    assert.doesNotMatch(await statusText(), /continua pausada|intacta/, 'R1: a Channel Points queue never claims its reward remains paused or untouched');
    assert.equal(new URL(page.url()).pathname.replace(/\/$/, ''), '/queues');
    await page.waitForFunction(() => document.activeElement === document.querySelector('main h1'));
    assert.equal(await page.locator('main h1').getAttribute('tabindex'), '-1');
  }

  // E23-03 delete the last queue -> /new-queue/ with the message and focus on the h1; E23-07 reload does not replay.
  {
    queues = [base(ID_A, 'Arena')];
    postHandler = (path) => {
      if (path !== `/api/queues/${ID_A}/delete`) return null;
      queues = [];
      return { body: { status: 'deleted', deletionState: null, queue: { ...base(ID_A, 'Arena'), lifecycleStatus: 'deleted' } } };
    };
    await openQueues();
    const card = page.locator('article', { has: page.getByRole('heading', { level: 2, name: 'Arena', exact: true }) });
    await card.getByRole('button', { name: 'Excluir fila' }).click();
    await confirmDialogAccept();
    await page.waitForURL((url) => /\/new-queue\/?$/.test(url.pathname));
    await page.locator('main h1').waitFor();
    await page.waitForFunction(() => /^Fila excluída\./.test(document.querySelector('.outcome-region [role="status"]')?.textContent ?? ''));
    await page.waitForFunction(() => document.activeElement === document.querySelector('main h1'));
    assert.equal(new URL(page.url()).search, '');
    await page.reload();
    await page.locator('main h1').waitFor();
    assert.equal(await statusText(), '', 'E23-07: the message is not replayed after a reload');
  }

  // E23-04 deletion pending (stays on /queues/, refresh replaces the message) and blocked (alert + Operations link, persistent card line).
  {
    queues = [base(ID_A, 'Arena')];
    let answer = 'pending';
    postHandler = (path) => {
      if (path !== `/api/queues/${ID_A}/delete`) return null;
      queues = [deletingQueue(ID_A, 'Arena', answer === 'blocked' ? { deletionState: 'blocked', blockReason: 'financial_review_required', blockingOperations: 2 } : {})];
      return { body: { status: 'pending', deletionState: queues[0].deletionState, queue: queues[0] } };
    };
    await openQueues();
    let card = page.locator('article', { has: page.getByRole('heading', { level: 2, name: 'Arena', exact: true }) });
    await card.getByRole('button', { name: 'Excluir fila' }).click();
    await confirmDialogAccept();
    await page.waitForFunction(() => /^Exclusão pendente\./.test(document.querySelector('.outcome-region [role="status"]')?.textContent ?? ''));
    assert.doesNotMatch(await statusText(), /Fila excluída|continua pausada|intacta/);
    assert.equal(await alertText(), '');
    await page.waitForFunction((id) => document.activeElement?.id === id, `queue-title-${ID_A}`);
    await page.getByRole('button', { name: 'Atualizar filas' }).click();
    await page.waitForFunction(() => document.querySelector('.outcome-region [role="status"]')?.textContent === 'Filas atualizadas.');

    // blocked
    queues = [base(ID_A, 'Arena')];
    answer = 'blocked';
    await openQueues();
    card = page.locator('article', { has: page.getByRole('heading', { level: 2, name: 'Arena', exact: true }) });
    await card.getByRole('button', { name: 'Excluir fila' }).click();
    await confirmDialogAccept();
    await page.waitForFunction(() => /Exclusão bloqueada: 2 operações precisam da sua revisão/.test(document.querySelector('.outcome-region [role="alert"]')?.textContent ?? ''));
    assert.equal(await statusText(), '');
    assert.equal(await page.locator('.outcome-region a', { hasText: 'Revisar as operações' }).getAttribute('href'), '/operations/');
    const cardLine = page.locator('.queue-deletion-line');
    assert.match(await cardLine.textContent(), /Exclusão bloqueada: 2 operações precisam da sua revisão/);
    await page.reload();
    await page.locator('.queue-deletion-line').waitFor();
    assert.match(await page.locator('.queue-deletion-line').textContent(), /Exclusão bloqueada: 2 operações/, 'a blocked deletion is a persistent state of the card');
    assert.doesNotMatch(await page.locator('main').textContent(), /financial_review_required/);
  }

  // E23-05 every cancel-deletion refusal: right element (alert), right text, never "cancelled".
  {
    const rows = [
      ['409 ALREADY_COMPLETED', { status: 409, body: { code: 'QUEUE_DELETION_ALREADY_COMPLETED', error: 'privado' } }, /A Twitch já confirmou que a recompensa foi excluída/, 'Atualizar filas'],
      ['409 PAUSE_IN_PROGRESS', { status: 409, body: { code: 'QUEUE_DELETION_PAUSE_IN_PROGRESS', error: 'privado' } }, /ainda está sendo pausada na Twitch/, null],
      ['409 REMOTE_DELETE_ATTEMPTED', { status: 409, body: { code: 'QUEUE_DELETION_REMOTE_DELETE_ATTEMPTED', error: 'privado' } }, /pode já ter chegado à Twitch/, 'Revisar as operações'],
      // FT-53: the additive `reason` selects the reauthorize text only for authorization_required; any other reason keeps the generic text.
      ['409 REMOTE_DELETE_ATTEMPTED + reason authorization_required', { status: 409, body: { code: 'QUEUE_DELETION_REMOTE_DELETE_ATTEMPTED', error: 'privado', reason: 'authorization_required' } }, /Reautorize o canal na página Conexão Twitch/, 'Conexão Twitch'],
      ['409 REMOTE_DELETE_ATTEMPTED + reason verification_unavailable', { status: 409, body: { code: 'QUEUE_DELETION_REMOTE_DELETE_ATTEMPTED', error: 'privado', reason: 'verification_unavailable' } }, /pode já ter chegado à Twitch/, 'Revisar as operações'],
      ['409 PROCESSING', { status: 409, body: { code: 'QUEUE_REWARD_OPERATION_PROCESSING', error: 'privado' } }, /ainda está em andamento/, 'Atualizar filas'],
      ['409 NOT_PENDING', { status: 409, body: { code: 'QUEUE_DELETION_NOT_PENDING', error: 'privado' } }, /O estado da exclusão mudou/, 'Atualizar filas'],
      ['409 UNVERIFIED', { status: 409, body: { code: 'QUEUE_DELETION_CANCELLATION_UNVERIFIED', error: 'privado' } }, /não conseguiu confirmar o estado da recompensa/, null],
      ['404 NOT_FOUND', { status: 404, body: { code: 'QUEUE_NOT_FOUND', error: 'privado' } }, /Esta fila não existe mais/, 'Atualizar filas'],
      ['200 reward_absent', { body: { status: 'not_cancelled', reason: 'queue_delete_reward_absent' } }, /não encontrou mais esta recompensa/, 'Revisar as operações'],
      ['200 reward_diverged', { body: { status: 'not_cancelled', reason: 'queue_delete_reward_diverged' } }, /não corresponde à configuração pausada/, 'Revisar as operações'],
      ['200 reward_not_paused', { body: { status: 'not_cancelled', reason: 'queue_delete_cancel_reward_not_paused' } }, /porque a recompensa na Twitch não está pausada/, 'Revisar as operações'],
      ['200 verification_unavailable', { body: { status: 'not_cancelled', reason: 'queue_deletion_cancel_verification_unavailable' } }, /não conseguiu confirmar o estado da recompensa/, null],
      ['200 authorization_required', { body: { status: 'not_cancelled', reason: 'authorization_required' } }, /A Twitch recusou a autorização/, 'Conexão Twitch'],
      ['503 uncertain', { status: 503, headers: { 'x-error-reference': 'cancel-op-17' }, body: { code: 'INTERNAL_ERROR', error: 'privado' } }, /Não foi possível confirmar se o cancelamento foi concluído/, 'Atualizar filas'],
    ];
    for (const [name, answer, pattern, controlName] of rows) {
      queues = [deletingQueue(ID_A, 'Arena')];
      postHandler = (path) => (path === `/api/queues/${ID_A}/delete/cancel` ? answer : null);
      await openQueues();
      const card = page.locator('article', { has: page.getByRole('heading', { level: 2, name: 'Arena', exact: true }) });
      await card.getByRole('button', { name: 'Cancelar exclusão' }).click();
      const dialog = page.locator('dialog[open]');
      await dialog.waitFor();
      assert.equal(await dialog.locator('button').nth(0).textContent(), 'Voltar', `${name}: Back first`);
      assert.equal(await dialog.locator('button').nth(1).textContent(), 'Cancelar exclusão', `${name}: specific verb`);
      await dialog.locator('button').nth(1).click();
      await page.waitForFunction(() => (document.querySelector('.outcome-region [role="alert"]')?.textContent ?? '').length > 0);
      const text = await alertText();
      assert.match(text, pattern, name);
      assert.doesNotMatch(text, /privado|Exclusão cancelada\./, `${name}: no server free text and no false success`);
      assert.equal(await statusText(), '', `${name}: refusals never go to the status element`);
      if (controlName) {
        const control = page.locator('.outcome-region').getByRole(controlName === 'Atualizar filas' ? 'button' : 'link', { name: controlName });
        assert.equal(await control.count(), 1, `${name}: offers "${controlName}"`);
      }
      if (name.startsWith('503')) assert.match(text, /Referência: cancel-op-17/);
      assert.equal(await page.locator('dialog[open]').count(), 0, `${name}: the dialog closes`);
    }
    // The authorization refusal links to the Twitch connection page.
    queues = [deletingQueue(ID_A, 'Arena')];
    postHandler = (path) => (path === `/api/queues/${ID_A}/delete/cancel` ? { body: { status: 'not_cancelled', reason: 'authorization_required' } } : null);
    await openQueues();
    await page.getByRole('button', { name: 'Cancelar exclusão' }).click();
    await confirmDialogAccept();
    await page.waitForFunction(() => /autorização/.test(document.querySelector('.outcome-region [role="alert"]')?.textContent ?? ''));
    assert.equal(await page.locator('.outcome-region a', { hasText: 'Conexão Twitch' }).getAttribute('href'), '/connection/');
  }

  // E23-06 cancel success + E23-09 the late DELETE: after the cancel, opening fails safely and the queue stays closed.
  {
    queues = [deletingQueue(ID_A, 'Arena')];
    postHandler = (path) => {
      if (path === `/api/queues/${ID_A}/delete/cancel`) {
        queues = [base(ID_A, 'Arena', { isArchived: true, isOpen: false })];
        return { body: { status: 'cancelled', queue: queues[0] } };
      }
      if (path === `/api/queues/${ID_A}/unarchive`) {
        queues = [base(ID_A, 'Arena', { isArchived: false, isOpen: false })];
        return { body: { status: 'unarchived', queue: queues[0] } };
      }
      if (path === `/api/queues/${ID_A}/open-state`) return { status: 409, body: { code: 'QUEUE_REWARD_NOT_READY', error: 'privado' } };
      return null;
    };
    await openQueues();
    await page.getByRole('button', { name: 'Cancelar exclusão' }).click();
    await confirmDialogAccept();
    await page.waitForFunction(() => /^Exclusão cancelada\./.test(document.querySelector('.outcome-region [role="status"]')?.textContent ?? ''));
    const text = await statusText();
    assert.ok(text.indexOf('mostrar a fila aos espectadores') < text.indexOf('abri-la de novo'), 'the message names the order: show, then open');
    assert.match(text, /não voltam/);
    assert.equal(await alertText(), '');
    assert.equal(await page.locator('.queue-state').first().textContent(), 'FECHADA');
    await page.getByRole('button', { name: 'Mostrar esta fila para viewers' }).click();
    await page.getByRole('button', { name: 'Mostrar esta fila para viewers' }).waitFor({ state: 'detached' }).catch(() => {});
    const dialog = page.locator('dialog[open]');
    if (await dialog.count()) await dialog.locator('button').nth(1).click();
    await page.getByRole('button', { name: 'Ativar fila' }).click();
    await page.waitForFunction(() => /ainda não foi confirmada/.test(document.querySelector('.queue-action-feedback[role="alert"]')?.textContent ?? ''));
    assert.equal(await page.locator('.queue-state').first().textContent(), 'FECHADA', 'E23-09: the queue is not reopened');
  }

  // E23-08 Operations page: attempts_exhausted, blocks_deletion and manual_contradicted texts.
  {
    queues = [deletingQueue(ID_A, 'Arena', { deletionState: 'blocked', blockingOperations: 1 })];
    operations = [
      { id: 'op-1', type: 'redemption.cancel', redemptionId: 'redemption-1', status: 'unknown', attempts: 6, nextAttemptAt: null, reason: 'attempts_exhausted', blockingQueueId: ID_A },
      { id: 'op-2', type: 'redemption.cancel', redemptionId: 'redemption-2', status: 'pending', attempts: 1, nextAttemptAt: null, reason: 'manual_contradicted' },
    ];
    await page.goto(`${appOrigin}/operations/`);
    await page.locator('.operation-card').first().waitFor();
    const body = await page.locator('main').textContent();
    assert.match(body, /As tentativas automáticas terminaram e a Twitch não confirmou nada/);
    assert.match(body, /Bloqueia a exclusão de “Arena”/);
    assert.match(body, /A Twitch ainda lista este resgate como aberto depois da sua resolução manual/);
    operations = [];
  }

  assert.ok(apiCalls.every((call) => !/outcome=|[?&]queue=/.test(call.path)), 'the API never receives the outcome parameters');
  console.log('PASS queue outcome browser-only: create -> /queues/ with focus, delete (persistent message), delete last -> /new-queue/, pending/blocked, 13 cancel refusals, cancel success and late-open safety, Operations texts, no replay after reload.');
  console.log('Boundary: API responses were intercepted fixtures; no product API, database, Twitch, Docker, OBS, or CEF mutation. Focus, roles and text are asserted from the DOM; visual rendering, screen readers and real pixels are NOT covered.');
}
finally {
  await context.close();
  await browser.close();
}
