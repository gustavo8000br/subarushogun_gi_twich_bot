/** @typedef {'streamer'|'moderator'|'vip'|'subscriber'|'viewer'} ChatRole */

/** @type {Array<{key:string,scope:'queue'|'global',command:string,syntax:string,description:string,defaultRoles:string[],immutableRoles?:string[]}>} */
export const CHAT_COMMANDS = [
  { key: 'queue:lista', scope: 'queue', command: 'lista', syntax: '!<fila> [lista]', description: 'Consultar aguardando, chamados e atendimentos.', defaultRoles: ['everyone'] },
  { key: 'queue:comandos', scope: 'queue', command: 'comandos', syntax: '!<fila> comandos', description: 'Ver comandos disponíveis para seu cargo.', defaultRoles: ['everyone'] },
  { key: 'queue:posicao', scope: 'queue', command: 'posicao', syntax: '!<fila> posicao', description: 'Consultar sua posição ou estado na fila.', defaultRoles: ['everyone'] },
  { key: 'queue:sair', scope: 'queue', command: 'sair', syntax: '!<fila> sair', description: 'Sair da própria entrada ativa.', defaultRoles: ['everyone'] },
  { key: 'queue:add', scope: 'queue', command: 'add', syntax: '!<fila> add <usuario> [UID]', description: 'Adicionar manualmente uma pessoa.', defaultRoles: ['streamer', 'moderator'], immutableRoles: ['streamer', 'moderator'] },
  { key: 'queue:remover', scope: 'queue', command: 'remover', syntax: '!<fila> remover <usuario>', description: 'Remover uma pessoa da fila.', defaultRoles: ['streamer', 'moderator'], immutableRoles: ['streamer', 'moderator'] },
  { key: 'queue:proximo', scope: 'queue', command: 'proximo', syntax: '!<fila> proximo [1-10]', description: 'Chamar as próximas pessoas.', defaultRoles: ['streamer', 'moderator'], immutableRoles: ['streamer', 'moderator'] },
  { key: 'queue:atender', scope: 'queue', command: 'atender', syntax: '!<fila> atender [usuario]', description: 'Iniciar um atendimento chamado.', defaultRoles: ['streamer', 'moderator'], immutableRoles: ['streamer', 'moderator'] },
  { key: 'queue:concluir', scope: 'queue', command: 'concluir', syntax: '!<fila> concluir [usuario]', description: 'Concluir um atendimento.', defaultRoles: ['streamer', 'moderator'], immutableRoles: ['streamer', 'moderator'] },
  { key: 'queue:mover', scope: 'queue', command: 'mover', syntax: '!<fila> mover <usuario> <posição>', description: 'Alterar posição de quem aguarda.', defaultRoles: ['streamer', 'moderator'], immutableRoles: ['streamer', 'moderator'] },
  { key: 'queue:abrir', scope: 'queue', command: 'abrir', syntax: '!<fila> abrir', description: 'Abrir a recompensa da fila.', defaultRoles: ['streamer', 'moderator'], immutableRoles: ['streamer', 'moderator'] },
  { key: 'queue:fechar', scope: 'queue', command: 'fechar', syntax: '!<fila> fechar', description: 'Pausar a recompensa da fila.', defaultRoles: ['streamer', 'moderator'], immutableRoles: ['streamer', 'moderator'] },
  { key: 'queue:limpar', scope: 'queue', command: 'limpar', syntax: '!<fila> limpar [confirmar]', description: 'Pré-visualizar ou confirmar limpeza.', defaultRoles: ['streamer', 'moderator'], immutableRoles: ['streamer', 'moderator'] },
  { key: 'global:filas', scope: 'global', command: 'filas', syntax: '!filas', description: 'Listar filas disponíveis.', defaultRoles: ['everyone'] },
  { key: 'global:conta:read', scope: 'global', command: 'conta', syntax: '!conta', description: 'Consultar conta atual.', defaultRoles: ['everyone'] },
  { key: 'global:conta:set', scope: 'global', command: 'conta', syntax: '!conta <nome>', description: 'Definir rótulo da conta atual.', defaultRoles: ['streamer', 'moderator'], immutableRoles: ['streamer', 'moderator'] },
  { key: 'global:conta:reset', scope: 'global', command: 'conta', syntax: '!conta reset', description: 'Restaurar conta padrão.', defaultRoles: ['streamer', 'moderator'], immutableRoles: ['streamer', 'moderator'] },
  { key: 'global:queue:comandos', scope: 'global', command: 'queue', syntax: '!queue comandos', description: 'Listar todos os comandos disponíveis para seu cargo.', defaultRoles: ['everyone'] },
  { key: 'global:queue:ping', scope: 'global', command: 'queue', syntax: '!queue ping', description: 'Verificar resposta do bot, versão e latência Twitch.', defaultRoles: ['streamer', 'moderator'], immutableRoles: ['streamer', 'moderator'] },
];

export const CONFIGURABLE_COMMAND_ROLES = Object.freeze(['moderator', 'vip', 'subscriber', 'everyone']);

/** @param {{scope:string,command:string,args?:string[]}} input */
export function getCommandDefinition({ scope, command, args = [] }) {
  if (scope === 'global' && command === 'conta') {
    if (!args.length) return CHAT_COMMANDS.find(({ key }) => key === 'global:conta:read');
    if (args.length === 1 && args[0].toLocaleLowerCase('pt-BR') === 'reset') return CHAT_COMMANDS.find(({ key }) => key === 'global:conta:reset');
    return CHAT_COMMANDS.find(({ key }) => key === 'global:conta:set');
  }
  if (scope === 'global' && command === 'queue') {
    if (args.length !== 1) return undefined;
    const subcommand = args[0].toLocaleLowerCase('pt-BR');
    const key = `global:queue:${subcommand}`;
    return CHAT_COMMANDS.find((entry) => entry.key === key);
  }
  return CHAT_COMMANDS.find((entry) => entry.scope === scope && entry.command === command);
}

/** @param {Record<string,string[]>|undefined|null} policies */
export function resolveAllowedRoles(definition, policies) {
  if (!definition) return [];
  if (definition.immutableRoles) return [...definition.immutableRoles];
  if (!policies || !Object.hasOwn(policies, definition.key)) return [...definition.defaultRoles];
  const configured = policies[definition.key];
  if (!Array.isArray(configured) || configured.some((role) => !CONFIGURABLE_COMMAND_ROLES.includes(role))) return [];
  return [...new Set(configured)];
}

/** @param {{definition: any, allowedRoles?: string[], roles: string[], allowVipManagement?: boolean}} input */
export function resolveCommandAccess({ definition, allowedRoles, roles, allowVipManagement = false }) {
  if (!definition || !Array.isArray(roles)) return { allowed: false, reason: 'unknown_command' };
  const permittedRoles = allowedRoles ?? definition.defaultRoles;
  if (definition.immutableRoles) {
    const allowed = roles.some((role) => definition.immutableRoles.includes(role));
    return { allowed, reason: allowed ? 'allowed' : definition.immutableRoles.length === 1 && definition.immutableRoles[0] === 'streamer' ? 'streamer_only' : 'role_not_allowed' };
  }
  if (roles.includes('streamer')) return { allowed: true, reason: 'allowed' };
  const allowed = permittedRoles.includes('everyone') || permittedRoles.some((role) => (
    role !== 'streamer' && roles.includes(role) && (role !== 'vip' || allowVipManagement === true)
  ));
  return { allowed, reason: allowed ? 'allowed' : 'role_not_allowed' };
}
