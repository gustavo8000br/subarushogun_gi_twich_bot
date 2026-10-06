function safeWidgetDto(widget) {
  return {
    id: widget.id,
    sourceType: widget.sourceType,
    queueId: widget.queueId ?? null,
    fixedText: widget.fixedText ?? null,
    fallbackText: widget.fallbackText,
    style: widget.style,
    version: widget.version,
    capabilityVersion: widget.capabilityVersion,
    capabilityActive: Boolean(widget.capabilityHash && !widget.revokedAt && !widget.deletedAt),
    deleted: Boolean(widget.deletedAt),
    createdAt: widget.createdAt,
    updatedAt: widget.updatedAt,
  };
}

function validObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value);
}

function onlyKeys(value, allowed) {
  return Object.keys(value).every((key) => allowed.has(key));
}

function sendError(reply, error) {
  const status = error?.code === 'OVERLAY_WIDGET_VERSION_CONFLICT' ? 409
    : error?.code === 'OVERLAY_WIDGET_NOT_FOUND' ? 404
      : String(error?.code ?? '').startsWith('INVALID_') ? 400 : 503;
  const message = status === 409 ? 'O widget mudou em outra tela. Atualize a lista e tente novamente.'
    : status === 404 ? 'Este widget não está disponível.'
      : status === 400 ? 'Revise os campos do widget e tente novamente.'
        : 'Não foi possível concluir a operação do widget agora.';
  return reply.code(status).send({ error: message });
}

/** Register local widget management and capability-only read routes. */
export function registerOverlayRoutes(app, { repository, widgetService, projectionService }) {
  app.addHook('onRequest', async (_request, reply) => {
    reply.header('x-content-type-options', 'nosniff');
  });

  app.get('/api/overlay-widgets', async (_request, reply) => {
    reply.header('cache-control', 'no-store');
    try {
      return (await repository.list()).map(safeWidgetDto);
    } catch (error) { return sendError(reply, error); }
  });

  app.post('/api/overlay-widgets', async (request, reply) => {
    const body = request.body;
    const allowed = new Set(['sourceType', 'queueId', 'fixedText', 'fallbackText', 'style']);
    if (!validObject(body) || !onlyKeys(body, allowed) || typeof body.sourceType !== 'string') {
      return reply.code(400).send({ error: 'Revise os campos do widget e tente novamente.' });
    }
    try {
      const result = await widgetService.create(body);
      /** @type {any} */ (request).overlaySecretResponse = true;
      reply.header('cache-control', 'no-store').code(201);
      return { widget: safeWidgetDto(result.widget), capabilityUrl: result.capabilityUrl };
    } catch (error) { return sendError(reply, error); }
  });

  app.patch('/api/overlay-widgets/:id', async (request, reply) => {
    const body = request.body;
    if (!validObject(body) || !onlyKeys(body, new Set(['expectedVersion', 'changes']))
        || !Number.isInteger(body.expectedVersion) || !validObject(body.changes)) {
      return reply.code(400).send({ error: 'Revise os campos do widget e tente novamente.' });
    }
    try { return safeWidgetDto(await repository.update({ id: request.params.id, expectedVersion: body.expectedVersion, changes: body.changes })); }
    catch (error) { return sendError(reply, error); }
  });

  app.post('/api/overlay-widgets/:id/regenerate', async (request, reply) => {
    const body = request.body;
    if (!validObject(body) || !onlyKeys(body, new Set(['expectedVersion'])) || !Number.isInteger(body.expectedVersion)) {
      return reply.code(400).send({ error: 'Revise os campos do widget e tente novamente.' });
    }
    try {
      const result = await widgetService.regenerate({ id: request.params.id, expectedVersion: body.expectedVersion });
      /** @type {any} */ (request).overlaySecretResponse = true;
      reply.header('cache-control', 'no-store');
      return { widget: safeWidgetDto(result.widget), capabilityUrl: result.capabilityUrl };
    } catch (error) { return sendError(reply, error); }
  });

  app.post('/api/overlay-widgets/:id/revoke', async (request, reply) => {
    const body = request.body;
    if (!validObject(body) || !onlyKeys(body, new Set(['expectedVersion'])) || !Number.isInteger(body.expectedVersion)) {
      return reply.code(400).send({ error: 'Revise os campos do widget e tente novamente.' });
    }
    try { return safeWidgetDto(await widgetService.revoke({ id: request.params.id, expectedVersion: body.expectedVersion })); }
    catch (error) { return sendError(reply, error); }
  });

  app.delete('/api/overlay-widgets/:id', async (request, reply) => {
    const body = request.body;
    if (!validObject(body) || !onlyKeys(body, new Set(['expectedVersion'])) || !Number.isInteger(body.expectedVersion)) {
      return reply.code(400).send({ error: 'Revise os campos do widget e tente novamente.' });
    }
    try { return safeWidgetDto(await repository.delete({ id: request.params.id, expectedVersion: body.expectedVersion })); }
    catch (error) { return sendError(reply, error); }
  });

  app.get('/overlay/api/widget', async (request, reply) => {
    reply.header('cache-control', 'no-store, no-cache, must-revalidate, private')
      .header('pragma', 'no-cache')
      .header('referrer-policy', 'no-referrer');
    const authorization = request.headers.authorization;
    const match = typeof authorization === 'string' ? /^Bearer ([A-Za-z0-9_-]{43,})$/.exec(authorization) : null;
    if (!match) return reply.code(401).send({ error: 'Widget indisponível.' });
    try {
      const projection = await projectionService.readWithCapability(match[1]);
      if (!projection) return reply.code(404).send({ error: 'Widget indisponível.' });
      return projection;
    } catch {
      return reply.code(503).send({ error: 'Widget temporariamente indisponível.' });
    }
  });
}
