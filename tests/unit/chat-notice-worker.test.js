import { describe, expect, it, vi } from 'vitest';
import { createChatNoticeWorker } from '../../apps/api/src/outbox/chat-notice-worker.mjs';

const catalogs = {
  en: {
    'translation.unavailable': 'unavailable',
    'chat.notice.joined': '@{user}, you joined {queue} at position {position}.',
    'chat.notice.joined_many': '{count} people joined {queue}.',
    'chat.notice.service_ended': '@{user}, done in {queue}.',
  },
};
const now = new Date('2030-01-01T12:00:00.000Z');
const queue = (extra = {}) => ({ id: 'q1', title: 'Abyss', noticeJoined: true, noticeService: true, noticeState: true, ...extra });
const task = (extra = {}) => ({
  id: 't1', ids: ['t1'], attempts: 1, leaseToken: 'lease', summaryCount: 1, queue: queue(),
  payload: { kind: 'joined', priority: 1, maxAttempts: 3, expiresAt: '2030-01-01T12:05:00.000Z', user: 'viewer', position: 2 },
  ...extra,
});

function harness({ claimed = task(), result = { sent: true }, sendThrows = false } = {}) {
  const repository = {
    claimNextChatNotice: vi.fn(async () => claimed),
    finishChatNotice: vi.fn(async () => ({ count: 1 })),
    getProductLocale: vi.fn(async () => ({ locale: 'en' })),
  };
  const twitch = { sendChatMessage: vi.fn(async () => { if (sendThrows) throw new Error('boom uid=123 token=abc'); return result; }) };
  const logEvent = vi.fn();
  const worker = createChatNoticeWorker({ repository, twitch, getChatCatalogs: async () => catalogs, clock: () => now, logEvent });
  return { worker, repository, twitch, logEvent };
}

describe('OPS-31 P2 chat notice worker', () => {
  it('U71-02: sends one message in the product locale with the notice priority and confirms the row', async () => {
    const h = harness();
    expect(await h.worker.processOne()).toBe('confirmed');
    expect(h.twitch.sendChatMessage).toHaveBeenCalledTimes(1);
    expect(h.twitch.sendChatMessage).toHaveBeenCalledWith('@viewer, you joined Abyss at position 2.', { priority: 1 });
    expect(h.repository.finishChatNotice).toHaveBeenCalledWith(['t1'], expect.objectContaining({ status: 'confirmed', leaseToken: 'lease' }));
  });

  it('sends one summary for a claimed group of joins and confirms every row', async () => {
    const h = harness({ claimed: task({ ids: ['t1', 't2', 't3', 't4'], summaryCount: 4 }) });
    expect(await h.worker.processOne()).toBe('confirmed');
    expect(h.twitch.sendChatMessage).toHaveBeenCalledWith('4 people joined Abyss.', { priority: 1 });
    expect(h.repository.finishChatNotice).toHaveBeenCalledWith(['t1', 't2', 't3', 't4'], expect.objectContaining({ status: 'confirmed' }));
  });

  it('U71-11: a switch turned off after queueing sends nothing', async () => {
    const h = harness({ claimed: task({ queue: queue({ noticeJoined: false }) }) });
    expect(await h.worker.processOne()).toBe('cancelled');
    expect(h.twitch.sendChatMessage).not.toHaveBeenCalled();
    expect(h.repository.finishChatNotice).toHaveBeenCalledWith(['t1'], expect.objectContaining({ status: 'cancelled', errorCode: 'notice_switched_off' }));
  });

  it.each([
    ['is_sent false', { sent: false }],
    ['is_sent undefined', {}],
    ['is_sent null', { sent: null }],
    ['is_sent string', { sent: 'true' }],
    ['no answer', null],
  ])('U71-10: %s is "not delivered" and retries while attempts remain', async (_name, result) => {
    const h = harness({ result });
    expect(await h.worker.processOne()).toBe('retry');
    expect(h.repository.finishChatNotice).toHaveBeenCalledWith(['t1'], expect.objectContaining({ status: 'retry', errorCode: 'chat_delivery_not_confirmed' }));
  });

  it('U71-09/TW71-01: a rate-limited send retries, then expires when attempts are used (never forever)', async () => {
    const limited = { sent: false, rateLimited: true };
    expect(await harness({ result: limited }).worker.processOne()).toBe('retry');
    const last = harness({ claimed: task({ attempts: 3 }), result: limited });
    expect(await last.worker.processOne()).toBe('expired');
    expect(last.repository.finishChatNotice).toHaveBeenCalledWith(['t1'], expect.objectContaining({ status: 'expired', errorCode: 'chat_rate_limited' }));
  });

  it('expires a notice past its expiry even with attempts left', async () => {
    const h = harness({ claimed: task({ payload: { ...task().payload, expiresAt: '2030-01-01T11:59:00.000Z' } }), result: { sent: false } });
    expect(await h.worker.processOne()).toBe('expired');
  });

  it('U71-13/U71-14: a throwing sender only retries; the error text and ids never reach a log', async () => {
    const h = harness({ sendThrows: true });
    expect(await h.worker.processOne()).toBe('retry');
    const logged = JSON.stringify(h.logEvent.mock.calls);
    expect(logged).not.toMatch(/uid=123|token|abc|viewer|Abyss/);
    const ok = harness();
    await ok.worker.processOne();
    expect(JSON.stringify(ok.logEvent.mock.calls)).not.toMatch(/viewer|Abyss/);
  });

  it('is idle without an adapter or a due notice and survives a failing log sink', async () => {
    const repository = { claimNextChatNotice: vi.fn(async () => null) };
    expect(await createChatNoticeWorker({ repository }).processOne()).toBe('idle');
    expect(await createChatNoticeWorker({ repository, twitch: {} }).processOne()).toBe('idle');
    const h = harness();
    const worker = createChatNoticeWorker({ repository: h.repository, twitch: h.twitch, getChatCatalogs: async () => catalogs, clock: () => now, logEvent: () => { throw new Error('sink'); } });
    expect(await worker.processOne()).toBe('confirmed');
  });

  it('cancels a notice whose text cannot be composed instead of sending a placeholder', async () => {
    const h = harness({ claimed: task({ payload: { ...task().payload, kind: 'unknown_kind' } }) });
    expect(await h.worker.processOne()).toBe('cancelled');
    expect(h.twitch.sendChatMessage).not.toHaveBeenCalled();
  });
});
