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
  const settings = { getAccount: vi.fn(async () => ({ label: 'Streamer' })), setAccount: vi.fn(async (label) => ({ label })) };
  const domainService = {
    transitionEntry: vi.fn(async ({ to }) => ({ id: 'entry-1', status: to, financialDecision: 'no_operation' })),
    callNext: vi.fn(async () => [{ id: 'entry-1', twitchUserId: 'viewer-1', userLogin: 'viewer', displayName: 'Viewer', previousPosition: 1, status: 'called' }]),
  };
  const clearConfirmation = createClearConfirmationService({ repository });
  const getTwitchHealth = vi.fn(() => ({ status: 'connected', pingMs: 82 }));
  return { handler: createChatCommandHandler({ repository, domainService, twitch, settings, clearConfirmation, broadcasterId: 'broadcaster-1', productVersion: 'v0.4.0-1234567-alpha', getTwitchHealth }), repository, domainService, twitch, settings, getTwitchHealth };
}

describe('Twitch chat command handler', () => {
  it('uses the event Twitch identity for viewer position and exit', async () => {
    const h = setup();
    await h.handler({ id: 'message-1', text: '!abismo posicao', userId: 'viewer-1', userLogin: 'viewer', displayName: 'Viewer', channelId: 'broadcaster-1', badges: [] });
    expect(h.repository.getActiveEntryForUser).toHaveBeenCalledWith('queue-1', 'viewer-1');
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
    const message = { id: 'message-4', text: '!conta', userId: 'viewer-1', userLogin: 'viewer', displayName: 'Viewer', channelId: 'broadcaster-1', badges: [] };
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
    await h.handler({ id: 'ping-mod', text: '!queue ping', userId: 'mod-1', userLogin: 'mod', displayName: 'Mod', channelId: 'broadcaster-1', badges: [{ setId: 'moderator' }] });
    expect(h.getTwitchHealth).toHaveBeenCalledOnce();
    expect(h.twitch.sendChatMessage).toHaveBeenCalledWith('Pong 🏓 Bot ativo · v0.4.0-1234567-alpha · Twitch: 82 ms');
    expect(h.repository.getQueueByKey).not.toHaveBeenCalled();
    expect(h.twitch.getUserByLogin).not.toHaveBeenCalled();
  });

  it('does not read ping status or respond to an unauthorized viewer', async () => {
    const h = setup();
    await h.handler({ id: 'ping-viewer', text: '!queue ping', userId: 'viewer-1', userLogin: 'viewer', displayName: 'Viewer', channelId: 'broadcaster-1', badges: [] });
    expect(h.getTwitchHealth).not.toHaveBeenCalled();
    expect(h.twitch.sendChatMessage).not.toHaveBeenCalled();
    expect(h.repository.getQueueByKey).not.toHaveBeenCalled();
  });

  it('accepts case-insensitive global command discovery and ping subcommands', async () => {
    const h = setup();
    await h.handler({ id: 'ping-case', text: '!queue PING', userId: 'mod-1', userLogin: 'mod', displayName: 'Mod', channelId: 'broadcaster-1', badges: [{ setId: 'moderator' }] });
    await h.handler({ id: 'help-case', text: '!queue COMANDOS', userId: 'viewer-case', userLogin: 'viewer', displayName: 'Viewer', channelId: 'broadcaster-1', badges: [] });
    expect(h.twitch.sendChatMessage).toHaveBeenNthCalledWith(1, expect.stringContaining('Pong 🏓'));
    expect(h.twitch.sendChatMessage).toHaveBeenNthCalledWith(2, expect.stringContaining('!queue comandos'));
    expect(h.repository.getQueueByKey).not.toHaveBeenCalled();
  });
});
