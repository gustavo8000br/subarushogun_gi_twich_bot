/** @typedef {'streamer'|'moderator'|'vip'|'subscriber'|'follower'|'viewer'} ChatRole */

/** @param {string} [minimumRole] @returns {{kind:'configurable',minimumRole:string}} */
const configurable = (minimumRole = 'everyone') => ({ kind: 'configurable', minimumRole });
/** @param {string} minimumRole @returns {{kind:'fixed',minimumRole:string}} */
const fixed = (minimumRole) => ({ kind: 'fixed', minimumRole });

/** @type {Array<{key:string,scope:'queue'|'global',command:string,syntax:string,description:string,access:{kind:'configurable'|'fixed',minimumRole:string}}>} */
export const CHAT_COMMANDS = [
  { key: 'queue:lista', scope: 'queue', command: 'lista', syntax: '!<fila> [lista]', description: 'Consultar aguardando, chamados e atendimentos.', access: configurable() },
  { key: 'queue:comandos', scope: 'queue', command: 'comandos', syntax: '!<fila> comandos', description: 'Ver comandos disponíveis para seu cargo.', access: configurable() },
  { key: 'queue:posicao', scope: 'queue', command: 'posicao', syntax: '!<fila> posicao', description: 'Consultar sua posição ou estado na fila.', access: configurable() },
  { key: 'queue:sair', scope: 'queue', command: 'sair', syntax: '!<fila> sair', description: 'Sair da própria entrada ativa.', access: configurable() },
  { key: 'queue:add', scope: 'queue', command: 'add', syntax: '!<fila> add <usuario> [UID]', description: 'Adicionar manualmente uma pessoa.', access: fixed('moderator') },
  { key: 'queue:remover', scope: 'queue', command: 'remover', syntax: '!<fila> remover <usuario>', description: 'Remover uma pessoa da fila.', access: fixed('moderator') },
  { key: 'queue:proximo', scope: 'queue', command: 'proximo', syntax: '!<fila> proximo [1-10]', description: 'Chamar as próximas pessoas.', access: fixed('moderator') },
  { key: 'queue:atender', scope: 'queue', command: 'atender', syntax: '!<fila> atender [usuario]', description: 'Iniciar um atendimento chamado.', access: fixed('moderator') },
  { key: 'queue:concluir', scope: 'queue', command: 'concluir', syntax: '!<fila> concluir [usuario]', description: 'Concluir um atendimento.', access: fixed('moderator') },
  { key: 'queue:mover', scope: 'queue', command: 'mover', syntax: '!<fila> mover <usuario> <posição>', description: 'Alterar posição de quem aguarda.', access: fixed('moderator') },
  { key: 'queue:abrir', scope: 'queue', command: 'abrir', syntax: '!<fila> abrir', description: 'Abrir a recompensa da fila.', access: fixed('moderator') },
  { key: 'queue:fechar', scope: 'queue', command: 'fechar', syntax: '!<fila> fechar', description: 'Pausar a recompensa da fila.', access: fixed('moderator') },
  { key: 'queue:limpar', scope: 'queue', command: 'limpar', syntax: '!<fila> limpar [confirmar]', description: 'Pré-visualizar ou confirmar limpeza.', access: fixed('moderator') },
  { key: 'global:filas', scope: 'global', command: 'filas', syntax: '!fila filas', description: 'Listar filas disponíveis.', access: configurable() },
  { key: 'global:conta:read', scope: 'global', command: 'conta', syntax: '!fila conta', description: 'Consultar conta atual.', access: configurable() },
  { key: 'global:conta:set', scope: 'global', command: 'conta', syntax: '!fila conta <nome>', description: 'Definir rótulo da conta atual.', access: fixed('streamer') },
  { key: 'global:conta:reset', scope: 'global', command: 'conta', syntax: '!fila conta reset', description: 'Restaurar conta padrão.', access: fixed('streamer') },
  { key: 'global:queue:comandos', scope: 'global', command: 'queue', syntax: '!queue comandos', description: 'Listar todos os comandos disponíveis para seu cargo.', access: configurable() },
  { key: 'global:queue:ping', scope: 'global', command: 'queue', syntax: '!queue ping', description: 'Verificar resposta do bot, versão e latência Twitch.', access: fixed('moderator') },
];

