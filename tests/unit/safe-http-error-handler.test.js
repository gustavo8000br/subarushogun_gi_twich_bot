import Fastify from 'fastify';
import { describe, expect, it, vi } from 'vitest';
import { registerSafeHttpErrorHandler } from '../../apps/api/src/http/safe-http-error-handler.mjs';

describe('safe HTTP error handler', () => {
  it('logs route-scoped diagnostics and returns only a generic message plus reference', async () => {
    const reportDiagnostic = vi.fn(() => '11111111-1111-4111-8111-111111111111');
    const app = Fastify();
    registerSafeHttpErrorHandler(app, { reportDiagnostic });
    app.get('/api/operations', async () => {
      throw Object.assign(new Error('authorization=secret SQL and UID 123456789'), { code: 'P2002' });
    });

    const response = await app.inject({ method: 'GET', url: '/api/operations' });

    expect(response.statusCode).toBe(500);
    expect(response.json()).toEqual({
      code: 'INTERNAL_ERROR',
      error: 'Não foi possível concluir. Tente novamente.',
      referenceId: '11111111-1111-4111-8111-111111111111',
    });
    expect(response.headers['x-error-reference']).toBe('11111111-1111-4111-8111-111111111111');
    expect(response.body).not.toMatch(/authorization|SQL|123456789/);
    expect(reportDiagnostic).toHaveBeenCalledWith({ source: 'http.get.api_operations', error: expect.objectContaining({ code: 'P2002' }) });
    await app.close();
  });
});
