import { createStructuredLogger } from './structured-logger.mjs';

const SAFE_ERROR_CODE = /^(?:[A-Z][A-Z0-9_]{1,31}|[a-z][a-z0-9_]{1,63})$/;
const SAFE_IDENTIFIER = /^[A-Za-z][A-Za-z0-9_.-]{0,63}$/;

function safeType(value) {
  return typeof value === 'string' && SAFE_IDENTIFIER.test(value) ? value : 'Error';
}

function safeCode(value) {
  return typeof value === 'string' && SAFE_ERROR_CODE.test(value) ? value : null;
}

/**
 * Emit one-line diagnostics that correlate failures without recording payloads, messages, or stacks.
 * @param {{write?: (line: string) => boolean, clock?: () => Date, idFactory?: () => string, logger?: (event: Record<string, any>) => string|null}} [options]
 * @returns {(event?: {source?: string, error?: Error & {code?: string}, errorType?: string, errorCode?: string}) => string}
 */
export function createErrorDiagnosticReporter({ write = (line) => process.stderr.write(line), clock = () => new Date(), idFactory, logger } = {}) {
  const log = logger ?? createStructuredLogger({ level: process.env.APP_LOG_LEVEL ?? 'info', write, clock, ...(idFactory ? { idFactory } : {}) });
  return (/** @type {{source?: string, error?: Error & {code?: string, status?: number, statusCode?: number}, errorType?: string, errorCode?: string}} */ input = {}) => {
    const { source, error, errorType, errorCode } = input;
    const type = safeType(errorType ?? error?.name);
    const code = safeCode(errorCode ?? error?.code);
    const statusCode = Number.isSafeInteger(error?.statusCode) ? error.statusCode : Number.isSafeInteger(error?.status) ? error.status : undefined;
    const referenceId = log({ event: 'application_error', level: 'error', source, errorType: type, errorCode: code, statusCode });
    return referenceId;
  };
}
