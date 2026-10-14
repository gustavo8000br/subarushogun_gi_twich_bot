-- Run only after stopping the application version that uses cancel_verification.
-- Preserve possible Twitch-side effects as unknown; never turn them into a retry.
UPDATE "outbox"
SET "status" = 'unknown',
    "last_error" = 'queue_deletion_cancel_verification_rolled_back',
    "lease_token" = NULL,
    "lease_until" = NULL
WHERE "status" = 'cancel_verification';

ALTER TABLE "outbox" DROP CONSTRAINT "outbox_status_check";
ALTER TABLE "outbox" ADD CONSTRAINT "outbox_status_check"
  CHECK ("status" IN ('pending', 'processing', 'retry', 'confirmed', 'conflict', 'unknown', 'failed', 'cancelled', 'resolved_manual'));
