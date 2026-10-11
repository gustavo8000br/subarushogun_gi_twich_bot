CREATE INDEX "queues_converted_tombstone_reconcile_idx"
ON "queues" ("id")
WHERE "reward_id" IS NOT NULL
  AND "queue_mode" = 'manual_only'
  AND "lifecycle_status" = 'deleted';
