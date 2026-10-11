ALTER TABLE "queues"
  ADD COLUMN "reward_stock_before_close" BOOLEAN;

COMMENT ON COLUMN "queues"."reward_stock_before_close" IS
  'Captured Twitch is_in_stock value restored when a managed reward queue is reopened.';
