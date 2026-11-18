import { describe, expect, it, vi } from 'vitest';
import { HttpStatusCodeError } from '@twurple/api-call';
import { createGroupLookup, GROUP_LOOKUP_CHUNK_SIZE, GROUP_LOOKUP_REASONS } from '../../apps/api/src/twitch/group-lookup.mjs';
import { createTwitchApiAdapter } from '../../apps/api/src/twitch/helix-adapter.mjs';
import { decideGroupMembership } from '../../apps/api/src/domain/group-membership.mjs';

const SCOPES = ['moderation:read', 'channel:read:vips', 'channel:read:subscriptions'];
const authWith = (scopes = SCOPES) => ({ getCurrentScopesForUser: () => scopes });
const ids = (n, start = 1) => Array.from({ length: n }, (_, i) => String(start + i));
const httpError = (status) => new HttpStatusCodeError(status, 'x', 'https://api.twitch.tv/helix/x', 'GET', '{}', true);

function makeApi({ mods = [], vips = [], subs = [] } = {}) {
  return {
    moderation: { getModerators: vi.fn(async (_b, { userId }) => ({ data: userId.filter((id) => mods.includes(id)).map((id) => ({ userId: id })) })) },
    channels: { checkVipForUsers: vi.fn(async (_b, users) => users.filter((id) => vips.includes(id)).map((id) => ({ id }))) },
    subscriptions: { getSubscriptionsForUsers: vi.fn(async (_b, users) => users.filter((id) => subs.includes(id)).map((id) => ({ userId: id }))) },
  };
}
const make = (api, extra = {}) => createGroupLookup({ api, broadcasterId: '999', authProvider: authWith(), ...extra });

