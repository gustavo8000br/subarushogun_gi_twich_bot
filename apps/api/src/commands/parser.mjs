import { CHAT_COMMANDS } from './catalog.mjs';

/** @typedef {{kind: 'invalid', code: string}|{kind: 'command', scope: string, queueKey: string|null, command: string, args: string[], rootAction?: string}} ParsedCommand */

const globalCommands = new Set(CHAT_COMMANDS.filter(({ scope }) => scope === 'global').map(({ command }) => command));
const queueCommands = new Set(CHAT_COMMANDS.filter(({ scope }) => scope === 'queue').map(({ command }) => command));
const queueKeyPattern = /^[a-z0-9-]{2,24}$/;
const globalRoots = Object.freeze({ 'pt-BR': 'fila', en: 'queue', es: 'cola' });
const globalRootAliases = new Set(/** @type {string[]} */ (Object.values(globalRoots)));
const globalActionLabels = Object.freeze({
  'pt-BR': { commands: 'comandos', ping: 'ping', queues: 'filas', account: 'conta' },
  en: { commands: 'commands', ping: 'ping', queues: 'queues', account: 'account' },
  es: { commands: 'comandos', ping: 'ping', queues: 'colas', account: 'cuenta' },
});
const accountResetLabels = Object.freeze({ 'pt-BR': 'reset', en: 'reset', es: 'restablecer' });
const queueLabels = Object.freeze({
  'pt-BR': { lista: 'lista', comandos: 'comandos', posicao: 'posicao', sair: 'sair', add: 'add', remover: 'remover', proximo: 'proximo', atender: 'atender', concluir: 'concluir', mover: 'mover', abrir: 'abrir', fechar: 'fechar', limpar: 'limpar', confirmar: 'confirmar' },
  en: { lista: 'list', comandos: 'commands', posicao: 'position', sair: 'leave', add: 'add', remover: 'remove', proximo: 'next', atender: 'serve', concluir: 'complete', mover: 'move', abrir: 'open', fechar: 'close', limpar: 'clear', confirmar: 'confirm' },
  es: { lista: 'lista', comandos: 'comandos', posicao: 'posicion', sair: 'salir', add: 'agregar', remover: 'quitar', proximo: 'siguiente', atender: 'atender', concluir: 'completar', mover: 'mover', abrir: 'abrir', fechar: 'cerrar', limpar: 'limpiar', confirmar: 'confirmar' },
});

function normalizeCommand(value) {
  return value.toLocaleLowerCase('pt-BR').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function isValidArity(command, args, confirmLabel = 'confirmar') {
  const count = args.length;
  switch (command) {
    case 'add': return count === 1 || count === 2;
    case 'remover': return count === 1;
    case 'proximo': return count <= 1;
    case 'atender':
    case 'concluir': return count <= 1;
    case 'mover': return count === 2;
    case 'limpar': return count === 0 || (count === 1 && normalizeCommand(args[0]) === normalizeCommand(confirmLabel));
    default: return count === 0;
  }
}

/** @param {unknown} input @param {{locale?:string,labels?:Record<string,string>}} [options] @returns {ParsedCommand} */
export function parseChatCommand(input, { locale = 'pt-BR', labels = {} } = {}) {
  if (typeof input !== 'string' || input.length > 2_000) return { kind: 'invalid', code: 'INVALID_SYNTAX' };
  const tokens = input.trim().split(/\s+/u);
  if (!tokens[0]?.startsWith('!')) return { kind: 'invalid', code: 'INVALID_SYNTAX' };

  const first = tokens[0].slice(1).toLocaleLowerCase('pt-BR');
  const activeLocale = globalRoots[locale] ? locale : 'pt-BR';
  const activeRoot = String(labels.root ?? globalRoots[activeLocale]).toLocaleLowerCase(activeLocale);
  const actionLabels = { ...globalActionLabels[activeLocale] };
  for (const action of Object.keys(actionLabels)) {
    if (labels[`global.${action}`]) actionLabels[action] = labels[`global.${action}`];
  }
  const localizedGlobalActions = new Map(Object.entries(actionLabels).map(([action, label]) => [normalizeCommand(label), action]));
  const resetLabel = labels['global.account_reset'] ?? accountResetLabels[activeLocale];
  const activeQueueLabels = { ...queueLabels[activeLocale] };
  for (const action of Object.keys(activeQueueLabels)) {
    const key = `queue.${action}`;
    if (labels[key]) activeQueueLabels[action] = labels[key];
  }
  if (globalRootAliases.has(first) || first === activeRoot) {
    if (first !== activeRoot) return { kind: 'invalid', code: 'INVALID_SYNTAX' };
    const args = tokens.slice(1);
    const action = args.length > 0 ? localizedGlobalActions.get(normalizeCommand(args[0])) : undefined;
    if (!action) return { kind: 'invalid', code: 'INVALID_SYNTAX' };
    const actionArgs = tokens.slice(2);
    if (action !== 'account' && actionArgs.length) return { kind: 'invalid', code: 'INVALID_SYNTAX' };
    if (action === 'account' && actionArgs.length === 1 && normalizeCommand(actionArgs[0]) === normalizeCommand(resetLabel)) {
      return { kind: 'command', scope: 'global', queueKey: null, command: 'queue', args: actionArgs, rootAction: 'account_reset' };
    }
    const rootAction = action === 'account' ? actionArgs.length ? 'account_set' : 'account_read' : action;
    return { kind: 'command', scope: 'global', queueKey: null, command: 'queue', args: actionArgs, rootAction };
  }
  if (['filas', 'conta'].includes(first)) return { kind: 'invalid', code: 'INVALID_SYNTAX' };
  if (globalCommands.has(first) && first !== 'queue') {
    const args = tokens.slice(1);
    if ((first === 'filas' && args.length > 0)
      || (first === 'conta' && (args.length > 1 || (args.length === 1 && normalizeCommand(args[0]) === 'reset' && args[0].toLowerCase() !== 'reset')))) return { kind: 'invalid', code: 'INVALID_SYNTAX' };
    return { kind: 'command', scope: 'global', queueKey: null, command: first, args };
  }
  if (!queueKeyPattern.test(first) || globalRootAliases.has(first)) return { kind: 'invalid', code: 'INVALID_SYNTAX' };

  const rawSubcommand = tokens[1];
  const queueCommandsForLocale = new Map(Object.entries(activeQueueLabels).map(([command, label]) => [normalizeCommand(label), command]));
  const command = rawSubcommand ? queueCommandsForLocale.get(normalizeCommand(rawSubcommand)) : 'lista';
  if (!command || !queueCommands.has(command)) return { kind: 'invalid', code: 'INVALID_SYNTAX' };
  const args = tokens.slice(rawSubcommand ? 2 : 1);
  if (!isValidArity(command, args, activeQueueLabels.confirmar)) return { kind: 'invalid', code: 'INVALID_SYNTAX' };

  return { kind: 'command', scope: 'queue', queueKey: first, command, args };
}
