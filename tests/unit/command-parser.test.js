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

  it('keeps login arguments distinct and does not resolve display names or permissions', () => {
    expect(parseChatCommand('!abismo remover @SomeLogin')).toEqual({
      kind: 'command', scope: 'queue', queueKey: 'abismo', command: 'remover', args: ['@SomeLogin'],
    });
  });

  it('parses global commands without a queue key', () => {
    expect(parseChatCommand('!filas')).toEqual({
      kind: 'command', scope: 'global', queueKey: null, command: 'filas', args: [],
    });
    expect(parseChatCommand('!conta reset')).toEqual({
      kind: 'command', scope: 'global', queueKey: null, command: 'conta', args: ['reset'],
    });
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
