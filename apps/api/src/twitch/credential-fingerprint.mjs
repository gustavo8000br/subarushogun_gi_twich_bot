import { createHash } from 'node:crypto';

/**
 * Opaque generation marker for a credential row. OAuth state keeps only this digest,
 * never token or secret values. Exact token scopes are part of the generation.
 * @param {Record<string, any> | null | undefined} record
 */
export function createCredentialFingerprint(record) {
  if (!record) return null;
  const fingerprintInput = {
    id: record.id ?? null,
    clientId: record.clientId ?? null,
    clientSecret: record.clientSecret ?? null,
    broadcasterId: record.broadcasterId ?? null,
    accessToken: record.accessToken ?? null,
    refreshToken: record.refreshToken ?? null,
    scopes: Array.isArray(record.scopes) ? record.scopes : [],
    tokenExpiresAt: record.tokenExpiresAt ? new Date(record.tokenExpiresAt).toISOString() : null,
    authStatus: record.authStatus ?? null,
    updatedAt: record.updatedAt ? new Date(record.updatedAt).toISOString() : null,
  };
  return createHash('sha256').update(JSON.stringify(fingerprintInput)).digest('hex');
}
