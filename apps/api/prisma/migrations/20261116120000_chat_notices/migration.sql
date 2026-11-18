-- OPS-31 P2 (M1, FT-71): five chat-notice switches per queue and the `expired` outbox status for informational notices.
-- Additive: constant defaults (no table rewrite), existing queues keep every notice OFF, no backfill.
-- Fail fast instead of queueing behind an open transaction (design 10, DB-11); values are measured in the dry-run.
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

ALTER TABLE "queues"
  ADD COLUMN "notice_joined" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "notice_service" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "notice_state" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "notice_reordered" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "notice_points" BOOLEAN NOT NULL DEFAULT false;

-- Re-created from the CURRENT list (resolved_manual and cancel_verification included) plus `expired`.
ALTER TABLE "outbox" DROP CONSTRAINT "outbox_status_check";
ALTER TABLE "outbox" ADD CONSTRAINT "outbox_status_check"
  CHECK ("status" IN ('pending', 'processing', 'retry', 'confirmed', 'conflict', 'unknown', 'failed', 'cancelled', 'resolved_manual', 'cancel_verification', 'expired'));
