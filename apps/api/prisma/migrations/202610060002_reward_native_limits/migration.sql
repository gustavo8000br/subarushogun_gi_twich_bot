ALTER TABLE "queues"
  ADD COLUMN "max_redemptions_per_stream" INTEGER,
  ADD COLUMN "max_redemptions_per_user_per_stream" INTEGER,
  ADD COLUMN "global_cooldown_seconds" INTEGER;

ALTER TABLE "queues"
  ADD CONSTRAINT "queues_max_redemptions_per_stream_positive_check"
    CHECK ("max_redemptions_per_stream" IS NULL OR "max_redemptions_per_stream" > 0),
  ADD CONSTRAINT "queues_max_redemptions_per_user_per_stream_positive_check"
    CHECK ("max_redemptions_per_user_per_stream" IS NULL OR "max_redemptions_per_user_per_stream" > 0),
  ADD CONSTRAINT "queues_global_cooldown_seconds_positive_check"
    CHECK ("global_cooldown_seconds" IS NULL OR "global_cooldown_seconds" > 0);
