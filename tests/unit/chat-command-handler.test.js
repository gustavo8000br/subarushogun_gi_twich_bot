import { describe, expect, it, vi } from 'vitest';
import { createChatCommandHandler } from '../../apps/api/src/commands/chat-handler.mjs';
import { createClearConfirmationService } from '../../apps/api/src/domain/clear-confirmation.mjs';

function setup() {
  const repository = {
    getQueueByKey: vi.fn(async () => ({ id: 'queue-1', slug: 'abismo', title: 'Abismo', uidMode: 'hidden', showUidInList: false, isOpen: true })),
    listQueueProjection: vi.fn(async () => [{ slug: 'abismo', title: 'Abismo', isOpen: true }]),
    getActiveEntryForUser: vi.fn(async () => ({ id: 'entry-1', status: 'waiting', position: 2 })),
    callNext: vi.fn(async () => [{ id: 'entry-1', twitchUserId: 'viewer-1', userLogin: 'viewer', displayName: 'Viewer', previousPosition: 1, status: 'called' }]),
    enqueueCallNotification: vi.fn(async () => undefined),
    moveWaitingEntry: vi.fn(async () => ({ status: 'moved' })),
    setQueueOpen: vi.fn(async (_id, isOpen) => ({ status: 'confirmed', isOpen })),
    transitionEntry: vi.fn(async ({ to }) => ({ id: 'entry-1', status: to, financialDecision: 'no_operation' })),
    listQueueChatEntries: vi.fn(async () => ({ waiting: [{ displayName: 'One', position: 1 }, { displayName: 'Two', position: 2 }], called: [], inProgress: [], totalWaiting: 2 })),
    listEntriesByStatus: vi.fn(async () => [{ id: 'entry-1', version: 1, status: 'waiting', source: 'redemption', redemptionId: 'redemption-1' }, { id: 'entry-2', version: 1, status: 'called', source: 'manual', redemptionId: null }]),
    clearActiveEntries: vi.fn(async ({ snapshot }) => ({ status: 'cleared', count: snapshot.length, refundsRequested: 1 })),
  };
  const twitch = { sendChatMessage: vi.fn(async () => ({ sent: true })), getUserByLogin: vi.fn(async () => ({ id: 'viewer-1', login: 'viewer', displayName: 'Viewer' })) };
  const settings = { getAccount: vi.fn(async () => ({ label: 'Streamer' })), setAccount: vi.fn(async (label) => ({ label })), resetAccount: vi.fn(async () => ({ label: 'Streamer' })) };
  const domainService = {
    transitionEntry: vi.fn(async ({ to }) => ({ id: 'entry-1', status: to, financialDecision: 'no_operation' })),
    callNext: vi.fn(async () => [{ id: 'entry-1', twitchUserId: 'viewer-1', userLogin: 'viewer', displayName: 'Viewer', previousPosition: 1, status: 'called' }]),
  };
  const clearConfirmation = createClearConfirmationService({ repository });
  const getTwitchHealth = vi.fn(() => ({ status: 'connected', pingMs: 82 }));
  return { handler: createChatCommandHandler({ repository, domainService, twitch, settings, clearConfirmation, broadcasterId: 'broadcaster-1', productVersion: 'v0.4.0-1234567-alpha', getTwitchHealth }), repository, domainService, twitch, settings, getTwitchHealth };
}

