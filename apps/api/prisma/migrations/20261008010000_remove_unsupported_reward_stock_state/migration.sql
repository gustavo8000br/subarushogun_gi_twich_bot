-- Twitch Helix returns is_in_stock but does not accept it in Update Custom Reward.
-- Queue lifecycle confirmation must use the documented writable is_paused field.
ALTER TABLE "queues" DROP COLUMN IF EXISTS "reward_stock_before_close";
