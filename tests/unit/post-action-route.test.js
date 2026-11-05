import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  OUTCOME_CODES, getOutcomeFromCode, navigateTo, resolvePostActionRoute,
} from '../../apps/frontend/features/panel-shell/post-action-route.mjs';

const ID = '0b1f1ef0-0ac0-4e63-b71c-e608f5aa1b20';
const OTHER = '7c9d3f10-1d2e-4a55-9a43-0a8f1f6d2b11';
const active = (id) => ({ id, lifecycleStatus: 'active' });
const rewardQueue = { id: ID, title: 'Arena', queueMode: 'channel_points', rewardId: 'reward-1', rewardOrigin: 'twitch', lifecycleStatus: 'active' };
const localQueue = { id: ID, title: 'Local', queueMode: 'manual_only', rewardId: null, rewardOrigin: 'none', lifecycleStatus: 'active' };
const convertedQueue = { id: ID, title: 'Conv', queueMode: 'manual_only', rewardId: 'reward-1', rewardOrigin: 'twitch', remoteSyncStatus: 'local_only', lifecycleStatus: 'active' };

describe('resolvePostActionRoute (FT-23 AC 8, UX-5)', () => {
  it.each([
    [{ action: 'create', result: { queue: { id: ID, queueMode: 'channel_points', remoteSyncStatus: 'synced' } } }, 'queue_created', 'panel.outcome.created.channel_points'],
    [{ action: 'create', result: { queue: { id: ID, queueMode: 'channel_points', remoteSyncStatus: 'create_unknown' } } }, 'queue_created_review', 'panel.queue.creation_result.review'],
    [{ action: 'create', result: { queue: { id: ID, queueMode: 'manual_only' } } }, 'queue_created_local', 'panel.queue.creation_result.created_local'],
    [{ action: 'create', result: { queue: { id: ID, queueMode: 'channel_points', remoteSyncStatus: 'pending_create' } } }, 'queue_created_pending', 'panel.queue.creation_result.pending'],
    [{ action: 'create', result: { queue: { id: ID, queueMode: 'channel_points', remoteSyncStatus: 'pending_create' }, refreshFailed: false, recovered: true } }, 'queue_created_recovered', 'panel.queue.creation_result.recovered'],
  ])('routes a confirmed create to /queues/ with a closed code and the UUID (%#)', (descriptor, code, key) => {
    const route = resolvePostActionRoute(descriptor, []);
    expect(route.href).toBe(`/queues/?outcome=${code}&queue=${ID}`);
    expect(route.focusId).toBe(`queue-title-${ID}`);
    expect(route.outcome).toMatchObject({ key, element: 'status' });
  });

  it('an uncertain or queue-less create result never navigates (UX-7)', () => {
    expect(resolvePostActionRoute({ action: 'create', result: { queue: null, uncertain: true } }, [])).toBeNull();
    expect(resolvePostActionRoute({ action: 'create', result: { queue: { id: 'not a uuid', queueMode: 'manual_only' } } }, [])).toBeNull();
  });

  it.each([
    ['reward', rewardQueue, 'panel.outcome.deleted.reward', 'queue_deleted_last_reward'],
    ['local', localQueue, 'panel.outcome.deleted.local', 'queue_deleted_last_local'],
    ['converted', convertedQueue, 'panel.queue.delete.done', 'queue_deleted_last_converted'],
  ])('deleted %s queue: stays on /queues/ when others remain, goes to /new-queue/ when it was the last', (_type, queue, key, code) => {
    const stays = resolvePostActionRoute({ action: 'delete', result: { status: 'deleted' }, queue }, [active(OTHER)]);
    expect(stays).toEqual({ href: null, focusId: null, outcome: expect.objectContaining({ key, element: 'status' }) });
    const last = resolvePostActionRoute({ action: 'delete', result: { status: 'deleted' }, queue }, [{ ...queue }]);
    expect(last.href).toBe(`/new-queue/?outcome=${code}&queue=${ID}`);
    expect(last.focusId).toBeNull();
    expect(last.outcome).toMatchObject({ key, element: 'status' });
  });

  it('counts only queues that are not deleted and ignores the deleted queue itself', () => {
    const queue = rewardQueue;
    expect(resolvePostActionRoute({ action: 'delete', result: { status: 'deleted' }, queue }, [{ id: OTHER, lifecycleStatus: 'deleted' }]).href).toMatch(/^\/new-queue\//);
    expect(resolvePostActionRoute({ action: 'delete', result: { status: 'deleted' }, queue }, [{ id: OTHER, lifecycleStatus: 'deleting' }]).href).toBeNull();
  });

  it('a pending or blocked last queue stays on /queues/ (the queue still exists)', () => {
    const pending = resolvePostActionRoute({ action: 'delete', result: { status: 'pending', deletionState: 'pending' }, queue: rewardQueue }, [rewardQueue]);
    expect(pending.href).toBeNull();
    expect(pending.outcome).toMatchObject({ key: 'panel.outcome.delete_pending.reward', element: 'status', action: 'refresh' });
    const blocked = resolvePostActionRoute({ action: 'delete', result: { status: 'pending', deletionState: 'blocked', queue: { blockingOperations: 2 } }, queue: rewardQueue }, [rewardQueue]);
    expect(blocked.href).toBeNull();
    expect(blocked.outcome).toMatchObject({ key: 'panel.queue.deletion.blocked', count: 2, element: 'alert', action: 'operations' });
    const generic = resolvePostActionRoute({ action: 'delete', result: { status: 'pending', deletionState: 'blocked', queue: { blockingOperations: 0 } }, queue: rewardQueue }, [rewardQueue]);
    expect(generic.outcome).toMatchObject({ key: 'panel.queue.deletion.blocked.generic', element: 'alert', action: 'operations' });
  });

  it('cancel outcomes use the same channel, each with its element and action', () => {
    const cancelled = resolvePostActionRoute({ action: 'cancel-delete', result: { status: 'cancelled' }, queue: rewardQueue }, []);
    expect(cancelled).toEqual({ href: null, focusId: null, outcome: expect.objectContaining({ key: 'panel.queue.delete.cancelled', element: 'status' }) });
    const refused = resolvePostActionRoute({ action: 'cancel-delete', result: { status: 'not_cancelled', reason: 'queue_delete_reward_absent' }, queue: rewardQueue }, []);
    expect(refused.outcome).toMatchObject({ key: 'panel.queue.delete.cancel.reward_absent', element: 'alert', action: 'operations' });
    const failed = resolvePostActionRoute({ action: 'cancel-delete', error: { code: 'QUEUE_DELETION_ALREADY_COMPLETED', status: 409 }, queue: rewardQueue }, []);
    expect(failed.outcome).toMatchObject({ key: 'panel.queue.delete.cancel.already_deleted', element: 'alert', action: 'refresh' });
  });

  it('an unknown outcome returns null', () => {
    expect(resolvePostActionRoute({ action: 'explode' }, [])).toBeNull();
    expect(resolvePostActionRoute(null, [])).toBeNull();
    expect(resolvePostActionRoute({ action: 'delete', result: { status: 'weird' }, queue: rewardQueue }, [])).toBeNull();
  });

  it('is pure: it does not mutate its inputs and has no side effects', () => {
    const descriptor = Object.freeze({ action: 'delete', result: Object.freeze({ status: 'deleted' }), queue: Object.freeze({ ...rewardQueue }) });
    const projection = Object.freeze([Object.freeze({ ...rewardQueue })]);
    const touched = [];
    globalThis.location = new Proxy({}, { get: (_t, name) => { touched.push(name); return undefined; } });
    expect(() => resolvePostActionRoute(descriptor, projection)).not.toThrow();
    expect(resolvePostActionRoute(descriptor, projection)).toEqual(resolvePostActionRoute(descriptor, projection));
    expect(touched).toEqual([]);
    delete globalThis.location;
  });

  it('UX-8: a pending delete never maps to a success (deleted/done) key', () => {
    for (const queue of [rewardQueue, localQueue, convertedQueue]) {
      const { outcome } = resolvePostActionRoute({ action: 'delete', result: { status: 'pending', deletionState: 'pending' }, queue }, [queue]);
      expect(outcome.key).not.toMatch(/\.deleted\.|\.delete\.done|\.cancelled$/);
      expect(outcome.element).toBe('status');
    }
  });

  it('R1: a Channel Points queue never uses the generic done/pending keys that claim a paused or untouched reward', () => {
    const done = resolvePostActionRoute({ action: 'delete', result: { status: 'deleted' }, queue: rewardQueue }, [active(OTHER)]).outcome.key;
    const pending = resolvePostActionRoute({ action: 'delete', result: { status: 'pending' }, queue: rewardQueue }, [rewardQueue]).outcome.key;
    expect([done, pending]).not.toContain('panel.queue.delete.done');
    expect([done, pending]).not.toContain('panel.queue.delete.pending');
    const localPending = resolvePostActionRoute({ action: 'delete', result: { status: 'pending' }, queue: convertedQueue }, [convertedQueue]).outcome.key;
    expect(localPending).toBe('panel.queue.delete.pending');
  });

  it('delete errors: refusals are alerts; uncertain results offer a refresh and never say success', () => {
    const generic = resolvePostActionRoute({ action: 'delete', error: { code: 'QUEUE_DELETE_CONFIRMATION_REQUIRED', status: 400 }, queue: rewardQueue }, []);
    expect(generic.outcome).toMatchObject({ key: 'panel.error.generic', element: 'alert' });
    const uncertain = resolvePostActionRoute({ action: 'delete', error: { code: 'INTERNAL_ERROR', status: 503, referenceId: 'op-17' }, queue: rewardQueue }, []);
    expect(uncertain.outcome).toMatchObject({ key: 'panel.queue.action_result.uncertain', element: 'alert', action: 'refresh', referenceId: 'op-17' });
  });
});

describe('outcome messages carried by the URL code (closed list)', () => {
  it('has exactly the 5 create codes and the 3 queue_deleted_last_* codes', () => {
    expect([...OUTCOME_CODES].sort()).toEqual([
      'queue_created', 'queue_created_local', 'queue_created_pending', 'queue_created_recovered', 'queue_created_review',
      'queue_deleted_last_converted', 'queue_deleted_last_local', 'queue_deleted_last_reward',
    ]);
  });

  it('maps every code to a status message and an unknown code to null', () => {
    for (const code of OUTCOME_CODES) expect(getOutcomeFromCode(code)).toMatchObject({ element: 'status', key: expect.stringMatching(/^panel\./) });
    expect(getOutcomeFromCode('queue_deleted_last_reward').key).toBe('panel.outcome.deleted.reward');
    expect(getOutcomeFromCode('<script>')).toBeNull();
    expect(getOutcomeFromCode('constructor')).toBeNull();
    expect(getOutcomeFromCode(undefined)).toBeNull();
  });
});

describe('navigateTo is the single navigation seam (AC 7, UX-13)', () => {
  it('assigns the document location once with the given href', () => {
    const assign = vi.fn();
    navigateTo('/queues/?outcome=queue_created', { location: { assign } });
    expect(assign).toHaveBeenCalledWith('/queues/?outcome=queue_created');
  });

  it('no other module of the queue, panel-shell or operations features touches window.location.assign/href/replace (other features, e.g. the OAuth redirect, are out of scope)', () => {
    const offenders = [];
    const walk = (dir) => {
      for (const name of readdirSync(dir)) {
        const path = join(dir, name);
        if (name === '.next' || name === 'node_modules') continue;
        if (statSync(path).isDirectory()) { walk(path); continue; }
        if (!/\.(mjs|jsx|js)$/.test(name)) continue;
        const source = readFileSync(path, 'utf8');
        if (/(window|globalThis)\.location\.(assign|replace|href\s*=)|location\.(assign|replace)\(|location\.href\s*=/.test(source)) offenders.push(path);
      }
    };
    walk('apps/frontend/features/queues');
    walk('apps/frontend/features/panel-shell');
    walk('apps/frontend/features/operations');
    walk('apps/frontend/features/overview');
    expect(offenders.map((path) => path.replaceAll('\\', '/'))).toEqual(['apps/frontend/features/panel-shell/post-action-route.mjs']);
  });
});
