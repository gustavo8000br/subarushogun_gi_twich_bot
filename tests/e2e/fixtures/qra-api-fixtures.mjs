export const qraQueueDto = Object.freeze({
  id: 'queue-qra-fixture',
  slug: 'arena',
  title: 'Arena',
  cost: 100,
  rewardPrompt: 'Enter the queue',
  callMessage: '{user}, it is your turn!',
  callTimeoutMin: 10,
  uidMode: 'hidden',
  showUidInList: false,
  showUidInOverlay: false,
  showUidOnCall: false,
  autoSwitchAccount: false,
  refundIfRemovedWhileCalled: true,
  refundOnNoShow: false,
  refundIfViewerLeavesCalled: false,
  isOpen: true,
  isArchived: false,
  lifecycleStatus: 'active',
  remoteSyncStatus: 'synced',
  rewardId: 'reward-qra-fixture',
  queueMode: 'channel_points',
  rewardOrigin: 'twitch',
  modeTransitionStatus: 'none',
  version: 1,
  entries: [{
    id: 'entry-qra-fixture',
    userLogin: 'viewer_fixture',
    displayName: 'Viewer Fixture',
    status: 'waiting',
    position: 1,
    priorityClass: 'standard',
    priorityReason: null,
    uid: null,
  }],
});

const queueBody = { ...qraQueueDto, entries: [] };
const errorResponse = (status, code, error) => ({ status, body: { code, error } });

export const QRA_ROUTE_FIXTURES = Object.freeze([
  { id: 'QRA-01', method: 'GET', pattern: /^\/api\/queues$/, status: 200, body: [qraQueueDto] },
  { id: 'QRA-02', method: 'POST', pattern: /^\/api\/queues$/, status: 201, body: queueBody },
  { id: 'QRA-03', method: 'PATCH', pattern: /^\/api\/queues\/[^/]+\/settings$/, status: 200, body: qraQueueDto },
  { id: 'QRA-04', method: 'PATCH', pattern: /^\/api\/queues\/[^/]+\/reward-settings$/, status: 202, body: { ...queueBody, operationStatus: 'pending' } },
  { id: 'QRA-05', method: 'GET', pattern: /^\/api\/queues\/[^/]+\/history$/, status: 200, body: [] },
  { id: 'QRA-06', method: 'POST', pattern: /^\/api\/queues\/[^/]+\/move$/, status: 200, body: { status: 'moved', entryId: 'entry-qra-fixture', position: 1 } },
  { id: 'QRA-07', method: 'POST', pattern: /^\/api\/entries\/[^/]+\/priority$/, status: 200, body: { status: 'updated', priorityClass: 'priority', priorityReason: 'bits' } },
  { id: 'QRA-08', method: 'GET', pattern: /^\/api\/queues\/[^/]+\/reward-candidates$/, status: 200, body: { candidates: [{ id: 'reward-candidate-fixture', title: 'Arena', cost: 100, prompt: 'Enter the queue' }], diagnostics: [] } },
  { id: 'QRA-09', method: 'POST', pattern: /^\/api\/queues\/[^/]+\/resolve-reward$/, status: 200, body: { status: 'linked', queue: qraQueueDto, remoteConfirmed: false } },
  { id: 'QRA-10', method: 'POST', pattern: /^\/api\/queues\/[^/]+\/manual-entries$/, status: 201, body: { id: 'entry-manual-fixture', status: 'waiting', position: 2 } },
  { id: 'QRA-11', method: 'POST', pattern: /^\/api\/entries\/[^/]+\/transitions$/, status: 200, body: { id: 'entry-qra-fixture', status: 'in_progress', financialDecision: 'none' } },
  { id: 'QRA-12', method: 'POST', pattern: /^\/api\/entries\/[^/]+\/call-notification\/resend$/, status: 200, body: { status: 'queued', entryId: 'entry-qra-fixture' } },
  { id: 'QRA-13', method: 'POST', pattern: /^\/api\/queues\/[^/]+\/call$/, status: 200, body: { status: 'called', count: 1 } },
  { id: 'QRA-14', method: 'POST', pattern: /^\/api\/queues\/[^/]+\/clear-preview$/, status: 200, body: { status: 'confirmation_required', count: 1, refundsRequested: 0, expiresInSeconds: 15 } },
  { id: 'QRA-15', method: 'POST', pattern: /^\/api\/queues\/[^/]+\/clear-confirm$/, status: 200, body: { status: 'cleared', count: 1, refundsRequested: 0 } },
  { id: 'QRA-16', method: 'POST', pattern: /^\/api\/queues\/[^/]+\/open-state$/, status: 200, body: { status: 'confirmed', isOpen: true, remoteSyncStatus: 'synced' } },
  { id: 'QRA-17', method: 'POST', pattern: /^\/api\/queues\/[^/]+\/manual-mode$/, status: 202, body: { status: 'pending', queue: { ...qraQueueDto, queueMode: 'manual_only', remoteSyncStatus: 'pending_manual_mode' } } },
  { id: 'QRA-18', method: 'POST', pattern: /^\/api\/queues\/[^/]+\/archive$/, status: 200, body: { status: 'archived', queue: { ...qraQueueDto, isArchived: true, isOpen: false } } },
  { id: 'QRA-19', method: 'POST', pattern: /^\/api\/queues\/[^/]+\/archive-local\/challenge$/, status: 200, body: { status: 'challenge_issued', challengeId: 'f3a8b3c1-c8b4-42bc-94a5-bf845849bda1', expectedVersion: 1, remoteSyncStatus: 'synced', expiresAt: '2099-01-01T00:00:00.000Z' } },
  { id: 'QRA-20', method: 'POST', pattern: /^\/api\/queues\/[^/]+\/archive-local\/confirm$/, status: 200, body: { status: 'archived', queue: { ...qraQueueDto, isArchived: true, lifecycleStatus: 'deleted', remoteSyncStatus: 'synced' } } },
  { id: 'QRA-21', method: 'POST', pattern: /^\/api\/queues\/[^/]+\/unarchive$/, status: 200, body: { status: 'unarchived', queue: { ...qraQueueDto, isArchived: false, isOpen: false } } },
  { id: 'QRA-22', method: 'POST', pattern: /^\/api\/queues\/[^/]+\/delete$/, status: 200, body: { status: 'pending', activeRemoved: 1, refundsRequested: 0, queue: { ...qraQueueDto, lifecycleStatus: 'deleting', remoteSyncStatus: 'delete_pending' } } },
  { id: 'QRA-23', method: 'POST', pattern: /^\/api\/queues\/[^/]+\/delete\/cancel$/, status: 200, body: { status: 'cancelled', reason: 'verified_absent', queue: qraQueueDto } },
]);

