// OPS-31 P5 (FT-74, AC 9, 12, 30): pure rules of the settlement setting and the refund groups.
import { describe, expect, it } from 'vitest';
import {
  REFUND_GROUPS, REFUND_ON_END_DELIVERED, SETTLEMENT_MODES, evaluateRefundModeAvailability, normalizeRefundGroups, refundGroupColumnsFor, refundGroupsOf,
} from '../../apps/api/src/domain/settlement-setting.mjs';

describe('settlement setting (AC 9, 30)', () => {
  it('U74-01 the modes and groups are closed sets in the fixed lookup order; the default is fulfill_on_start', () => {
    expect(SETTLEMENT_MODES).toEqual(['fulfill_on_start', 'refund_on_end']);
    expect(REFUND_GROUPS).toEqual(['own_list', 'moderator', 'vip', 'subscriber']);
  });

  it('U74-04 / M19 the refund-at-the-end flag is off until P7 ships it', () => {
    expect(REFUND_ON_END_DELIVERED).toBe(false);
  });

  it('normalizes a group list to the fixed order and refuses unknown, duplicated or non-list input', () => {
    expect(normalizeRefundGroups(['subscriber', 'own_list'])).toEqual(['own_list', 'subscriber']);
    expect(normalizeRefundGroups([])).toEqual([]);
    for (const bad of [null, undefined, 'vip', {}, ['everyone'], ['vip', 'vip'], [1], ['vip', 'vip', 'moderator', 'subscriber', 'own_list']]) {
      expect(normalizeRefundGroups(bad), JSON.stringify(bad)).toBeNull();
    }
  });

  it('U74-02 an empty set writes every switch off and reads back as an empty list (it refunds nobody)', () => {
    expect(refundGroupColumnsFor([])).toEqual({ refundGroupSubscriber: false, refundGroupModerator: false, refundGroupVip: false, refundGroupOwnList: false });
    expect(refundGroupColumnsFor(['vip'])).toEqual({ refundGroupSubscriber: false, refundGroupModerator: false, refundGroupVip: true, refundGroupOwnList: false });
    expect(refundGroupsOf({ refundGroupSubscriber: true, refundGroupOwnList: true, refundGroupVip: false })).toEqual(['own_list', 'subscriber']);
    expect(refundGroupsOf({})).toEqual([]);
    expect(refundGroupsOf(null)).toEqual([]);
  });
});

describe('AC 12: when the refund mode may be available (table-driven; wired by P6/P7, the API refuses it before)', () => {
  const base = { rewardOrigin: 'bot_created', skipRequestQueue: false, broadcasterType: 'affiliate', groups: ['own_list'], grantedScopes: [] };
  it.each([
    ['all conditions hold (own list needs no scope)', {}, { available: true, reason: null }],
    ['a partner channel', { broadcasterType: 'partner' }, { available: true, reason: null }],
    ['reward not created by this product', { rewardOrigin: 'legacy_unknown' }, { available: false, reason: 'reward_not_managed' }],
    ['manual queue (no reward)', { rewardOrigin: 'none' }, { available: false, reason: 'reward_not_managed' }],
    ['skip-request-queue on', { skipRequestQueue: true }, { available: false, reason: 'skip_request_queue_on' }],
    ['skip-request-queue unknown is not assumed off', { skipRequestQueue: null }, { available: false, reason: 'skip_request_queue_on' }],
    ['a channel that is neither affiliate nor partner', { broadcasterType: '' }, { available: false, reason: 'channel_not_eligible' }],
    ['broadcaster type unknown', { broadcasterType: undefined }, { available: false, reason: 'channel_not_eligible' }],
    ['moderator group without its scope', { groups: ['moderator'] }, { available: false, reason: 'scope_missing', group: 'moderator' }],
    ['vip group without its scope', { groups: ['vip'], grantedScopes: ['moderation:read'] }, { available: false, reason: 'scope_missing', group: 'vip' }],
    ['subscriber group without its scope', { groups: ['subscriber'] }, { available: false, reason: 'scope_missing', group: 'subscriber' }],
    ['every enabled group has its scope', { groups: ['moderator', 'vip', 'subscriber', 'own_list'], grantedScopes: ['moderation:read', 'channel:read:vips', 'channel:read:subscriptions'] }, { available: true, reason: null }],
    ['a scope of a group that is off does not matter', { groups: ['own_list'], grantedScopes: [] }, { available: true, reason: null }],
    ['an empty group set is valid (it refunds nobody)', { groups: [] }, { available: true, reason: null }],
    ['the first failing reason wins (reward before skip before channel)', { rewardOrigin: 'none', skipRequestQueue: true, broadcasterType: '' }, { available: false, reason: 'reward_not_managed' }],
  ])('%s', (_label, override, expected) => {
    expect(evaluateRefundModeAvailability({ ...base, ...override })).toEqual(expected);
  });
});
