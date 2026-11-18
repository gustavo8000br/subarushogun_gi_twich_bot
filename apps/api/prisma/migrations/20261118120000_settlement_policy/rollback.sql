-- OPS-31 P5b (M3-down; also removes what M3a built). Run only after stopping the application version that knows the policy.
-- Guard (DB-6): refuse while the feature holds data that dropping the columns would silently change: a redemption with a
-- refund timestamp, a redemption waiting for a decision (`held_for_service`, `awaiting_choice`, `check_group`) or a queue in
-- `refund_on_end`. Without it every non-legacy queue would read `legacy` again while the M2 states remain.
-- The M2 columns are looked up in the catalog, so the guard also works when M2 was already reverted (out of order).
-- Order of rollback: M3b, M4, M3a (no-op), then this file, then M2b (no-op) and M2a, then M1; delete the rows of M3a and M3
-- from `_prisma_migrations`.
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "redemptions" WHERE "refunded_at" IS NOT NULL) THEN
    RAISE EXCEPTION 'M3-down refused: a redemption carries a refund timestamp' USING ERRCODE = '55000';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'redemptions' AND column_name = 'settlement_state') THEN
    IF EXISTS (SELECT 1 FROM "redemptions" WHERE "settlement_state" IN ('held_for_service', 'awaiting_choice', 'check_group')) THEN
      RAISE EXCEPTION 'M3-down refused: a redemption is waiting for a settlement decision' USING ERRCODE = '55000';
    END IF;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'queues' AND column_name = 'settlement') THEN
    IF EXISTS (SELECT 1 FROM "queues" WHERE "settlement" = 'refund_on_end') THEN
      RAISE EXCEPTION 'M3-down refused: a queue is in refund_on_end' USING ERRCODE = '55000';
    END IF;
  END IF;
END $$;

DROP TRIGGER IF EXISTS "redemptions_refund_guard" ON "redemptions"; -- before the columns: its UPDATE OF list depends on them
DROP FUNCTION IF EXISTS "redemptions_refund_guard"();
DROP INDEX IF EXISTS "redemptions_refunded_idx";
ALTER TABLE "redemptions"
  DROP CONSTRAINT IF EXISTS "redemptions_refund_origin_check",
  DROP COLUMN IF EXISTS "refund_origin",
  DROP COLUMN IF EXISTS "refunded_at";
ALTER TABLE "queues"
  DROP CONSTRAINT IF EXISTS "queues_reentry_cap_hold_check",
  DROP CONSTRAINT IF EXISTS "queues_settlement_policy_rev_check",
  DROP CONSTRAINT IF EXISTS "queues_reentry_window_hours_check",
  DROP CONSTRAINT IF EXISTS "queues_reentry_refund_cap_check",
  DROP CONSTRAINT IF EXISTS "queues_settlement_on_chat_clear_check",
  DROP CONSTRAINT IF EXISTS "queues_settlement_on_moderator_conclude_check",
  DROP CONSTRAINT IF EXISTS "queues_settlement_on_direct_conclusion_check",
  DROP CONSTRAINT IF EXISTS "queues_settlement_on_close_switch_off_check",
  DROP COLUMN IF EXISTS "reentry_cap_counts_manual",
  DROP COLUMN IF EXISTS "reentry_cap_hold",
  DROP COLUMN IF EXISTS "settlement_policy_rev",
  DROP COLUMN IF EXISTS "reentry_window_hours",
  DROP COLUMN IF EXISTS "reentry_refund_cap",
  DROP COLUMN IF EXISTS "settlement_on_chat_clear",
  DROP COLUMN IF EXISTS "settlement_on_moderator_conclude",
  DROP COLUMN IF EXISTS "settlement_on_direct_conclusion",
  DROP COLUMN IF EXISTS "settlement_on_close_switch_off";