export const QRA_ERROR_FIXTURES = Object.freeze({
  'QRA-01': { unauthorized: errorResponse(401, 'LOCAL_SESSION_REQUIRED', 'Local session required.') },
  'QRA-02': { invalid: errorResponse(400, 'INVALID_QUEUE', 'Review the queue configuration.') },
  'QRA-03': { stale: errorResponse(409, 'STALE_QUEUE_VERSION', 'Refresh the queue settings.') },
  'QRA-04': { pending: errorResponse(409, 'QUEUE_REWARD_UPDATE_PENDING', 'A reward update is pending.') },
  'QRA-05': { missing: { status: 404, body: { error: 'Fila não encontrada.' } } },
  'QRA-06': { conflict: { status: 409, body: { error: 'A pessoa não está aguardando ou a posição não está mais disponível. Atualize o painel.' } } },
  'QRA-07': { conflict: { status: 409, body: { error: 'Só é possível alterar a prioridade enquanto a pessoa aguarda.' } } },
  'QRA-08': { unavailable: errorResponse(503, 'INTERNAL_ERROR', 'Não foi possível consultar recompensas da Twitch.') },
  'QRA-09': { changed: { status: 409, body: { error: 'A associação da recompensa foi alterada. Atualize o painel.' } } },
  'QRA-10': { duplicate: { status: 409, body: { error: 'Essa pessoa já está ativa nesta fila.' } } },
  'QRA-11': { conflict: { status: 409, body: { error: 'A ação não pode ser aplicada ao estado atual.' } } },
  'QRA-12': { duplicate: { status: 409, body: { error: 'Esta notificação já está na fila.' } } },
  'QRA-13': { uncertain: errorResponse(503, 'INTERNAL_ERROR', 'The call result is uncertain.') },
  'QRA-14': { unavailable: errorResponse(503, 'INTERNAL_ERROR', 'Clear preview is unavailable.') },
  'QRA-15': { uncertain: errorResponse(503, 'INTERNAL_ERROR', 'Clear result is uncertain.') },
  'QRA-16': { conflict: errorResponse(409, 'QUEUE_NOT_AVAILABLE', 'Queue cannot change state.') },
  'QRA-17': { conflict: errorResponse(409, 'QUEUE_MODE_TRANSITION_PENDING', 'Queue mode transition is pending.') },
  'QRA-18': { conflict: { status: 409, body: { error: 'Não foi possível arquivar a fila neste estado. Verifique a sincronização da recompensa.' } } },
  'QRA-19': { conflict: errorResponse(409, 'STALE_QUEUE_VERSION', 'Queue changed; restart confirmation.') },
  'QRA-20': { expired: errorResponse(409, 'LOCAL_ARCHIVE_CHALLENGE_EXPIRED', 'Local confirmation expired.') },
  'QRA-21': { conflict: { status: 409, body: { error: 'Não foi possível desarquivar a fila. Confirme primeiro que a recompensa está pausada.' } } },
  'QRA-22': { conflict: errorResponse(409, 'QUEUE_REWARD_NOT_READY', 'Reward is not ready.') },
  'QRA-23': { processing: errorResponse(409, 'QUEUE_REWARD_OPERATION_PROCESSING', 'Reward operation is still processing.') },
});

export async function installQraApiFixtures(page, { overrides = {}, onRequest = () => undefined } = {}) {
  const calls = [];
  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const fixture = QRA_ROUTE_FIXTURES.find((candidate) => candidate.method === request.method() && candidate.pattern.test(url.pathname));
    if (!fixture) return route.continue();
    const call = {
      id: fixture.id,
      method: request.method(),
      path: url.pathname,
      headers: await request.allHeaders(),
      body: request.postDataJSON() ?? null,
    };
    calls.push(call);
    onRequest(call);
    const override = overrides[fixture.id];
    const response = override ?? fixture;
    return route.fulfill({
      status: response.status,
      contentType: 'application/json',
      headers: response.headers,
      body: JSON.stringify(response.body),
    });
  });
  return calls;
}
