-- OPS-31 P5b (M3a-down): intentionally a no-op. The constraint is dropped (validated or not) and the index is dropped with the
-- columns by the M3 rollback (`20261118120000_settlement_policy/rollback.sql`), which uses IF EXISTS everywhere so it also
-- works when M3a was never applied. Run M3-down after this file; delete BOTH rows of `_prisma_migrations`.
SELECT 1;
