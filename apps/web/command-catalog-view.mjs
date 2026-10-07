const ROLE_RANK = Object.freeze({ everyone: 0, follower: 1, subscriber: 2, vip: 3, moderator: 4, streamer: 5 });

export function projectMinimumRoleAudience(minimumRole) {
  const rank = ROLE_RANK[minimumRole];
  return rank === undefined ? [] : Object.keys(ROLE_RANK).filter((role) => ROLE_RANK[role] >= rank);
}

export function groupCommandPolicies(commands) {
  const groups = [
    { key: 'configurable', commands: [] }, { key: 'moderator', commands: [] }, { key: 'streamer', commands: [] },
  ];
  for (const command of commands) {
    const group = command.access?.kind === 'configurable' ? 'configurable' : command.access?.minimumRole;
    groups.find((candidate) => candidate.key === group)?.commands.push(command);
  }
  return groups.filter(({ commands: items }) => items.length > 0);
}

export function projectCommandCatalog(input) {
  return (input?.commands ?? []).map((command) => ({
    ...command,
    minimumRoles: [...(input?.configurableRoles ?? [])],
    minimumRole: command.policy?.minimumRole ?? command.access?.minimumRole ?? '',
    inheritedRoles: projectMinimumRoleAudience(command.policy?.minimumRole ?? command.access?.minimumRole),
    locked: command.access?.kind !== 'configurable',
  }));
}

export function collectCommandPolicies(commands, cards) {
  const policies = {};
  for (const command of commands) {
    if (command.access?.kind !== 'configurable') continue;
    const card = cards.find((candidate) => candidate.dataset.commandKey === command.key);
    const selector = card?.querySelector?.('select[data-policy-select]');
    if (selector?.dataset?.dirty !== 'true' || !command.minimumRoles?.includes(selector.value)) continue;
    policies[command.key] = { minimumRole: selector.value };
  }
  return policies;
}

export function mergeCommandPolicyState(catalog, result) {
  return {
    ...catalog, schemaVersion: result.schemaVersion ?? catalog.schemaVersion, version: result.version,
    commands: catalog.commands.map((command) => ({
      ...command,
      ...(Object.hasOwn(result.policies, command.key) ? {
        policy: result.policies[command.key],
      } : {}),
    })),
  };
}

export function followerAuthorizationRequest(catalog) {
  if (!catalog || catalog.followerScopeReady || !Number.isInteger(catalog.version)) return null;
  const policies = Object.fromEntries((catalog.commands ?? [])
    .filter((command) => command.access?.kind === 'configurable' && command.policy?.minimumRole === 'follower')
    .map((command) => [command.key, { minimumRole: 'follower' }]));
  return Object.keys(policies).length ? { expectedVersion: catalog.version, policies } : null;
}
