-- OPS-31 P5 (M2a-down; also removes what M2b built). Run only after stopping the application version that knows settlement.
-- Guard (DE Q7): refuses while the feature holds data that the old code cannot see or that the columns alone carry:
--   a queue in `refund_on_end`, a redemption in a decision state (`held_for_service`, `awaiting_choice`, `check_group`,
--   `settled_external`) or with a stored decision, or a non-empty own list.
-- `intent_recorded` alone does NOT block: since P5 the gate writes it for every ordinary intent and it only repeats what
-- `expected_status` and the outbox row already say, so refusing it would make the down unusable after any served redemption.
-- Order of rollback: M3b, M4, M3a, M3, then this file (M2b-down is a no-op; delete the rows of M2b and M2a from
-- `_prisma_migrations`), then M1.
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "queues" WHERE "settlement" = 'refund_on_end') THEN
    RAISE EXCEPTION 'M2a-down refused: a queue is in refund_on_end' USING ERRCODE = 'P0001';
  END IF;
  IF EXISTS (SELECT 1 FROM "redemptions"
             WHERE "settlement_state" NOT IN ('none', 'intent_recorded') OR "group_decision" IS NOT NULL OR "settlement_cause" IS NOT NULL) THEN
    RAISE EXCEPTION 'M2a-down refused: a redemption holds a settlement decision or state' USING ERRCODE = 'P0001';
  END IF;
  IF EXISTS (SELECT 1 FROM "refund_list_members") THEN
    RAISE EXCEPTION 'M2a-down refused: the own refund list is not empty' USING ERRCODE = 'P0001';
  END IF;
END $$;

DROP TRIGGER IF EXISTS "redemptions_settlement_guard" ON "redemptions";
DROP FUNCTION IF EXISTS "redemptions_settlement_guard"();
DROP INDEX IF EXISTS "redemptions_settled_external_idx";
DROP INDEX IF EXISTS "redemptions_pending_settlement_idx";
ALTER TABLE "redemptions"
  DROP CONSTRAINT IF EXISTS "redemptions_settled_external_check",
  DROP CONSTRAINT IF EXISTS "redemptions_settlement_cause_check",
  DROP CONSTRAINT IF EXISTS "redemptions_settlement_state_check",
  DROP CONSTRAINT IF EXISTS "redemptions_decision_shape_check",
  DROP CONSTRAINT IF EXISTS "redemptions_settlement_values_check";
DROP INDEX IF EXISTS "outbox_financial_redemption_uidx";
DROP TABLE IF EXISTS "refund_list_members";
ALTER TABLE "redemptions"
  DROP COLUMN "settled_external_at",
  DROP COLUMN "settlement_cause",
  DROP COLUMN "group_unknown_reason",
  DROP COLUMN "group_checked_at",
  DROP COLUMN "settlement_mode",
  DROP COLUMN "matched_group",
  DROP COLUMN "group_decision",
  DROP COLUMN "settlement_state";
ALTER TABLE "queues" DROP CONSTRAINT IF EXISTS "queues_settlement_check";
ALTER TABLE "queues"
  DROP COLUMN "refund_group_own_list",
  DROP COLUMN "refund_group_vip",
  DROP COLUMN "refund_group_moderator",
  DROP COLUMN "refund_group_subscriber",
  DROP COLUMN "settlement";
