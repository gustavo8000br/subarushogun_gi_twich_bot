/** @typedef {{kind: 'invalid', code: string}|{kind: 'command', scope: string, queueKey: string|null, command: string, args: string[]}} ParsedCommand */

const globalCommands = new Set(['filas', 'conta']);
const queueCommands = new Set([
  'add', 'remover', 'sair', 'posicao', 'proximo', 'atender', 'concluir', 'mover',
  'abrir', 'fechar', 'limpar', 'lista',
]);
const queueKeyPattern = /^[a-z0-9-]{2,24}$/;

function normalizeCommand(value) {
  return value.toLocaleLowerCase('pt-BR').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function isValidArity(command, args) {
  const count = args.length;
  switch (command) {
    case 'add': return count === 1 || count === 2;
    case 'remover': return count === 1;
    case 'proximo': return count <= 1;
    case 'atender':
    case 'concluir': return count <= 1;
    case 'mover': return count === 2;
    case 'limpar': return count === 0 || (count === 1 && normalizeCommand(args[0]) === 'confirmar');
    default: return count === 0;
  }
}

/** @param {unknown} input @returns {ParsedCommand} */
export function parseChatCommand(input) {
  if (typeof input !== 'string' || input.length > 2_000) return { kind: 'invalid', code: 'INVALID_SYNTAX' };
  const tokens = input.trim().split(/\s+/u);
  if (!tokens[0]?.startsWith('!')) return { kind: 'invalid', code: 'INVALID_SYNTAX' };

  const first = tokens[0].slice(1).toLocaleLowerCase('pt-BR');
  if (globalCommands.has(first)) {
    const args = tokens.slice(1);
    if (first === 'filas' && args.length > 0) return { kind: 'invalid', code: 'INVALID_SYNTAX' };
    return { kind: 'command', scope: 'global', queueKey: null, command: first, args };
  }
  if (!queueKeyPattern.test(first)) return { kind: 'invalid', code: 'INVALID_SYNTAX' };

  const rawSubcommand = tokens[1];
  const command = rawSubcommand ? normalizeCommand(rawSubcommand) : 'lista';
  if (!queueCommands.has(command)) return { kind: 'invalid', code: 'INVALID_SYNTAX' };
  const args = tokens.slice(rawSubcommand ? 2 : 1);
  if (!isValidArity(command, args)) return { kind: 'invalid', code: 'INVALID_SYNTAX' };

  return { kind: 'command', scope: 'queue', queueKey: first, command, args };
}
