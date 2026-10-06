ALTER TABLE "entries"
  ADD COLUMN "priority_class" TEXT NOT NULL DEFAULT 'standard',
  ADD COLUMN "priority_reason" TEXT;

ALTER TABLE "entries"
  ADD CONSTRAINT "entries_priority_class_check"
  CHECK ("priority_class" IN ('priority', 'standard')),
  ADD CONSTRAINT "entries_priority_reason_check"
  CHECK ("priority_reason" IS NULL OR "priority_reason" IN ('subscription', 'bits', 'external_payment', 'operator_override')),
  ADD CONSTRAINT "entries_priority_reason_consistency_check"
  CHECK (("priority_class" = 'priority' AND "priority_reason" IS NOT NULL) OR ("priority_class" = 'standard' AND "priority_reason" IS NULL));

CREATE INDEX "entries_queue_status_priority_position_idx"
  ON "entries"("queue_id", "status", "priority_class", "position");
