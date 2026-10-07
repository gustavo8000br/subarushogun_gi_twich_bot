import { describe, expect, it } from 'vitest';
import { parseChatCommand } from '../../apps/api/src/commands/parser.mjs';

describe('pure pt-BR chat command parser', () => {
  it('parses queue-first commands and normalizes case and repeated whitespace', () => {
    expect(parseChatCommand('  !AbIsMo   PróXimo   2 ')).toEqual({
      kind: 'command', scope: 'queue', queueKey: 'abismo', command: 'proximo', args: ['2'],
    });
  });

  it('treats a bare queue command as a list request and never as viewer enrollment', () => {
    expect(parseChatCommand('!abismo')).toEqual({
      kind: 'command', scope: 'queue', queueKey: 'abismo', command: 'lista', args: [],
    });
  });

  it.each([
    ['!abismo posicao', 'posicao'],
    ['!abismo posição', 'posicao'],
    ['!abismo proximo', 'proximo'],
    ['!abismo próximo', 'proximo'],
    ['!abismo atender @user', 'atender'],
    ['!abismo concluir user', 'concluir'],
    ['!abismo mover user 2', 'mover'],
    ['!abismo add @login 123456789', 'add'],
  ])('normalizes supported command syntax: %s', (text, command) => {
    expect(parseChatCommand(text)).toMatchObject({ kind: 'command', command });
  });

  it('parses queue command discovery separately from queue execution commands', () => {
    expect(parseChatCommand('!abismo comandos')).toEqual({
      kind: 'command', scope: 'queue', queueKey: 'abismo', command: 'comandos', args: [],
    });
  });

  it.each([
    ['!fila comandos', 'comandos', 'commands'],
    ['!fila ping', 'ping', 'ping'],
  ])('parses the Portuguese global bot command namespace: %s', (text, command, rootAction) => {
    expect(parseChatCommand(text)).toMatchObject({ kind: 'command', scope: 'global', queueKey: null, command: 'queue', args: [], rootAction });
  });

  it.each([
    ['!queue commands', 'en', 'commands'],
    ['!cola comandos', 'es', 'commands'],
  ])('maps the active localized root to a stable command action: %s', (text, locale, rootAction) => {
    expect(parseChatCommand(text, { locale })).toMatchObject({
      kind: 'command', scope: 'global', queueKey: null, command: 'queue', rootAction,
    });
  });

  it.each([
    ['!queue comandos', 'pt-BR'],
    ['!fila commands', 'en'],
    ['!queue comandos', 'es'],
  ])('rejects cross-locale global roots: %s under %s', (text, locale) => {
    expect(parseChatCommand(text, { locale })).toEqual({ kind: 'invalid', code: 'INVALID_SYNTAX' });
  });

  it('keeps login arguments distinct and does not resolve display names or permissions', () => {
    expect(parseChatCommand('!abismo remover @SomeLogin')).toEqual({
      kind: 'command', scope: 'queue', queueKey: 'abismo', command: 'remover', args: ['@SomeLogin'],
    });
  });

  it('keeps global queue and account actions inside the selected command namespace', () => {
    expect(parseChatCommand('!fila filas')).toEqual({
      kind: 'command', scope: 'global', queueKey: null, command: 'queue', args: [], rootAction: 'queues',
    });
    expect(parseChatCommand('!fila conta')).toEqual({
      kind: 'command', scope: 'global', queueKey: null, command: 'queue', args: [], rootAction: 'account_read',
    });
    expect(parseChatCommand('!fila conta reset')).toEqual({
      kind: 'command', scope: 'global', queueKey: null, command: 'queue', args: ['reset'], rootAction: 'account_reset',
    });
    expect(parseChatCommand('!fila conta Conta Atual')).toEqual({
      kind: 'command', scope: 'global', queueKey: null, command: 'queue', args: ['Conta', 'Atual'], rootAction: 'account_set',
    });
  });

  it.each(['!filas', '!conta reset'])('rejects the legacy standalone global command: %s', (text) => {
    expect(parseChatCommand(text)).toEqual({ kind: 'invalid', code: 'INVALID_SYNTAX' });
  });

  it.each([
    ['!queue queues', 'en', 'queues'],
    ['!cola cuenta', 'es', 'account_read'],
    ['!cola cuenta restablecer', 'es', 'account_reset'],
  ])('maps translated global actions to a stable command ID: %s', (text, locale, rootAction) => {
    expect(parseChatCommand(text, { locale })).toMatchObject({
      kind: 'command', scope: 'global', command: 'queue', rootAction,
    });
  });

  it('accepts command labels supplied by a complete community locale catalog', () => {
    const labels = {
      root: 'warteschlange',
      'global.commands': 'befehle',
      'queue.posicao': 'position',
    };
    expect(parseChatCommand('!warteschlange befehle', { locale: 'de', labels })).toMatchObject({
      kind: 'command', scope: 'global', rootAction: 'commands',
    });
    expect(parseChatCommand('!abismo position', { locale: 'de', labels })).toMatchObject({
      kind: 'command', scope: 'queue', command: 'posicao',
    });
  });

  it.each(['fila', 'queue', 'cola'])('does not resolve localized command roots as queue slugs: %s', (root) => {
    expect(parseChatCommand(`!${root} lista`)).toEqual({ kind: 'invalid', code: 'INVALID_SYNTAX' });
  });

  it.each([
    '!abismo add',
    '!abismo remover user extra',
    '!abismo mover user zero 2',
    '!filas extra',
    '!abismo desconhecido',
    'texto livre com !abismo sair',
  ])('returns safe syntax result for invalid input: %s', (text) => {
    expect(parseChatCommand(text)).toEqual({ kind: 'invalid', code: 'INVALID_SYNTAX' });
  });

  it('does not include the rejected input in its result', () => {
    const rejected = '!abismo remover login senha-super-secreta';
    expect(JSON.stringify(parseChatCommand(rejected))).not.toContain('senha-super-secreta');
  });
});
