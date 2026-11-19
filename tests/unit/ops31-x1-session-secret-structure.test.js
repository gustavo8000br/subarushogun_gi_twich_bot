// OPS-31 X1 (A0, QA B1): structural guard. The local session id is the value of the session cookie (a bearer secret) and must never
// reach a database column, a log or an export. Persisted actors use `localSession.actorId` (domain/session-actor.mjs). This test
// reads the product source and fails when the raw id (or the cookie) is used anywhere outside the short allowed list: the OAuth state
// binding, which lives in memory (`twitch/oauth.mjs`) and the callback guard.
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = fileURLToPath(new URL('../../', import.meta.url));
const apiSource = join(root, 'apps', 'api', 'src');

function sourceFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.(mjs|js|ts)$/.test(entry.name) ? [path] : [];
  });
}
const files = sourceFiles(apiSource).map((path) => ({ path, name: relative(root, path), lines: readFileSync(path, 'utf8').split('\n') }));
const trim = (line) => line.trim();

/** The only places that may use the raw session id: they hand it to the in-memory OAuth state store or guard the callback. */
const ALLOWED_RAW_ID_LINES = [
  'sessionId: localRequest.localSession?.id,',
  'result = await integrations.beginGroupAuthorization({ sessionId: localRequest.localSession?.id, groups });',
  'const result = await integrations.beginAuthorization?.(localRequest.localSession?.id);',
  "if (!localRequest.localSession?.id) return redirectToPanel('error');",
  'await integrations.completeAuthorization({ sessionId: localRequest.localSession.id, code, state });',
];

describe('OPS-31 X1 the session cookie value stays out of persisted data (structural)', () => {
  it('uses `localSession.id` only on the five OAuth lines of queue-routes.mjs', () => {
    const found = [];
    for (const file of files) {
      file.lines.forEach((line, index) => {
        if (/localSession\??\.id\b/.test(line)) found.push({ name: file.name, line: trim(line), number: index + 1 });
      });
    }
    expect(found.map(({ name }) => name).every((name) => name === 'apps/api/src/http/queue-routes.mjs'), JSON.stringify(found)).toBe(true);
    expect(found.map(({ line }) => line)).toEqual(ALLOWED_RAW_ID_LINES);
  });

  it('no actor expression is built from a session id, an id destructuring or the cookie', () => {
    const offenders = [];
    for (const file of files) {
      file.lines.forEach((line, index) => {
        const code = line.replace(/\/\/.*$/, '');
        // `sessionActorId(sessionId)` is the one allowed way to turn a session id into an actor.
        if (/\b(actorId|updatedBy|createdBy|operationKey|actor_id|created_by)\b[^\n]*\bsessionId\b/.test(code.replaceAll(/sessionActorId\([^)]*\)/g, 'DERIVED'))) offenders.push(`${file.name}:${index + 1} ${trim(line)}`);
        if (/\bconst\s*\{[^}]*\bid\b[^}]*\}\s*=\s*[^;]*localSession\b/.test(code)) offenders.push(`${file.name}:${index + 1} ${trim(line)}`);
      });
    }
    expect(offenders).toEqual([]);
  });

  it('only local-session.mjs reads the cookie header or the session table, and `localSession` is touched only by the three route/session modules', () => {
    const cookieReaders = files.filter((file) => file.lines.some((line) => /headers\.cookie|parseCookies|queuebot_session/.test(line))).map(({ name }) => name);
    expect(cookieReaders).toEqual(['apps/api/src/http/local-session.mjs']);
    const sessionUsers = files.filter((file) => file.lines.some((line) => /\blocalSession\b/.test(line))).map(({ name }) => name).sort();
    expect(sessionUsers).toEqual([
      'apps/api/src/http/local-session.mjs', 'apps/api/src/http/localization-routes.mjs', 'apps/api/src/http/queue-routes.mjs',
    ]);
  });

  it('local-session.mjs exposes the derived reference next to the id on both construction sites', () => {
    const source = readFileSync(join(apiSource, 'http', 'local-session.mjs'), 'utf8');
    expect((source.match(/actorId: sessionActorId\(id\)/g) ?? []).length).toBe(2);
  });

  it('every call that records an actor in queue-routes.mjs and localization-routes.mjs uses `localSession.actorId`', () => {
    for (const name of ['queue-routes.mjs', 'localization-routes.mjs']) {
      const lines = readFileSync(join(apiSource, 'http', name), 'utf8').split('\n');
      const actorLines = lines.filter((line) => /\bactorId\s*:|operationKey\s*=/.test(line) && /localSession/.test(line) && !/@type/.test(line));
      expect(actorLines.length, name).toBeGreaterThan(0);
      for (const line of actorLines) expect(line, `${name}: ${trim(line)}`).toMatch(/localSession\??\.actorId/);
    }
  });
});
