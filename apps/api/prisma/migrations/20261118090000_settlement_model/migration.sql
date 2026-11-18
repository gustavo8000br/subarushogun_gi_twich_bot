-- OPS-31 P5 (M2a, FT-74; design v2.8 section 10, DB-1, DB-2, DB-12..DB-14, DB-18, DB-20): settlement model.
-- Additive: constant defaults (no table rewrite), nullable columns, no backfill. Existing rows stay `fulfill_on_start`,
-- state `none`, every decision column NULL. Every constraint on `redemptions` is added NOT VALID (new rows are checked from
-- now on) and validated by M2b in its own transaction; the non-unique indexes on `redemptions` are built by M2b (DB-18).
-- Run with the application stopped. Fail fast instead of queueing behind an open transaction (DB-11).
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

-- queues: the setting and the four refund groups (the streamer is always a member, no column).
ALTER TABLE "queues"
  ADD COLUMN "settlement" TEXT NOT NULL DEFAULT 'fulfill_on_start',
  ADD COLUMN "refund_group_subscriber" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "refund_group_moderator" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "refund_group_vip" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "refund_group_own_list" BOOLEAN NOT NULL DEFAULT false;
-- `queues` has few rows: a plain constraint (DB-19).
ALTER TABLE "queues" ADD CONSTRAINT "queues_settlement_check" CHECK ("settlement" IN ('fulfill_on_start', 'refund_on_end'));

-- redemptions: decision, state, cause and external-settlement time.
ALTER TABLE "redemptions"
  ADD COLUMN "settlement_state" TEXT NOT NULL DEFAULT 'none',
  ADD COLUMN "group_decision" TEXT,
  ADD COLUMN "matched_group" TEXT,
  ADD COLUMN "settlement_mode" TEXT,
  ADD COLUMN "group_checked_at" TIMESTAMPTZ(3),
  ADD COLUMN "group_unknown_reason" TEXT,
  ADD COLUMN "settlement_cause" TEXT,
  ADD COLUMN "settled_external_at" TIMESTAMPTZ(3);

-- Closed sets (DB-20: six states).
ALTER TABLE "redemptions" ADD CONSTRAINT "redemptions_settlement_values_check" CHECK (
  "settlement_state" IN ('none', 'held_for_service', 'awaiting_choice', 'check_group', 'intent_recorded', 'settled_external')
  AND ("group_decision" IS NULL OR "group_decision" IN ('eligible', 'not_eligible', 'unknown'))
  AND ("matched_group" IS NULL OR "matched_group" IN ('broadcaster', 'own_list', 'moderator', 'vip', 'subscriber'))
  AND ("settlement_mode" IS NULL OR "settlement_mode" IN ('fulfill_on_start', 'refund_on_end'))
  AND ("group_unknown_reason" IS NULL OR "group_unknown_reason" IN
    ('scope_missing', 'unauthorized', 'forbidden', 'rate_limited', 'twitch_unavailable', 'timeout', 'malformed_response', 'channel_not_eligible', 'lookup_error'))
) NOT VALID;

-- Shape of the persisted decision: all or nothing; `matched_group` only when eligible; the reason only when unknown.
ALTER TABLE "redemptions" ADD CONSTRAINT "redemptions_decision_shape_check" CHECK (
  ("group_decision" IS NULL AND "matched_group" IS NULL AND "group_unknown_reason" IS NULL
     AND "group_checked_at" IS NULL AND "settlement_mode" IS NULL)
  OR ("group_decision" IS NOT NULL AND "group_checked_at" IS NOT NULL AND "settlement_mode" IS NOT NULL
     AND ("matched_group" IS NOT NULL) = ("group_decision" = 'eligible')
     AND ("group_unknown_reason" IS NOT NULL) = ("group_decision" = 'unknown'))
) NOT VALID;

