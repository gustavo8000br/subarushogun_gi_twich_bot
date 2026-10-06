import { describe, expect, it } from 'vitest';
import { renderGlobalCommandHelp, renderQueueCommandHelp, renderPingResponse } from '../../apps/api/src/commands/help.mjs';

describe('role-aware chat command help and ping copy', () => {
  it('shows all default viewer commands globally without disclosing management or ping commands', () => {
    const help = renderGlobalCommandHelp({ roles: ['viewer'], policies: {}, allowVipManagement: false });
    expect(help).toContain('!queue comandos');
    expect(help).toContain('!<fila>');
    expect(help).not.toContain('!queue ping');
    expect(help).not.toContain('!<fila> add');
    expect(help.length).toBeLessThanOrEqual(500);
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

  it('renders ping with product version and cached Twitch latency, or an unavailable label', () => {
    expect(renderPingResponse({ productVersion: 'v0.4.0-1234567-alpha', twitchHealth: { status: 'connected', pingMs: 82 } }))
      .toContain('Pong 🏓 Bot ativo · v0.4.0-1234567-alpha · Twitch: 82 ms');
    expect(renderPingResponse({ productVersion: 'v0.4.0-1234567-alpha', twitchHealth: null }))
      .toContain('Twitch: latência indisponível');
  });
});
