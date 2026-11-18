-- OPS-31 P5 (M2b-down): intentionally a no-op. The constraints are dropped (validated or not) and the indexes are dropped
-- with the columns by the M2a rollback (`20261118090000_settlement_model/rollback.sql`), which uses IF EXISTS everywhere so it
-- also works when M2b was never applied. Run M2a-down after this file; delete BOTH rows of `_prisma_migrations`.
SELECT 1;