describe('Twitch chat command handler', () => {
  it('routes namespaced queue discovery to the public queue projection', async () => {
    const h = setup();
    await h.handler({ id: 'global-queues', text: '!fila filas', userId: 'viewer-1', userLogin: 'viewer', displayName: 'Viewer', channelId: 'broadcaster-1', badges: [] });
    expect(h.repository.listQueueProjection).toHaveBeenCalledOnce();
    expect(h.twitch.sendChatMessage).toHaveBeenCalledWith(expect.stringContaining('abismo'));
    expect(h.repository.getQueueByKey).not.toHaveBeenCalled();
  });

  it('routes account read, reset, and set by stable localized action IDs and role policy', async () => {
    const h = setup();
    await h.handler({ id: 'account-read', text: '!fila conta', userId: 'viewer-1', userLogin: 'viewer', displayName: 'Viewer', channelId: 'broadcaster-1', badges: [] });
    await h.handler({ id: 'account-set-denied', text: '!fila conta Unauthorized', userId: 'viewer-2', userLogin: 'viewer2', displayName: 'Viewer 2', channelId: 'broadcaster-1', badges: [] });
    await h.handler({ id: 'account-set', text: '!fila conta Novo Rótulo', userId: 'mod-1', userLogin: 'mod', displayName: 'Mod', channelId: 'broadcaster-1', badges: [{ setId: 'moderator' }] });
    await h.handler({ id: 'account-reset', text: '!fila conta reset', userId: 'mod-1', userLogin: 'mod', displayName: 'Mod', channelId: 'broadcaster-1', badges: [{ setId: 'moderator' }] });
    expect(h.settings.getAccount).toHaveBeenCalledOnce();
    expect(h.settings.setAccount).toHaveBeenCalledWith('Novo Rótulo', 'mod-1');
    expect(h.settings.resetAccount).toHaveBeenCalledWith('mod-1');
    expect(h.twitch.sendChatMessage).toHaveBeenCalledTimes(3);
  });

  it('uses the persisted locale to select the only accepted global root', async () => {
    const h = setup();
    h.repository.getProductLocale = vi.fn(async () => ({ locale: 'en', revision: 2 }));
    await h.handler({ id: 'localized-ping', text: '!queue ping', userId: 'mod-1', userLogin: 'mod', displayName: 'Mod', channelId: 'broadcaster-1', badges: [{ setId: 'moderator' }] });
    await h.handler({ id: 'wrong-locale-root', text: '!fila ping', userId: 'mod-1', userLogin: 'mod', displayName: 'Mod', channelId: 'broadcaster-1', badges: [{ setId: 'moderator' }] });
    expect(h.repository.getProductLocale).toHaveBeenCalledTimes(2);
    expect(h.getTwitchHealth).toHaveBeenCalledTimes(1);
    expect(h.twitch.sendChatMessage).toHaveBeenCalledTimes(1);
    expect(h.twitch.sendChatMessage).toHaveBeenCalledWith(expect.stringContaining('Pong 🏓'));
  });

  it('uses dynamically loaded chat catalogs for product-owned global responses', async () => {
    const h = setup();
    h.repository.getProductLocale = vi.fn(async () => ({ locale: 'en', revision: 3 }));
    const getChatCatalogs = vi.fn(async () => ({
      'pt-BR': { 'chat.queues.title': 'Filas disponíveis', 'chat.queues.empty': 'Não há filas disponíveis no momento.' },
      en: { 'chat.queues.title': 'Available queues', 'chat.queues.empty': 'There are no queues available right now.' },
      es: { 'chat.queues.title': 'Colas disponibles', 'chat.queues.empty': 'No hay colas disponibles ahora.' },
    }));
    h.handler = createChatCommandHandler({
      repository: h.repository, domainService: h.domainService, twitch: h.twitch, settings: h.settings,
      broadcasterId: 'broadcaster-1', getChatCatalogs,
    });
    h.repository.listQueueProjection.mockResolvedValue([]);
    await h.handler({ id: 'localized-empty-queues', text: '!queue queues', userId: 'viewer-en', userLogin: 'viewer', displayName: 'Viewer', channelId: 'broadcaster-1', badges: [] });
    expect(getChatCatalogs).toHaveBeenCalledOnce();
    expect(h.twitch.sendChatMessage).toHaveBeenCalledWith('There are no queues available right now.');
  });

  it('localizes existing queue command replies from the discovered chat module', async () => {
    const h = setup();
    h.repository.getProductLocale = vi.fn(async () => ({ locale: 'en', revision: 4 }));
    const getChatCatalogs = vi.fn(async () => ({
      'pt-BR': { 'chat.queue.position': '@{user}, você está na posição {position}.' },
      en: { 'chat.queue.position': '@{user}, you are at position {position}.' },
      es: { 'chat.queue.position': '@{user}, estás en la posición {position}.' },
    }));
    h.handler = createChatCommandHandler({ repository: h.repository, domainService: h.domainService, twitch: h.twitch, settings: h.settings, broadcasterId: 'broadcaster-1', getChatCatalogs });
    await h.handler({ id: 'localized-queue-position', text: '!abismo position', userId: 'position-locale-user', userLogin: 'viewer', displayName: 'Viewer', channelId: 'broadcaster-1', badges: [] });
    expect(h.twitch.sendChatMessage).toHaveBeenCalledWith('@viewer, you are at position 2.');
  });

  it('discovers a community locale command root and help label without a code registry', async () => {
    const h = setup();
    h.repository.getProductLocale = vi.fn(async () => ({ locale: 'de', revision: 5 }));
    const getChatCatalogs = vi.fn(async () => ({
      de: {
        'chat.command.root': 'warteschlange',
        'chat.command.global.commands': 'befehle',
        'chat.command.global.ping': 'ping',
        'chat.command.global.queues': 'warteschlangen',
        'chat.command.global.account': 'konto',
        'chat.command.global.account_reset': 'zuruecksetzen',
        'chat.command.queue.comandos': 'befehle',
        'chat.help.global_heading': 'Global',
        'chat.help.queue_heading': 'Für jede Warteschlange',
        'chat.help.panel_suffix': 'Vollständiger Katalog im Panel.',
      },
    }));
    h.handler = createChatCommandHandler({ repository: h.repository, domainService: h.domainService, twitch: h.twitch, settings: h.settings, broadcasterId: 'broadcaster-1', getChatCatalogs });
    await h.handler({ id: 'community-locale-help', text: '!warteschlange befehle', userId: 'viewer-de', userLogin: 'viewer', displayName: 'Viewer', channelId: 'broadcaster-1', badges: [] });
    expect(h.twitch.sendChatMessage).toHaveBeenCalledWith(expect.stringContaining('!warteschlange befehle'));
  });

  it('uses the event Twitch identity for viewer position and exit', async () => {
    const h = setup();
    await h.handler({ id: 'message-position-1', text: '!abismo posicao', userId: 'position-viewer', userLogin: 'viewer', displayName: 'Viewer', channelId: 'broadcaster-1', badges: [] });
    expect(h.repository.getActiveEntryForUser).toHaveBeenCalledWith('queue-1', 'position-viewer');
    expect(h.twitch.sendChatMessage).toHaveBeenCalledWith(expect.stringContaining('posição 2'));
    expect(h.repository.transitionEntry).not.toHaveBeenCalled();
  });

  it('does not execute management commands from viewers and sends no response', async () => {
    const h = setup();
    await h.handler({ id: 'message-2', text: '!abismo proximo', userId: 'viewer-1', userLogin: 'viewer', displayName: 'Viewer', channelId: 'broadcaster-1', badges: [] });
    expect(h.repository.callNext).not.toHaveBeenCalled();
    expect(h.twitch.sendChatMessage).not.toHaveBeenCalled();
  });

  it.each([
    ['VIP with management toggle', [{ setId: 'vip' }], true],
    ['subscriber', [{ setId: 'subscriber' }], false],
  ])('does not execute queue mutations from %s', async (_label, badges, allowVipManagement) => {
    const h = setup();
    h.handler = createChatCommandHandler({
      repository: h.repository,
      domainService: h.domainService,
      twitch: h.twitch,
      settings: h.settings,
      clearConfirmation: createClearConfirmationService({ repository: h.repository }),
      broadcasterId: 'broadcaster-1',
      allowVipManagement,
    });

    await h.handler({ id: `denied-${_label}`, text: '!abismo remover viewer', userId: 'role-user', userLogin: 'roleuser', displayName: 'Role User', channelId: 'broadcaster-1', badges });

    expect(h.repository.getQueueByKey).not.toHaveBeenCalled();
    expect(h.repository.getActiveEntryForUser).not.toHaveBeenCalled();
    expect(h.domainService.transitionEntry).not.toHaveBeenCalled();
    expect(h.twitch.getUserByLogin).not.toHaveBeenCalled();
    expect(h.twitch.sendChatMessage).not.toHaveBeenCalled();
  });

  it('calls a bounded group only for a moderator and reports the actual count', async () => {
    const h = setup();
    await h.handler({ id: 'message-3', text: '!abismo próximo 2', userId: 'mod-1', userLogin: 'mod', displayName: 'Mod', channelId: 'broadcaster-1', badges: [{ setId: 'moderator' }] });
    expect(h.domainService.callNext).toHaveBeenCalledWith({ queueId: 'queue-1', count: 2, actorId: 'mod-1' });
    expect(h.repository.callNext).not.toHaveBeenCalled();
    expect(h.repository.enqueueCallNotification).toHaveBeenCalledWith(expect.objectContaining({ entryId: 'entry-1', queueId: 'queue-1' }));
    expect(h.twitch.sendChatMessage).toHaveBeenCalledWith(expect.stringContaining('1 pessoa chamada'));
  });

  it('uses the active locale plural form for multi-person call replies', async () => {
    const h = setup();
    h.repository.getProductLocale = vi.fn(async () => ({ locale: 'en', revision: 6 }));
    h.domainService.callNext.mockResolvedValue([
      { id: 'entry-1', twitchUserId: 'viewer-1', userLogin: 'viewer', displayName: 'Viewer', previousPosition: 1, status: 'called' },
      { id: 'entry-2', twitchUserId: 'viewer-2', userLogin: 'viewer2', displayName: 'Viewer 2', previousPosition: 2, status: 'called' },
    ]);
    h.handler = createChatCommandHandler({
      repository: h.repository, domainService: h.domainService, twitch: h.twitch, settings: h.settings,
      broadcasterId: 'broadcaster-1', getChatCatalogs: async () => ({
        en: {
          'chat.command.queue.proximo': 'next',
          'chat.queue.called_many.one': '{count} viewer called.',
          'chat.queue.called_many.other': '{count} viewers called.',
          'translation.unavailable': 'Product text unavailable.',
        },
        'pt-BR': {
          'chat.queue.called_many.one': '{count} pessoa chamada.',
          'chat.queue.called_many.other': '{count} pessoas chamadas.',
          'translation.unavailable': 'Texto indisponível.',
        },
      }),
    });
    await h.handler({ id: 'plural-call-en', text: '!abismo next 2', userId: 'mod-1', userLogin: 'mod', displayName: 'Mod', channelId: 'broadcaster-1', badges: [{ setId: 'moderator' }] });
    expect(h.twitch.sendChatMessage).toHaveBeenCalledWith('2 viewers called.');
  });

  it('maps the displayed queue position into the same priority lane when moving from chat', async () => {
    const h = setup();
    h.repository.getActiveEntryForUser.mockResolvedValue({ id: 'entry-standard', status: 'waiting', priorityClass: 'standard', position: 3 });
    h.repository.listWaiting = vi.fn(async () => [
      { id: 'entry-priority-1', priorityClass: 'priority' },
      { id: 'entry-priority-2', priorityClass: 'priority' },
      { id: 'entry-standard', priorityClass: 'standard' },
      { id: 'entry-standard-2', priorityClass: 'standard' },
    ]);

    await h.handler({ id: 'move-standard-1', text: '!abismo mover viewer 4', userId: 'mod-1', userLogin: 'mod', displayName: 'Mod', channelId: 'broadcaster-1', badges: [{ setId: 'moderator' }] });

    expect(h.repository.moveWaitingEntry).toHaveBeenCalledWith({ queueId: 'queue-1', entryId: 'entry-standard', position: 2 });
    expect(h.twitch.sendChatMessage).toHaveBeenCalledWith('Posição atualizada.');
  });

  it('does not move a standard entry into a displayed priority-lane position', async () => {
    const h = setup();
    h.repository.getActiveEntryForUser.mockResolvedValue({ id: 'entry-standard', status: 'waiting', priorityClass: 'standard' });
    h.repository.listWaiting = vi.fn(async () => [
      { id: 'entry-priority', priorityClass: 'priority' },
      { id: 'entry-standard', priorityClass: 'standard' },
    ]);

    await h.handler({ id: 'move-standard-cross-lane', text: '!abismo mover viewer 1', userId: 'mod-1', userLogin: 'mod', displayName: 'Mod', channelId: 'broadcaster-1', badges: [{ setId: 'moderator' }] });

    expect(h.repository.moveWaitingEntry).not.toHaveBeenCalled();
    expect(h.twitch.sendChatMessage).toHaveBeenCalledWith('Não foi possível mover essa pessoa.');
  });

  it('routes viewer exit through the shared domain service', async () => {
    const h = setup();
    await h.handler({ id: 'exit-1', text: '!abismo sair', userId: 'viewer-exit-1', userLogin: 'viewer', displayName: 'Viewer', channelId: 'broadcaster-1', badges: [] });
    expect(h.domainService.transitionEntry).toHaveBeenCalledWith({ entryId: 'entry-1', to: 'removed', origin: 'viewer', actorId: 'viewer-exit-1', reason: 'viewer_left' });
    expect(h.repository.transitionEntry).not.toHaveBeenCalled();
  });

  it('deduplicates message IDs and ignores Shared Chat messages from another source channel', async () => {
    const h = setup();
    const message = { id: 'message-4', text: '!fila conta', userId: 'viewer-1', userLogin: 'viewer', displayName: 'Viewer', channelId: 'broadcaster-1', badges: [] };
    await h.handler(message);
    await h.handler(message);
    await h.handler({ ...message, id: 'message-5', sourceChannelId: 'other-channel' });
    expect(h.twitch.sendChatMessage).toHaveBeenCalledTimes(1);
  });

  it('claims each authorized command durably before applying its effects', async () => {
    const h = setup();
    h.repository.claimChatCommand = vi.fn(async () => ({ status: 'duplicate' }));
    await h.handler({ id: 'durable-message-1', text: '!abismo proximo', userId: 'mod-1', userLogin: 'mod', displayName: 'Mod', channelId: 'broadcaster-1', badges: [{ setId: 'moderator' }] });
    expect(h.repository.claimChatCommand).toHaveBeenCalledWith(expect.objectContaining({
      messageId: 'durable-message-1', channelId: 'broadcaster-1', userId: 'mod-1', role: 'moderator', cooldownExempt: false,
    }));
    expect(h.domainService.callNext).not.toHaveBeenCalled();
    expect(h.twitch.sendChatMessage).not.toHaveBeenCalled();
  });

  it('does not announce an opening reward as open before Twitch confirmation', async () => {
    const h = setup();
    h.repository.getQueueByKey.mockResolvedValue({ id: 'queue-1', slug: 'abismo', title: 'Abismo', uidMode: 'hidden', showUidInList: false, isOpen: true, remoteSyncStatus: 'pending_open' });
    await h.handler({ id: 'pending-open-list', text: '!abismo lista', userId: 'mod-1', userLogin: 'mod', displayName: 'Mod', channelId: 'broadcaster-1', badges: [{ setId: 'moderator' }] });
    expect(h.twitch.sendChatMessage).toHaveBeenCalledWith(expect.stringContaining('abertura pendente'));
    expect(h.twitch.sendChatMessage).not.toHaveBeenCalledWith(expect.stringContaining('Abismo · Aguardando'));
  });

  it('requires the same authorized actor and channel to confirm queue clearing before mutation', async () => {
    const h = setup();
    await h.handler({ id: 'clear-1', text: '!abismo limpar', userId: 'mod-1', userLogin: 'mod', displayName: 'Mod', channelId: 'broadcaster-1', badges: [{ setId: 'moderator' }] });
    expect(h.twitch.sendChatMessage).toHaveBeenLastCalledWith(expect.stringContaining('2 pessoas'));
    expect(h.repository.clearActiveEntries).not.toHaveBeenCalled();
    await h.handler({ id: 'clear-2', text: '!abismo limpar confirmar', userId: 'mod-2', userLogin: 'other', displayName: 'Other', channelId: 'broadcaster-1', badges: [{ setId: 'moderator' }] });
    expect(h.repository.clearActiveEntries).not.toHaveBeenCalled();
    await h.handler({ id: 'clear-3', text: '!abismo limpar confirmar', userId: 'mod-1', userLogin: 'mod', displayName: 'Mod', channelId: 'broadcaster-1', badges: [{ setId: 'moderator' }] });
    expect(h.repository.clearActiveEntries).toHaveBeenCalledOnce();
    expect(h.twitch.sendChatMessage).toHaveBeenLastCalledWith(expect.stringContaining('reembolsos solicitados e pendentes'));
  });

  it('answers global ping for a moderator using cached health and the running version', async () => {
    const h = setup();
    await h.handler({ id: 'ping-mod', text: '!fila ping', userId: 'mod-1', userLogin: 'mod', displayName: 'Mod', channelId: 'broadcaster-1', badges: [{ setId: 'moderator' }] });
    expect(h.getTwitchHealth).toHaveBeenCalledOnce();
    expect(h.twitch.sendChatMessage).toHaveBeenCalledWith('Pong 🏓 Bot ativo · v0.4.0-1234567-alpha · Twitch: 82 ms');
    expect(h.repository.getQueueByKey).not.toHaveBeenCalled();
    expect(h.twitch.getUserByLogin).not.toHaveBeenCalled();
  });

  it('does not read ping status or respond to an unauthorized viewer', async () => {
    const h = setup();
    await h.handler({ id: 'ping-viewer', text: '!fila ping', userId: 'viewer-1', userLogin: 'viewer', displayName: 'Viewer', channelId: 'broadcaster-1', badges: [] });
    expect(h.getTwitchHealth).not.toHaveBeenCalled();
    expect(h.twitch.sendChatMessage).not.toHaveBeenCalled();
    expect(h.repository.getQueueByKey).not.toHaveBeenCalled();
  });

  it('accepts case-insensitive global command discovery and ping subcommands', async () => {
    const h = setup();
    await h.handler({ id: 'ping-case', text: '!fila PING', userId: 'mod-1', userLogin: 'mod', displayName: 'Mod', channelId: 'broadcaster-1', badges: [{ setId: 'moderator' }] });
    await h.handler({ id: 'help-case', text: '!fila COMANDOS', userId: 'viewer-case', userLogin: 'viewer', displayName: 'Viewer', channelId: 'broadcaster-1', badges: [] });
    expect(h.twitch.sendChatMessage).toHaveBeenNthCalledWith(1, expect.stringContaining('Pong 🏓'));
    expect(h.twitch.sendChatMessage).toHaveBeenNthCalledWith(2, expect.stringContaining('!fila comandos'));
    expect(h.repository.getQueueByKey).not.toHaveBeenCalled();
  });
});
