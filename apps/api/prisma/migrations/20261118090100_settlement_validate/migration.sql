-- OPS-31 P5 (M2b, FT-74; design v2.8 section 10, DB-2, DB-18): validates the five M2a constraints and builds the
-- non-unique indexes on `redemptions`. A separate file so that each VALIDATE runs in its own transaction and takes only
-- SHARE UPDATE EXCLUSIVE (it does not block reads or writes); it cannot fail on existing rows (state `none`, new columns NULL).
-- The index builds take SHARE once (writers wait for the scan), which is why they are here and not in M2a.
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

ALTER TABLE "redemptions" VALIDATE CONSTRAINT "redemptions_settlement_values_check";
ALTER TABLE "redemptions" VALIDATE CONSTRAINT "redemptions_decision_shape_check";
ALTER TABLE "redemptions" VALIDATE CONSTRAINT "redemptions_settlement_state_check";
ALTER TABLE "redemptions" VALIDATE CONSTRAINT "redemptions_settlement_cause_check";
ALTER TABLE "redemptions" VALIDATE CONSTRAINT "redemptions_settled_external_check";

-- Pending decisions by queue (panel list, deletion blocker, card count).
CREATE INDEX "redemptions_pending_settlement_idx" ON "redemptions" ("queue_id", "redeemed_at", "redemption_id")
  WHERE "settlement_state" IN ('held_for_service', 'awaiting_choice', 'check_group');
-- Last settled-outside-the-product rows, deterministic order (DB-14).
CREATE INDEX "redemptions_settled_external_idx" ON "redemptions" ("queue_id", "settled_external_at" DESC, "redemption_id" DESC)
  WHERE "settlement_state" = 'settled_external';
