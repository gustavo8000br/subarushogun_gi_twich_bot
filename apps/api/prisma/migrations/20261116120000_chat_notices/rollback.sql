-- OPS-31 P2 (M1-down). Run only after stopping the application version that sends chat notices.
-- These are chat notices, never money: an old worker must not meet an unknown operation type or status.
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

UPDATE "outbox"
SET "status" = 'cancelled', "last_error" = 'notice_rolled_back', "lease_token" = NULL, "lease_until" = NULL
WHERE "operation_type" = 'chat.notice' AND "status" IN ('pending', 'retry', 'processing');

UPDATE "outbox"
SET "status" = 'cancelled', "last_error" = 'notice_expired_rolled_back'
WHERE "status" = 'expired';

ALTER TABLE "outbox" DROP CONSTRAINT "outbox_status_check";
ALTER TABLE "outbox" ADD CONSTRAINT "outbox_status_check"
  CHECK ("status" IN ('pending', 'processing', 'retry', 'confirmed', 'conflict', 'unknown', 'failed', 'cancelled', 'resolved_manual', 'cancel_verification'));

ALTER TABLE "queues"
  DROP COLUMN "notice_joined",
  DROP COLUMN "notice_service",
  DROP COLUMN "notice_state",
  DROP COLUMN "notice_reordered",
  DROP COLUMN "notice_points";
