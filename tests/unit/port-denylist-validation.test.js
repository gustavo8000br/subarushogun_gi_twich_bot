import { describe, expect, it } from 'vitest';
import { runPortDenylistValidation } from '../../apps/infra/scripts/validate-port-denylist.mjs';

describe('port denylist validation command', () => {
  it('scans the framework roots and reports a successful result for this checkout', () => {
    const result = runPortDenylistValidation();

    expect(result.exitCode).toBe(0);
    expect(result.filesScanned).toBeGreaterThan(0);
    expect(result.findings).toEqual([]);
  });

  it('returns a failing exit code when the scanner reports forbidden content', () => {
    const result = runPortDenylistValidation({
      scanner: () => ({ ok: false, filesScanned: 1, findings: [{ file: 'fixture.js', id: 'sinkra-prefix' }] }),
    });

    expect(result.exitCode).toBe(1);
    expect(result.findings).toHaveLength(1);
  });
});
