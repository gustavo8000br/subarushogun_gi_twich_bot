// Fixture for tests/unit/financial-gate.test.js: hand-built financial operation outside the gate (pattern 2). Not application code.
export async function violatingOperationWriter(tx) {
  await tx.outbox.create({ data: { operationType: 'redemption.fulfill' } });
}