describe('OPS-31 P6 group lookup (FT-75)', () => {
  it('U75-01: each Twitch group answers its members and nobody else', async () => {
    const api = makeApi({ mods: ['1'], vips: ['2'], subs: ['3'] });
    const lookup = make(api);
    expect([...(await lookup('moderator', ['1', '2'])).members]).toEqual(['1']);
    expect([...(await lookup('vip', ['1', '2'])).members]).toEqual(['2']);
    expect([...(await lookup('subscriber', ['3', '4'])).members]).toEqual(['3']);
  });

  it('TW75-05: paid, gifted and Prime-shaped subscription records all count (fixture level)', async () => {
    const api = { subscriptions: { getSubscriptionsForUsers: vi.fn(async () => [
      { userId: '1', tier: '1000', isGift: false }, { userId: '2', tier: '1000', isGift: true }, { userId: '3', tier: 'Prime' }]) } };
    const { members, failures } = await make(api)('subscriber', ['1', '2', '3']);
    expect([...members].sort()).toEqual(['1', '2', '3']);
    expect(failures.size).toBe(0);
  });

  it('U75-10: a missing scope is scope_missing for every id with zero Twitch calls', async () => {
    const api = makeApi({ mods: ['1'] });
    const lookup = createGroupLookup({ api, broadcasterId: '999', authProvider: authWith(['moderation:read']) });
    const vip = await lookup('vip', ['1', '2']);
    expect([...vip.failures.values()]).toEqual(['scope_missing', 'scope_missing']);
    expect(api.channels.checkVipForUsers).not.toHaveBeenCalled();
    const noProvider = await createGroupLookup({ api, broadcasterId: '999' })('moderator', ['1']);
    expect(noProvider.failures.get('1')).toBe('scope_missing');
    expect(api.moderation.getModerators).not.toHaveBeenCalled();
    // The manage variants are NOT accepted: least privilege (design 9).
    const manage = createGroupLookup({ api, broadcasterId: '999', authProvider: authWith(['channel:manage:vips']) });
    expect((await manage('vip', ['1'])).failures.get('1')).toBe('scope_missing');
  });

  it.each([
    [401, 'unauthorized'], [403, 'forbidden'], [429, 'rate_limited'], [500, 'twitch_unavailable'], [503, 'twitch_unavailable'], [404, 'lookup_error'], [400, 'lookup_error'],
  ])('TW75-01/06: the real Twurple HttpStatusCodeError %i maps to %s', async (status, reason) => {
    const api = makeApi();
    api.channels.checkVipForUsers = vi.fn(async () => { throw httpError(status); });
    const { members, failures } = await make(api)('vip', ['1']);
    expect(members.size).toBe(0);
    expect(failures.get('1')).toBe(reason);
    expect(GROUP_LOOKUP_REASONS).toContain(reason);
  });

  it('TW75-01: a network error is lookup_error and never a "not a member" answer', async () => {
    const api = makeApi();
    api.moderation.getModerators = vi.fn(async () => { throw new Error('socket hang up'); });
    expect((await make(api)('moderator', ['1'])).failures.get('1')).toBe('lookup_error');
  });

  it('TW75-01: malformed bodies fail closed (not an array, an id nobody asked for, a record without an id)', async () => {
    for (const body of [{ data: 'nope' }, { data: [{ userId: '777' }] }, { data: [{}] }, null]) {
      const api = makeApi();
      api.moderation.getModerators = vi.fn(async () => body);
      expect((await make(api)('moderator', ['1'])).failures.get('1')).toBe('malformed_response');
    }
    const api = makeApi();
    api.subscriptions.getSubscriptionsForUsers = vi.fn(async () => [{ userId: '1' }, { userId: 5 }]);
    expect((await make(api)('subscriber', ['1'])).failures.get('1')).toBe('malformed_response');
  });

  it('G-15: a call that never answers times out per call; a late answer is discarded', async () => {
    vi.useFakeTimers();
    try {
      let late;
      const api = makeApi();
      api.channels.checkVipForUsers = vi.fn(() => new Promise((resolve) => { late = resolve; }));
      const pending = make(api)('vip', ['1']);
      await vi.advanceTimersByTimeAsync(3_001);
      const result = await pending;
      expect(result.failures.get('1')).toBe('timeout');
      late([{ id: '1' }]);
      await vi.advanceTimersByTimeAsync(10);
      expect(result.members.size).toBe(0);
    } finally { vi.useRealTimers(); }
  });

  it('G-15: the overall bound stops later chunks: chunks after the deadline are timeout with no further call', async () => {
    vi.useFakeTimers();
    try {
      const api = makeApi();
      api.channels.checkVipForUsers = vi.fn(() => new Promise(() => {}));
      const size = GROUP_LOOKUP_CHUNK_SIZE.vip;
      const pending = make(api, { overallTimeoutMs: 4_000 })('vip', ids(size * 3));
      let done = false;
      pending.then(() => { done = true; });
      await vi.advanceTimersByTimeAsync(4_001);
      expect(done).toBe(true); // the second chunk got only the 1 s left, not a full 3 s
      const { failures } = await pending;
      expect(failures.size).toBe(size * 3);
      expect([...new Set(failures.values())]).toEqual(['timeout']);
      expect(api.channels.checkVipForUsers).toHaveBeenCalledTimes(2); // 3 s then 1 s left; the third chunk is past the deadline
    } finally { vi.useRealTimers(); }
  });

  it('TW75-03: chunks are bounded, one call per group per chunk, ids deduplicated', async () => {
    const api = makeApi({ mods: ids(250) });
    const lookup = make(api);
    const result = await lookup('moderator', [...ids(250), ...ids(10)]);
    expect(result.members.size).toBe(250);
    expect(api.moderation.getModerators).toHaveBeenCalledTimes(3);
    expect(api.moderation.getModerators.mock.calls.every(([, filter]) => filter.userId.length <= 100 && filter.limit === 100)).toBe(true);
    await lookup('vip', ids(45));
    expect(api.channels.checkVipForUsers.mock.calls.map(([, list]) => list.length)).toEqual([20, 20, 5]);
    await lookup('subscriber', ids(41));
    expect(api.subscriptions.getSubscriptionsForUsers.mock.calls.map(([, list]) => list.length)).toEqual([20, 20, 1]);
  });

  it('TW75-03: a failing chunk fails only its own ids', async () => {
    const api = makeApi({ vips: ids(60) });
    let call = 0;
    const base = api.channels.checkVipForUsers;
    api.channels.checkVipForUsers = vi.fn(async (b, users) => { call += 1; if (call === 2) throw httpError(500); return base(b, users); });
    const { members, failures } = await make(api)('vip', ids(60));
    expect(members.size).toBe(40);
    expect([...failures.keys()].sort((a, b) => a - b)).toEqual(ids(20, 21));
  });

  it('TW75-04: a 429 waits once within the bound when the wait is known, then gives up; unknown wait is rate_limited at once', async () => {
    vi.useFakeTimers();
    try {
      const api = makeApi({ vips: ['1'] });
      const base = api.channels.checkVipForUsers;
      let calls = 0;
      api.channels.checkVipForUsers = vi.fn(async (b, u) => { calls += 1; if (calls === 1) throw Object.assign(httpError(429), { retryAfterSeconds: 2 }); return base(b, u); });
      const pending = make(api)('vip', ['1']);
      await vi.advanceTimersByTimeAsync(2_100);
      expect((await pending).members.has('1')).toBe(true);
      expect(calls).toBe(2);

      const always = makeApi();
      always.channels.checkVipForUsers = vi.fn(async () => { throw Object.assign(httpError(429), { retryAfterSeconds: 1 }); });
      const second = make(always)('vip', ['1']);
      await vi.advanceTimersByTimeAsync(1_500);
      expect((await second).failures.get('1')).toBe('rate_limited');
      expect(always.channels.checkVipForUsers).toHaveBeenCalledTimes(2); // exactly one retry

      const tooLong = makeApi();
      tooLong.channels.checkVipForUsers = vi.fn(async () => { throw Object.assign(httpError(429), { retryAfterSeconds: 30 }); });
      expect((await make(tooLong)('vip', ['1'])).failures.get('1')).toBe('rate_limited');
      expect(tooLong.channels.checkVipForUsers).toHaveBeenCalledTimes(1);
      const farButAllowedByDeadline = makeApi();
      farButAllowedByDeadline.channels.checkVipForUsers = vi.fn(async () => { throw Object.assign(httpError(429), { retryAfterSeconds: 6 }); });
      expect((await make(farButAllowedByDeadline, { overallTimeoutMs: 60_000 })('vip', ['1'])).failures.get('1')).toBe('rate_limited');
      expect(farButAllowedByDeadline.channels.checkVipForUsers).toHaveBeenCalledTimes(1); // 6 s is over the 5 s wait bound
      const noHeader = makeApi();
      noHeader.channels.checkVipForUsers = vi.fn(async () => { throw httpError(429); });
      expect((await make(noHeader)('vip', ['1'])).failures.get('1')).toBe('rate_limited');
      expect(noHeader.channels.checkVipForUsers).toHaveBeenCalledTimes(1);
    } finally { vi.useRealTimers(); }
  });

  it('invalid ids and unknown groups never reach Twitch', async () => {
    const api = makeApi();
    const lookup = make(api);
    const result = await lookup('vip', ['not-an-id', '', '1; drop']);
    expect([...result.failures.values()]).toEqual(['lookup_error', 'lookup_error', 'lookup_error']);
    expect((await lookup('own_list', ['1'])).failures.get('1')).toBe('lookup_error');
    expect(api.channels.checkVipForUsers).not.toHaveBeenCalled();
  });

  it('AC 23: the report hook carries group, outcome, reason, latency bucket and a count only', async () => {
    const events = [];
    const api = makeApi({ mods: ['4242'] });
    await make(api, { report: (event) => events.push(event) })('moderator', ['4242', '5']);
    expect(events).toHaveLength(1);
    expect(Object.keys(events[0]).sort()).toEqual(['count', 'group', 'latencyBucket', 'outcome', 'reason']);
    expect(JSON.stringify(events)).not.toMatch(/4242/);
    const thrower = make(api, { report: () => { throw new Error('boom'); } });
    await expect(thrower('moderator', ['4242'])).resolves.toBeDefined();
  });

  it('the adapter exposes the lookup and the channel type (no new Twurple surface beyond the three read calls)', async () => {
    const api = { ...makeApi({ vips: ['1'] }), users: { getUserById: vi.fn(async () => ({ broadcasterType: 'Affiliate' })) } };
    const adapter = createTwitchApiAdapter({ api, broadcasterId: '999', authProvider: authWith() });
    expect((await adapter.lookupGroupMembers('vip', ['1'])).members.has('1')).toBe(true);
    await expect(adapter.getBroadcasterType()).resolves.toBe('affiliate');
    api.users.getUserById = vi.fn(async () => ({ broadcasterType: '' }));
    await expect(adapter.getBroadcasterType()).resolves.toBe('none');
    api.users.getUserById = vi.fn(async () => { throw new Error('down'); });
    await expect(adapter.getBroadcasterType()).resolves.toBeNull();
  });
});

