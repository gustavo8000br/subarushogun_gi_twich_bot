import { randomUUID } from 'node:crypto';

const activeEntryStatuses = new Set(['waiting', 'called', 'in_progress']);
const entryStatuses = new Set(['waiting', 'called', 'in_progress', 'completed', 'removed', 'no_show']);
const priorityReasons = new Set(['subscription', 'bits', 'external_payment', 'operator_override']);

export async function seedQraQueue(prisma, {
  slugPrefix = 'qra',
  queue: queueOverrides = {},
  entries = [{ userLogin: 'viewer_qra', displayName: 'Viewer QRA', status: 'waiting', position: 1 }],
} = {}) {
  if (!prisma?.queue?.create) throw new TypeError('A connected Prisma client is required to seed QRA PostgreSQL fixtures.');
  if (!Array.isArray(entries)) throw new TypeError('QRA fixture entries must be an array.');

  const suffix = randomUUID();
  const preparedEntries = entries.map((entry, index) => {
    const status = entry.status ?? 'waiting';
    if (!entryStatuses.has(status)) throw new TypeError(`Unsupported QRA fixture entry status: ${status}`);
    const priorityReason = entry.priorityReason ?? null;
    if (priorityReason !== null && !priorityReasons.has(priorityReason)) throw new TypeError(`Unsupported QRA fixture priority reason: ${priorityReason}`);
    const createdAt = entry.createdAt ?? new Date(Date.now() + index * 1_000);
    return {
      twitchUserId: entry.twitchUserId ?? `qra-user-${suffix}-${index}`,
      userLogin: entry.userLogin ?? `viewer_qra_${index}`,
      displayName: entry.displayName ?? `Viewer QRA ${index + 1}`,
      uid: entry.uid ?? null,
      source: entry.source ?? 'manual',
      status,
      priorityClass: entry.priorityClass ?? (priorityReason ? 'priority' : 'standard'),
      priorityReason,
      position: entry.position ?? (activeEntryStatuses.has(status) ? index + 1 : null),
      version: entry.version ?? 1,
      createdAt,
      ...(status === 'completed' || status === 'removed' || status === 'no_show'
        ? { finishedAt: entry.finishedAt ?? new Date(createdAt.getTime() + 1_000), terminalReason: entry.terminalReason ?? `qra_fixture_${status}` }
        : {}),
    };
  });

  const created = await prisma.queue.create({
    data: {
      slug: `${slugPrefix}-${suffix.slice(0, 12)}`,
      title: 'QRA PostgreSQL fixture',
      cost: 100,
      rewardPrompt: 'QRA fixture reward',
      callMessage: '{user}, it is your turn!',
      callTimeoutMin: 10,
      uidMode: 'hidden',
      isOpen: true,
      isArchived: false,
      lifecycleStatus: 'active',
      remoteSyncStatus: 'synced',
      rewardId: `qra-reward-${suffix}`,
      queueMode: 'channel_points',
      rewardOrigin: 'bot_created',
      modeTransitionStatus: 'none',
      version: 1,
      ...queueOverrides,
      entries: { create: preparedEntries },
    },
    include: { entries: { orderBy: [{ position: 'asc' }, { createdAt: 'asc' }] } },
  });

  return created;
}

export async function seedQraTerminalHistory(prisma, options = {}) {
  return seedQraQueue(prisma, {
    ...options,
    entries: [
      { userLogin: 'viewer_completed', displayName: 'Completed Viewer', status: 'completed', position: null, terminalReason: 'service_completed' },
      { userLogin: 'viewer_removed', displayName: 'Removed Viewer', status: 'removed', position: null, terminalReason: 'operator_removed' },
      { userLogin: 'viewer_no_show', displayName: 'No Show Viewer', status: 'no_show', position: null, terminalReason: 'call_timeout' },
    ],
  });
}

export async function seedQraLifecycleQueue(prisma, lifecycle, options = {}) {
  const supported = new Set([
    'active', 'archived', 'deleting', 'deleted', 'create_unknown', 'pending_update',
    'pending_delete', 'diverged', 'manual_only', 'mode_transition_pending',
  ]);
  if (!supported.has(lifecycle)) throw new TypeError(`Unsupported QRA fixture lifecycle: ${lifecycle}`);
  const queue = {
    lifecycleStatus: lifecycle === 'pending_delete' ? 'deleting' : lifecycle,
    isArchived: lifecycle === 'archived',
    isOpen: lifecycle === 'active',
    queueMode: lifecycle === 'manual_only' ? 'manual_only' : 'channel_points',
    remoteSyncStatus: lifecycle === 'pending_delete' ? 'delete_pending' : lifecycle,
    modeTransitionStatus: lifecycle === 'mode_transition_pending' ? 'pending' : 'none',
    ...(lifecycle === 'deleted' ? { deletedAt: new Date() } : {}),
  };
  return seedQraQueue(prisma, { ...options, queue: { ...queue, ...options.queue } });
}
