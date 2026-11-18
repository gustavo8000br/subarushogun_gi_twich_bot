-- OPS-31 P5b (M3, FT-74b; design v2.8 section 10, 3.10, 3.15, 3.16, DB-3, DB-6, DB-19, DB-21): per-queue settlement policy
-- and the refund timestamp/origin used later by the re-entry cap.
-- Additive: constant defaults (no table rewrite), nullable columns, no backfill. Every existing queue reads S1 `legacy`
-- (today's behavior); S1 stays `legacy` as the database default until P7 ships its own `SET DEFAULT 'wait'` migration (M3b).
-- No M2 column is referenced here (the coupling is semantic only), so this file also applies without M2.
-- The constraint on `redemptions` is added NOT VALID (new rows are checked from now on) and validated by M3a in its own
-- transaction; the index on `redemptions` is built by M3a (DB-18). Run with the application stopped.
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

-- queues: one ALTER, metadata only (S1..S4, S5 with its window, the revision and the two cap behaviors).
ALTER TABLE "queues"
  ADD COLUMN "settlement_on_close_switch_off" TEXT NOT NULL DEFAULT 'legacy',
  ADD COLUMN "settlement_on_direct_conclusion" TEXT NOT NULL DEFAULT 'wait',
  ADD COLUMN "settlement_on_moderator_conclude" TEXT NOT NULL DEFAULT 'wait',
  ADD COLUMN "settlement_on_chat_clear" TEXT NOT NULL DEFAULT 'wait',
  ADD COLUMN "reentry_refund_cap" SMALLINT,
  ADD COLUMN "reentry_window_hours" SMALLINT NOT NULL DEFAULT 12,
  ADD COLUMN "settlement_policy_rev" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "reentry_cap_hold" TEXT NOT NULL DEFAULT 'after_n',
  ADD COLUMN "reentry_cap_counts_manual" BOOLEAN NOT NULL DEFAULT true;

-- `queues` has few rows: plain constraints (DB-19). Closed sets and ranges, one constraint each.
ALTER TABLE "queues" ADD CONSTRAINT "queues_settlement_on_close_switch_off_check"
  CHECK ("settlement_on_close_switch_off" IN ('legacy', 'wait', 'fulfill', 'refund'));
ALTER TABLE "queues" ADD CONSTRAINT "queues_settlement_on_direct_conclusion_check"
  CHECK ("settlement_on_direct_conclusion" IN ('wait', 'refund', 'fulfill'));
ALTER TABLE "queues" ADD CONSTRAINT "queues_settlement_on_moderator_conclude_check"
  CHECK ("settlement_on_moderator_conclude" IN ('wait', 'refund'));
ALTER TABLE "queues" ADD CONSTRAINT "queues_settlement_on_chat_clear_check"
  CHECK ("settlement_on_chat_clear" IN ('wait', 'refund', 'fulfill'));
ALTER TABLE "queues" ADD CONSTRAINT "queues_reentry_refund_cap_check"
  CHECK ("reentry_refund_cap" IS NULL OR "reentry_refund_cap" BETWEEN 1 AND 20);
ALTER TABLE "queues" ADD CONSTRAINT "queues_reentry_window_hours_check"
  CHECK ("reentry_window_hours" BETWEEN 1 AND 72);
ALTER TABLE "queues" ADD CONSTRAINT "queues_settlement_policy_rev_check" CHECK ("settlement_policy_rev" >= 0);
ALTER TABLE "queues" ADD CONSTRAINT "queues_reentry_cap_hold_check" CHECK ("reentry_cap_hold" IN ('after_n', 'at_n'));

-- redemptions: when a refund was requested and by whom (the streamer by hand, or the product by a rule). Both NULL until P7.
ALTER TABLE "redemptions"
  ADD COLUMN "refunded_at" TIMESTAMPTZ(3),
  ADD COLUMN "refund_origin" TEXT;
-- Joint nullness plus the closed set; NOT VALID here, VALIDATE in M3a. No row has `refunded_at` yet, so it holds by construction.
ALTER TABLE "redemptions" ADD CONSTRAINT "redemptions_refund_origin_check" CHECK (
  ("refund_origin" IS NULL) = ("refunded_at" IS NULL)
  AND ("refund_origin" IS NULL OR "refund_origin" IN ('automatic', 'streamer'))
) NOT VALID;

-- DB-21: a refund is never rewritten. Separate from the M2 guard so M3 never redefines that function. The one allowed
-- change is both columns returning to NULL together (the 72 h nulling job); the CHECK above already forces them joint.
CREATE FUNCTION "redemptions_refund_guard"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.refunded_at IS NOT NULL AND NEW.refunded_at IS NOT NULL
     AND NEW.refunded_at IS DISTINCT FROM OLD.refunded_at THEN
    RAISE EXCEPTION 'refunded_at is immutable once set' USING ERRCODE = '23514';
  END IF;
  IF OLD.refund_origin IS NOT NULL AND NEW.refund_origin IS NOT NULL
     AND NEW.refund_origin <> OLD.refund_origin THEN
    RAISE EXCEPTION 'refund_origin is immutable once set' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "redemptions_refund_guard" BEFORE UPDATE OF "refunded_at", "refund_origin"
  ON "redemptions" FOR EACH ROW EXECUTE FUNCTION "redemptions_refund_guard"();
