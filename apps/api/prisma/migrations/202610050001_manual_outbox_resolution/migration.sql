ALTER TABLE "outbox" DROP CONSTRAINT "outbox_status_check";
ALTER TABLE "outbox" ADD CONSTRAINT "outbox_status_check"
  CHECK ("status" IN ('pending', 'processing', 'retry', 'confirmed', 'conflict', 'unknown', 'failed', 'cancelled', 'resolved_manual'));
