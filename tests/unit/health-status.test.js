import { describe, expect, it } from 'vitest';
import { formatHealthStatus } from '../../apps/web/health-status.mjs';

describe('streamer panel health status projection', () => {
  it('renders database and Twitch state plus a numeric API response time in pt-BR', () => {
    expect(formatHealthStatus({ status: 'ok', product_version: 'v0.2.0-0000000-alpha', dependencies: {
      database: 'connected', twitch_api: 'connected', twitch_api_ping_ms: 42,
    } })).toEqual({
      database: 'Conectado', twitch: 'Conectada', ping: '42 ms', overall: 'Operacional',
    });
  });

  it('does not invent a ping or show technical internal values for an unconfigured channel', () => {
    expect(formatHealthStatus({ status: 'ok', dependencies: {
      database: 'connected', twitch_api: 'not_configured', twitch_api_ping_ms: null,
    } })).toEqual({
      database: 'Conectado', twitch: 'Não configurada', ping: 'Sem medição', overall: 'Operacional',
    });
  });

  it('explains unavailable local services in Portuguese', () => {
    expect(formatHealthStatus({ status: 'unavailable', dependencies: {
      database: 'unavailable', twitch_api: 'reconnect_required', twitch_api_ping_ms: null,
    } })).toEqual({
      database: 'Indisponível', twitch: 'Reconexão necessária', ping: 'Sem medição', overall: 'Verificar conexão',
    });
  });
});
