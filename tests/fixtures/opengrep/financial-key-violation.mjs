// Fixture for tests/unit/financial-gate.test.js: hand-built idempotency key outside the gate (pattern 1). Not application code.
export async function violatingKeyWriter(tx, redemptionId) {
  await tx.outbox.create({ data: { idempotencyKey: `financial:${redemptionId}` } });
}
