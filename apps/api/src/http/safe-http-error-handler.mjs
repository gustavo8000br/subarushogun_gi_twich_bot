import { createErrorDiagnosticReporter } from '../observability/error-diagnostics.mjs';
import { isDatabaseTimeout } from '../persistence/database-errors.mjs';

function routeSource(request) {
  const method = typeof request.method === 'string' ? request.method.toLowerCase() : 'unknown';
  const route = typeof request.routeOptions?.url === 'string' ? request.routeOptions.url : 'unknown';
  const safeRoute = route.replace(/[^A-Za-z0-9_.-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 48) || 'unknown';
  return `http.${method}.${safeRoute}`;
}

/** @param {import('fastify').FastifyInstance} app @param {{reportDiagnostic?: (event: object) => string}} options */
export function registerSafeHttpErrorHandler(app, { reportDiagnostic = createErrorDiagnosticReporter() } = {}) {
  app.setErrorHandler((error, request, reply) => {
    const referenceId = reportDiagnostic({ source: routeSource(request), error });
    reply.header('x-error-reference', referenceId);
    // OPS-31 P0 (DB-11): lock_timeout / statement_timeout (55P03, 57014) is a retryable 503, never a 500 with internals.
    if (isDatabaseTimeout(error)) {
      reply.header('retry-after', '1');
      return reply.code(503).send({ code: 'TEMPORARILY_UNAVAILABLE', error: 'Não foi possível concluir. Tente novamente.', referenceId });
    }
    return reply.code(500).send({ code: 'INTERNAL_ERROR', error: 'Não foi possível concluir. Tente novamente.', referenceId });
  });
}
