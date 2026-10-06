import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const require = createRequire(import.meta.url);
const { scanProject } = require('../../../.aiox-core/core/security/port-denylist.js');

/** @typedef {{ ok: boolean, filesScanned: number, findings: Array<{ file: string, line?: number, id?: string }> }} PortDenylistScan */

/**
 * Run the AIOX port-denylist scanner and convert its result to a CLI exit code.
 * @param {{ projectRoot?: string, scanner?: (options: { projectRoot: string }) => PortDenylistScan }} [options]
 */
export function runPortDenylistValidation({ projectRoot = process.cwd(), scanner = scanProject } = {}) {
  const result = scanner({ projectRoot });
  return { ...result, exitCode: result.ok ? 0 : 1 };
}

const scriptPath = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === scriptPath) {
  const result = runPortDenylistValidation();
  console.log(`Port denylist: scanned ${result.filesScanned} files; ${result.findings.length} finding(s).`);
  for (const finding of result.findings) {
    const location = finding.line ? `${finding.file}:${finding.line}` : finding.file;
    console.error(`${location}${finding.id ? ` (${finding.id})` : ''}`);
  }
  process.exitCode = result.exitCode;
}