export const CONFIGURABLE_COMMAND_ROLES = Object.freeze(['everyone', 'follower', 'subscriber', 'vip', 'moderator']);
export const COMMAND_POLICY_MINIMUM_ROLES = CONFIGURABLE_COMMAND_ROLES;
export const COMMAND_ROLE_RANK = Object.freeze({ everyone: 0, viewer: 0, follower: 1, subscriber: 2, vip: 3, moderator: 4, streamer: 5 });

function effectiveRole(roles, allowVipManagement) {
  return roles.filter((role) => role !== 'vip' || allowVipManagement)
    .reduce((highest, role) => (COMMAND_ROLE_RANK[role] ?? -1) > COMMAND_ROLE_RANK[highest] ? role : highest, 'everyone');
}

/** @param {{scope:string,command:string,args?:string[],rootAction?:string}} input */
export function getCommandDefinition({ scope, command, args = [], rootAction }) {
  if (scope === 'global' && command === 'conta') {
    if (!args.length) return CHAT_COMMANDS.find(({ key }) => key === 'global:conta:read');
    if (args.length === 1 && args[0].toLocaleLowerCase('pt-BR') === 'reset') return CHAT_COMMANDS.find(({ key }) => key === 'global:conta:reset');
    return CHAT_COMMANDS.find(({ key }) => key === 'global:conta:set');
  }
  if (scope === 'global' && command === 'queue') {
    if (rootAction) {
      const rootKeys = { commands: 'global:queue:comandos', ping: 'global:queue:ping', queues: 'global:filas', account_read: 'global:conta:read', account_set: 'global:conta:set', account_reset: 'global:conta:reset' };
      const key = rootKeys[rootAction];
      return key ? CHAT_COMMANDS.find((entry) => entry.key === key) : undefined;
    }
    if (args.length !== 1) return undefined;
    return CHAT_COMMANDS.find((entry) => entry.key === `global:queue:${args[0].toLocaleLowerCase('pt-BR')}`);
  }
  return CHAT_COMMANDS.find((entry) => entry.scope === scope && entry.command === command);
}

/** @param {any} definition @param {Record<string,any>|undefined|null} policies */
export function resolveCommandPolicy(definition, policies) {
  if (!definition?.access) return { minimumRole: null, kind: 'invalid' };
  const minimumRole = definition.access.kind === 'fixed' ? definition.access.minimumRole : policies?.[definition.key]?.minimumRole ?? definition.access.minimumRole;
  if (definition.access.kind === 'configurable' && !CONFIGURABLE_COMMAND_ROLES.includes(minimumRole)) return { minimumRole: null, kind: 'invalid' };
  return { minimumRole, kind: definition.access.kind };
}

/** @param {{definition:any,policy?:any,policies?:Record<string,any>,roles:string[],allowVipManagement?:boolean}} input */
export function resolveCommandAccess({ definition, policy, policies, roles, allowVipManagement = false }) {
  if (!definition || !Array.isArray(roles)) return { allowed: false, reason: 'unknown_command' };
  const resolved = resolveCommandPolicy(definition, policy ? { [definition.key]: policy } : policies);
  if (!resolved.minimumRole) return { allowed: false, reason: 'role_not_allowed' };
  const role = effectiveRole(roles, allowVipManagement);
  const allowed = COMMAND_ROLE_RANK[role] >= COMMAND_ROLE_RANK[resolved.minimumRole];
  return { allowed, reason: allowed ? 'allowed' : resolved.minimumRole === 'streamer' ? 'streamer_only' : 'role_not_allowed', effectiveRole: role };
}
