/** @param {{commands?: Array<{key:string,syntax:string,description:string,allowedRoles?:string[],immutableRoles?:string[]|null,configurable?:boolean}>,configurableRoles?:string[],version?:number}} input */
export function projectCommandCatalog(input) {
  return (input?.commands ?? []).map((command) => ({
    ...command,
    roles: [...(command.allowedRoles ?? [])],
    locked: command.configurable !== true,
  }));
}

/** @param {Array<{key:string,configurable?:boolean}>} commands @param {Array<{dataset:{commandKey?:string},querySelectorAll:(selector:string)=>Iterable<{value:string}>}>} cards */
export function collectCommandPolicies(commands, cards) {
  const policies = {};
  for (const command of commands) {
    if (!command.configurable) continue;
    const card = cards.find((candidate) => candidate.dataset.commandKey === command.key);
    policies[command.key] = [...(card?.querySelectorAll('input:checked') ?? [])].map(({ value }) => value);
  }
  return policies;
}

/** @param {{version:number,commands:Array<{key:string,allowedRoles?:string[]}>}} catalog @param {{version:number,policies:Record<string,string[]>}} result */
export function mergeCommandPolicyState(catalog, result) {
  return {
    ...catalog,
    version: result.version,
    commands: catalog.commands.map((command) => ({
      ...command,
      ...(Object.hasOwn(result.policies, command.key) ? { allowedRoles: [...result.policies[command.key]] } : {}),
    })),
  };
}
