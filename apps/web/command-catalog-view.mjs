const ROLE_RANK = Object.freeze({ everyone: 0, follower: 1, subscriber: 2, vip: 3, moderator: 4, streamer: 5 });

function inheritedAudience(minimumRole) {
  const rank = ROLE_RANK[minimumRole];
  if (rank === undefined) return [];
  return Object.keys(ROLE_RANK).filter((role) => ROLE_RANK[role] >= rank);
}

function effectiveRoles(minimumRole) {
  if (minimumRole === 'everyone') return ['everyone'];
  return inheritedAudience(minimumRole).filter((role) => role !== 'streamer');
}

/** @param {{commands?: Array<{key:string,syntax:string,description:string,policy?:any,allowedRoles?:string[],immutableRoles?:string[]|null,configurable?:boolean}>,configurableRoles?:string[],version?:number}} input */
export function projectCommandCatalog(input) {
  return (input?.commands ?? []).map((command) => ({
    ...command,
    roles: [...(command.allowedRoles ?? [])],
    minimumRoles: [...(input?.configurableRoles ?? [])],
    minimumRole: command.policy?.mode === 'minimum_role' ? command.policy.minimumRole : '',
    legacyReviewRequired: command.policy?.mode === 'legacy_exact',
    currentLegacyRoles: command.policy?.mode === 'legacy_exact' ? [...command.policy.allowedRoles] : [],
    inheritedRoles: command.policy?.mode === 'minimum_role' ? inheritedAudience(command.policy.minimumRole) : [],
    locked: command.configurable !== true,
  }));
}

/** @param {Array<{key:string,configurable?:boolean,minimumRoles?:string[]}>} commands @param {Array<{dataset:{commandKey?:string},querySelector?:(selector:string)=>{value:string,dataset?:{dirty?:string}}|null}>} cards */
export function collectCommandPolicies(commands, cards) {
  const policies = {};
  for (const command of commands) {
    if (!command.configurable) continue;
    const card = cards.find((candidate) => candidate.dataset.commandKey === command.key);
    const selector = card?.querySelector?.('select[data-policy-select]');
    if (selector?.dataset?.dirty !== 'true' || !command.minimumRoles?.includes(selector.value)) continue;
    policies[command.key] = { mode: 'minimum_role', minimumRole: selector.value };
  }
  return policies;
}

/** @param {{schemaVersion?:number,version:number,commands:Array<{key:string,policy?:any,allowedRoles?:string[]}>}} catalog @param {{schemaVersion?:number,version:number,policies:Record<string,any>}} result */
export function mergeCommandPolicyState(catalog, result) {
  return {
    ...catalog,
    schemaVersion: result.schemaVersion ?? catalog.schemaVersion,
    version: result.version,
    commands: catalog.commands.map((command) => ({
      ...command,
      ...(Object.hasOwn(result.policies, command.key) ? {
        policy: result.policies[command.key],
        allowedRoles: result.policies[command.key]?.mode === 'minimum_role'
          ? effectiveRoles(result.policies[command.key].minimumRole)
          : result.policies[command.key]?.allowedRoles ?? command.allowedRoles,
      } : {}),
    })),
  };
}

/** @param {{version:number,followerScopeReady?:boolean,commands?:Array<{key:string,configurable?:boolean,policy?:any}>}|null|undefined} catalog */
export function followerAuthorizationRequest(catalog) {
  if (!catalog || catalog.followerScopeReady || !Number.isInteger(catalog.version)) return null;
  const policies = Object.fromEntries((catalog.commands ?? [])
    .filter((command) => command.configurable && command.policy?.mode === 'minimum_role' && command.policy.minimumRole === 'follower')
    .map((command) => [command.key, { mode: 'minimum_role', minimumRole: 'follower' }]));
  return Object.keys(policies).length ? { expectedVersion: catalog.version, policies } : null;
}