-- State against the facts (DB-1, final form). `IS NOT DISTINCT FROM` keeps a NULL decision from passing by accident.
--   held_for_service: eligible decision, no intent, remote UNFULFILLED.
--   awaiting_choice : no intent, remote UNFULFILLED (any decision, including NULL or not_eligible).
--   check_group     : unknown decision, no intent, remote UNFULFILLED.
--   intent_recorded : the intent exists (expected_status is the single-table witness).
--   settled_external: no intent, remote already terminal.
ALTER TABLE "redemptions" ADD CONSTRAINT "redemptions_settlement_state_check" CHECK (
  ("settlement_state" <> 'held_for_service'
     OR ("group_decision" IS NOT DISTINCT FROM 'eligible' AND "expected_status" IS NULL AND "remote_status" = 'UNFULFILLED'))
  AND ("settlement_state" <> 'awaiting_choice'
     OR ("expected_status" IS NULL AND "remote_status" = 'UNFULFILLED'))
  AND ("settlement_state" <> 'check_group'
     OR ("group_decision" IS NOT DISTINCT FROM 'unknown' AND "expected_status" IS NULL AND "remote_status" = 'UNFULFILLED'))
  AND ("settlement_state" <> 'intent_recorded' OR "expected_status" IS NOT NULL)
  AND ("settlement_state" <> 'settled_external'
     OR ("expected_status" IS NULL AND "remote_status" IN ('FULFILLED', 'CANCELED')))
) NOT VALID;

-- DB-12 (strict form, six causes): a cause exactly while the row is in `awaiting_choice`.
ALTER TABLE "redemptions" ADD CONSTRAINT "redemptions_settlement_cause_check" CHECK (
  ("settlement_cause" IS NULL OR "settlement_cause" IN
    ('policy_wait', 'cannot_ask', 'chat_clear', 'legacy_residue', 'reentry_cap', 'batch_deferred'))
  AND (("settlement_state" = 'awaiting_choice') = ("settlement_cause" IS NOT NULL))
) NOT VALID;

-- DB-13: the external-settlement time exactly when the state says so.
ALTER TABLE "redemptions" ADD CONSTRAINT "redemptions_settled_external_check" CHECK (
  ("settlement_state" = 'settled_external') = ("settled_external_at" IS NOT NULL)
) NOT VALID;

-- One financial task per redemption (DE Q3). The probe fails loudly instead of building the index over a duplicate.
-- Every writer builds `financial:{redemptionId}`, whose UNIQUE key already forbids two rows, so none is expected.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "outbox"
    WHERE "operation_type" IN ('redemption.cancel', 'redemption.fulfill') AND "redemption_id" IS NOT NULL
    GROUP BY "redemption_id" HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'M2a refused: a redemption has more than one financial outbox row' USING ERRCODE = '23505';
  END IF;
END $$;
CREATE UNIQUE INDEX "outbox_financial_redemption_uidx" ON "outbox" ("redemption_id")
  WHERE "operation_type" IN ('redemption.cancel', 'redemption.fulfill');

-- The own refund list: one per channel (D-31-7), numeric Twitch id only plus an optional label (max 40, design 12).
CREATE TABLE "refund_list_members" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "twitch_user_id" TEXT NOT NULL,
  "label" TEXT,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT now(),
  "created_by" TEXT,
  CONSTRAINT "refund_list_members_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "refund_list_members_twitch_user_id_key" UNIQUE ("twitch_user_id"),
  CONSTRAINT "refund_list_members_twitch_user_id_check" CHECK ("twitch_user_id" ~ '^[0-9]{1,20}$'),
  CONSTRAINT "refund_list_members_label_check" CHECK ("label" IS NULL OR char_length("label") BETWEEN 1 AND 40)
);

-- Guard trigger, last statement (final form): the two terminal states are absorbing, a conclusive decision never changes,
-- and the external-settlement time is immutable once set. The application still uses guarded updates; this is the net.
CREATE FUNCTION "redemptions_settlement_guard"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.settlement_state IN ('intent_recorded', 'settled_external')
     AND NEW.settlement_state <> OLD.settlement_state THEN
    RAISE EXCEPTION 'settlement_state % is absorbing', OLD.settlement_state USING ERRCODE = '23514';
  END IF;
  IF OLD.group_decision IN ('eligible', 'not_eligible')
     AND NEW.group_decision IS DISTINCT FROM OLD.group_decision THEN
    RAISE EXCEPTION 'conclusive group_decision is immutable' USING ERRCODE = '23514';
  END IF;
  IF OLD.settled_external_at IS NOT NULL
     AND NEW.settled_external_at IS DISTINCT FROM OLD.settled_external_at THEN
    RAISE EXCEPTION 'settled_external_at is immutable once set' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "redemptions_settlement_guard" BEFORE UPDATE OF "settlement_state", "group_decision", "settled_external_at"
  ON "redemptions" FOR EACH ROW EXECUTE FUNCTION "redemptions_settlement_guard"();
