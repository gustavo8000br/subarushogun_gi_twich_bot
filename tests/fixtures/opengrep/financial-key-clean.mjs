// Fixture: reads and lookups that go through the gate helpers are not flagged.
import { findFinancialTask } from '../../../apps/api/src/persistence/financial-gate.mjs';

export function clean(tx, redemptionId) {
  return findFinancialTask(tx, redemptionId);
}
