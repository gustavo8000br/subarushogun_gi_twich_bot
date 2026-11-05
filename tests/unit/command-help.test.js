import { describe, expect, it } from 'vitest';
import { renderGlobalCommandHelp, renderQueueCommandHelp, renderPingResponse, formatPingVersion } from '../../apps/api/src/commands/help.mjs';

describe('role-aware chat command help and ping copy', () => {
  it('shows all default viewer commands globally without disclosing management or ping commands', () => {
    const policies = Object.fromEntries(['queue:lista', 'queue:comandos', 'queue:posicao', 'queue:sair', 'global:filas', 'global:conta:read', 'global:queue:comandos'].map((key) => [key, { minimumRole: 'everyone' }]));
    const help = renderGlobalCommandHelp({ roles: ['viewer'], policies, allowVipManagement: false });
    expect(help).toContain('!fila comandos');
    expect(help).toContain('!<fila>');
    expect(help).not.toContain('!queue ping');
    expect(help).not.toContain('!<fila> add');
    expect(help.length).toBeLessThanOrEqual(500);
  });

  it.each([
    ['en', '!queue commands', ['!fila comandos', '!cola comandos', '!queue comandos']],
    ['es', '!cola comandos', ['!fila comandos', '!queue commands', '!cola commands']],
  ])('renders the global namespace using only the selected locale root: %s', (locale, expected, forbidden) => {
    const policies = Object.fromEntries(['queue:lista', 'queue:comandos', 'queue:posicao', 'queue:sair', 'global:filas', 'global:conta:read', 'global:queue:comandos'].map((key) => [key, { minimumRole: 'everyone' }]));
    const help = renderGlobalCommandHelp({ roles: ['viewer'], locale, policies });
    expect(help).toContain(expected);
    for (const syntax of forbidden) expect(help).not.toContain(syntax);
  });

  it('does not list protected queue actions for subscribers even if saved policy requests them', () => {
    const policies = { 'queue:proximo': ['subscriber'], 'queue:add': ['everyone'] };
    const sub = renderQueueCommandHelp({ queueSlug: 'abismo', roles: ['subscriber'], policies, allowVipManagement: false });
    expect(sub).not.toContain('!abismo proximo');
    expect(sub).not.toContain('!abismo add');
    expect(sub).toContain('!abismo comandos');
  });

  it('directs the streamer to the panel instead of dumping a chat catalog', () => {
    expect(renderGlobalCommandHelp({ roles: ['streamer'], policies: {}, allowVipManagement: false }))
      .toMatch(/painel/i);
  });

  it('renders ping from the shared measurement: milliseconds, or the error form with a closed code (AC-D8-1/2/7)', () => {
    expect(renderPingResponse({ productVersion: 'v0.3.0-1234567-beta', ping: { state: 'ok', ms: 219 } }))
      .toBe('Pong 🏓 - v0.3.0-beta - 219ms.');
    expect(renderPingResponse({ productVersion: 'v0.3.0-1234567-beta', ping: { state: 'failed', code: 'TWITCH_PROBE_FAILED' } }))
      .toBe('Pong 🏓 - v0.3.0-beta - sem medição da Twitch (TWITCH_PROBE_FAILED).');
    expect(renderPingResponse({ productVersion: 'v0.3.0-1234567-beta', ping: { state: 'failed', code: 'Bearer abc secret text' } }))
      .toBe('Pong 🏓 - v0.3.0-beta - sem medição da Twitch (TWITCH_PROBE_FAILED).');
    expect(renderPingResponse({ productVersion: 'v0.3.0-1234567-beta', ping: { state: 'not_connected', code: 'TWITCH_NOT_CONNECTED' } }))
      .toBe('Pong 🏓 - v0.3.0-beta - sem medição da Twitch (TWITCH_NOT_CONNECTED).');
    expect(renderPingResponse({ productVersion: 'v0.3.0-1234567-beta', ping: null }))
      .toBe('Pong 🏓 - v0.3.0-beta - sem medição da Twitch (TWITCH_PROBE_FAILED).');
  });

  it('AC-D8-4: the version drops the commit segment, an unrecognized string is printed as is and never throws', () => {
    expect(formatPingVersion('v0.2.1-0000000-beta')).toBe('v0.2.1-beta');
    expect(formatPingVersion('v0.3.0-beta')).toBe('v0.3.0-beta');
    expect(formatPingVersion('v1.0.0-abcdef0-stable')).toBe('v1.0.0-stable');
    for (const odd of ['unknown', '', 'v0.2.1-ZZZZZZZ-beta', undefined, null, 42]) expect(() => formatPingVersion(odd)).not.toThrow();
    expect(formatPingVersion('unknown')).toBe('unknown');
    expect(formatPingVersion(undefined)).toBe('unknown');
  });

  it('AC-D8-4: the repository VERSION file formats to a string without a commit segment', async () => {
    const { readFile } = await import('node:fs/promises');
    const version = (await readFile(new URL('../../VERSION', import.meta.url), 'utf8')).trim();
    expect(formatPingVersion(version)).not.toMatch(/-[0-9a-f]{7}-/);
  });
});