describe('OPS-31 P6 membership decision (AC 13-15)', () => {
  const run = (options) => decideGroupMembership({ broadcasterId: '999', groups: ['own_list', 'moderator', 'vip', 'subscriber'], ...options });
  const lookupOf = (answers) => vi.fn(async (group, list) => {
    const a = answers[group] ?? {};
    return { members: new Set(list.filter((id) => (a.members ?? []).includes(id))), failures: new Map(list.filter((id) => a.failAll || (a.failIds ?? []).includes(id)).map((id) => [id, a.reason ?? 'lookup_error'])) };
  });

  it('U75-03: the broadcaster is eligible with zero calls', async () => {
    const lookupGroup = lookupOf({});
    const out = await run({ userIds: ['999'], lookupGroup });
    expect(out.get('999')).toEqual({ decision: 'eligible', matchedGroup: 'broadcaster' });
    expect(lookupGroup).not.toHaveBeenCalled();
  });

  it('U75-01/02: each group alone matches; the fixed order own list, moderator, VIP, subscriber decides matched_group', async () => {
    const lookupGroup = lookupOf({ moderator: { members: ['2', '5'] }, vip: { members: ['3', '5'] }, subscriber: { members: ['4', '5', '3'] } });
    const out = await run({ userIds: ['1', '2', '3', '4', '5', '6'], ownListMembers: new Set(['1', '5']), lookupGroup });
    expect(Object.fromEntries([...out].map(([id, d]) => [id, d.matchedGroup ?? d.decision]))).toEqual({ 1: 'own_list', 2: 'moderator', 3: 'vip', 4: 'subscriber', 5: 'own_list', 6: 'not_eligible' });
    expect(lookupGroup.mock.calls.map(([group, list]) => [group, list])).toEqual([['moderator', ['2', '3', '4', '6']], ['vip', ['3', '4', '6']], ['subscriber', ['4', '6']]]);
  });

  it('U75-04: one failure plus one positive is eligible', async () => {
    const lookupGroup = lookupOf({ moderator: { failAll: true, reason: 'timeout' }, vip: { members: ['1'] } });
    expect((await run({ userIds: ['1'], lookupGroup })).get('1')).toEqual({ decision: 'eligible', matchedGroup: 'vip' });
  });

  it('U75-05: a failure and no positive is unknown with the FIRST failure reason; all answered and none positive is not_eligible', async () => {
    const lookupGroup = lookupOf({ moderator: { failAll: true, reason: 'forbidden' }, vip: { failAll: true, reason: 'timeout' } });
    expect((await run({ userIds: ['1'], lookupGroup })).get('1')).toEqual({ decision: 'unknown', unknownReason: 'forbidden' });
    expect((await run({ userIds: ['1'], lookupGroup: lookupOf({}) })).get('1')).toEqual({ decision: 'not_eligible' });
  });

  it('a lookup that throws never becomes not_eligible', async () => {
    const out = await run({ userIds: ['1'], lookupGroup: vi.fn(async () => { throw new Error('boom'); }) });
    expect(out.get('1')).toEqual({ decision: 'unknown', unknownReason: 'lookup_error' });
  });

  it('only enabled groups are consulted; an empty set asks nobody', async () => {
    const lookupGroup = lookupOf({ vip: { members: ['1'] } });
    await run({ userIds: ['1'], groups: ['vip'], lookupGroup });
    expect(lookupGroup.mock.calls.map(([group]) => group)).toEqual(['vip']);
    const none = lookupOf({});
    expect((await run({ userIds: ['1'], groups: [], lookupGroup: none })).get('1')).toEqual({ decision: 'not_eligible' });
    expect(none).not.toHaveBeenCalled();
    // The own list only counts when that group is enabled.
    expect((await run({ userIds: ['1'], groups: ['vip'], ownListMembers: new Set(['1']), lookupGroup: lookupOf({}) })).get('1')).toEqual({ decision: 'not_eligible' });
  });

  it('TW75-02: a channel that is not affiliate or partner fails the Twitch groups as channel_not_eligible with zero calls', async () => {
    for (const broadcasterType of ['none', 'regular']) {
      const lookupGroup = lookupOf({ vip: { members: ['1'] } });
      expect((await run({ userIds: ['1'], broadcasterType, lookupGroup })).get('1')).toEqual({ decision: 'unknown', unknownReason: 'channel_not_eligible' });
      expect(lookupGroup).not.toHaveBeenCalled();
    }
    // The own list and the broadcaster still match on a non-affiliate channel; an unreadable type (null) is not a verdict.
    const out = await run({ userIds: ['1', '999'], broadcasterType: 'none', ownListMembers: new Set(['1']), lookupGroup: lookupOf({}) });
    expect([out.get('1').matchedGroup, out.get('999').matchedGroup]).toEqual(['own_list', 'broadcaster']);
    expect((await run({ userIds: ['1'], broadcasterType: 'partner', lookupGroup: lookupOf({ vip: { members: ['1'] } }) })).get('1').decision).toBe('eligible');
    expect((await run({ userIds: ['1'], broadcasterType: null, lookupGroup: lookupOf({ vip: { members: ['1'] } }) })).get('1').decision).toBe('eligible');
  });

  it('an invalid id is unknown lookup_error, never not_eligible, and never asked', async () => {
    const lookupGroup = lookupOf({});
    expect((await run({ userIds: ['abc'], lookupGroup })).get('abc')).toEqual({ decision: 'unknown', unknownReason: 'lookup_error' });
    expect(lookupGroup).not.toHaveBeenCalled();
  });

  it('the overall deadline is handed to every lookup and is the same for all groups', async () => {
    const lookupGroup = vi.fn(async () => ({ members: new Set(), failures: new Map() }));
    await run({ userIds: ['1'], lookupGroup, now: () => 1_000, overallTimeoutMs: 8_000 });
    expect(lookupGroup.mock.calls.map(([, , o]) => o.deadlineAt)).toEqual([9_000, 9_000, 9_000]);
  });
});
