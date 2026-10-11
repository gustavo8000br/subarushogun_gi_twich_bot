ALTER TABLE "queues"
  ADD COLUMN "queue_mode" TEXT NOT NULL DEFAULT 'channel_points',
  ADD COLUMN "reward_origin" TEXT NOT NULL DEFAULT 'legacy_unknown',
  ADD COLUMN "mode_transition_status" TEXT NOT NULL DEFAULT 'none';

ALTER TABLE "queues"
  ADD CONSTRAINT "queues_queue_mode_check"
    CHECK ("queue_mode" IN ('channel_points', 'manual_only')),
  ADD CONSTRAINT "queues_reward_origin_check"
    CHECK ("reward_origin" IN ('none', 'bot_created', 'dashboard_existing', 'legacy_unknown')),
  ADD CONSTRAINT "queues_mode_transition_status_check"
    CHECK ("mode_transition_status" IN ('none', 'pending_pause', 'unknown', 'failed', 'confirmed')),
  ADD CONSTRAINT "queues_mode_transition_consistency_check"
    CHECK (
      ("queue_mode" = 'manual_only' AND "mode_transition_status" IN ('none', 'confirmed'))
      OR ("queue_mode" = 'channel_points' AND "mode_transition_status" IN ('none', 'pending_pause', 'unknown', 'failed'))
    ),
  ADD CONSTRAINT "queues_mode_reward_origin_consistency_check"
    CHECK (
      ("queue_mode" = 'channel_points' AND "reward_origin" IN ('bot_created', 'dashboard_existing', 'legacy_unknown'))
      OR ("queue_mode" = 'manual_only' AND "reward_origin" = 'none' AND "reward_id" IS NULL AND "cost" IS NULL)
      OR ("queue_mode" = 'manual_only' AND "reward_origin" IN ('bot_created', 'dashboard_existing', 'legacy_unknown') AND "reward_id" IS NOT NULL)
    );

ALTER TABLE "queues"
  ALTER COLUMN "cost" DROP NOT NULL,
  ADD CONSTRAINT "queues_cost_positive_or_null_check"
    CHECK ("cost" IS NULL OR "cost" > 0),
  ADD CONSTRAINT "queues_mode_cost_consistency_check"
    CHECK (
      ("queue_mode" = 'channel_points' AND "cost" IS NOT NULL)
      OR ("queue_mode" = 'manual_only' AND "reward_origin" = 'none' AND "cost" IS NULL)
      OR ("queue_mode" = 'manual_only' AND "reward_origin" IN ('bot_created', 'dashboard_existing', 'legacy_unknown'))
    );
