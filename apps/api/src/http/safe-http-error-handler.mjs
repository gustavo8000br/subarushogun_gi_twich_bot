import { createErrorDiagnosticReporter } from '../observability/error-diagnostics.mjs';

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
    return reply.code(500).send({ code: 'INTERNAL_ERROR', error: 'Não foi possível concluir. Tente novamente.', referenceId });
  });
}
