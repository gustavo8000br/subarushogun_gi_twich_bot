import { createHash, randomBytes } from 'node:crypto';

function serviceError(code, message) {
  return Object.assign(new Error(message), { code });
}

function validateOrigin(origin) {
  let parsed;
  try { parsed = new URL(origin); } catch { throw serviceError('INVALID_OVERLAY_ORIGIN', 'Overlay origin is invalid'); }
  const loopbackHosts = new Set(['localhost', '127.0.0.1', '[::1]']);
  if (parsed.protocol !== 'https:' || !loopbackHosts.has(parsed.hostname)
      || parsed.username || parsed.password || parsed.pathname !== '/' || parsed.search || parsed.hash) {
    throw serviceError('INVALID_OVERLAY_ORIGIN', 'Overlay origin must be an HTTPS loopback origin');
  }
  return parsed.origin;
}

function issueToken(tokenFactory) {
  const token = tokenFactory();
  if (typeof token !== 'string' || !/^[A-Za-z0-9_-]{43,}$/.test(token)) {
    throw serviceError('INVALID_OVERLAY_TOKEN', 'Overlay token generator did not return a valid token');
  }
  return token;
}

function hashToken(token) {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

function withoutCapabilityHash(widget) {
  if (!widget || typeof widget !== 'object') return widget;
  const safeWidget = { ...widget };
  delete safeWidget.capabilityHash;
  return safeWidget;
}

/** @param {{repository: Record<string, any>, origin: string, tokenFactory?: () => string}} options */
export function createOverlayWidgetService({ repository, origin, tokenFactory = () => randomBytes(32).toString('base64url') }) {
  const safeOrigin = validateOrigin(origin);
  const createUrl = (token) => `${safeOrigin}/overlay.html#${token}`;
  return {
    async create(configuration) {
      const token = issueToken(tokenFactory);
      const widget = await repository.create({ ...configuration, capabilityHash: hashToken(token) });
      return { widget: withoutCapabilityHash(widget), capabilityUrl: createUrl(token) };
    },

    async regenerate({ id, expectedVersion }) {
      const token = issueToken(tokenFactory);
      const widget = await repository.rotateCapability({ id, expectedVersion, capabilityHash: hashToken(token) });
      return { widget: withoutCapabilityHash(widget), capabilityUrl: createUrl(token) };
    },

    async revoke({ id, expectedVersion }) {
      const widget = await repository.revokeCapability({ id, expectedVersion });
      return withoutCapabilityHash(widget);
    },
  };
}
