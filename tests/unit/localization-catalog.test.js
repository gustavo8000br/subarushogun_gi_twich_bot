import { describe, expect, it } from 'vitest';
import { parseTsvCatalog } from '../../apps/shared/localization/tsv-catalog.mjs';

describe('parseTsvCatalog', () => {
  it('parses UTF-8 catalog rows with LF or CRLF endings', () => {
    expect(parseTsvCatalog('setup.title\tConnect channel\nsetup.help\tUse !queue comandos\n'))
      .toEqual({ 'setup.title': 'Connect channel', 'setup.help': 'Use !queue comandos' });
    expect(parseTsvCatalog('setup.title\tConnect channel\r\nsetup.help\tUse !queue comandos\r\n'))
      .toEqual({ 'setup.title': 'Connect channel', 'setup.help': 'Use !queue comandos' });
  });

  it('rejects duplicate keys instead of silently overwriting a translation', () => {
    expect(() => parseTsvCatalog('setup.title\tOne\nsetup.title\tTwo'))
      .toThrow('Duplicate catalog key: setup.title');
  });

  it.each([
    ['', 'Catalog must contain at least one entry'],
    ['\uFEFFsetup.title\tTitle', 'Catalog must not contain a byte order mark'],
    ['setup.title', 'Malformed catalog row at line 1'],
    ['setup.title\t', 'Empty catalog value at line 1'],
    ['setup.title\tbad\tvalue', 'Malformed catalog row at line 1'],
    ['setup..title\tTitle', 'Invalid catalog key at line 1'],
    ['setup.title\tbad\u0001value', 'Control character in catalog value at line 1'],
  ])('rejects malformed catalog content %j', (input, message) => {
    expect(() => parseTsvCatalog(input)).toThrow(message);
  });
});
