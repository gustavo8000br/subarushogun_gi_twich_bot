-- OPS-31 P6b (M4, FT-90; design v2.8 section 10 M4, 3.11 A, DB-4, DB-7, DB-9): the live session table, one row per Twitch stream
-- and channel. ONE new table and NO `ALTER` of an existing table: the merge window is a `settings` row (`live_session_policy`,
-- absent = 10 minutes), so there is no column, no backfill and no migration for the setting. No foreign key, trigger, rule or
-- view. Nothing here refers to queues, entries, redemptions or the outbox (invariant LIVE-1). Run with the application stopped.
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

CREATE TABLE "stream_sessions" (
  "broadcaster_id" TEXT NOT NULL,
  "twitch_stream_id" TEXT NOT NULL,
  "stream_session_id" UUID NOT NULL,
  "started_at" TIMESTAMPTZ(3) NOT NULL,
  "ended_at" TIMESTAMPTZ(3),
  "source" TEXT NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT now(),
  -- DB-9: the deduplication key is the primary key; there is no surrogate id.
  CONSTRAINT "stream_sessions_pkey" PRIMARY KEY ("broadcaster_id", "twitch_stream_id"),
  CONSTRAINT "stream_sessions_source_check" CHECK ("source" IN ('event', 'reconciled')),
  CONSTRAINT "stream_sessions_time_order_check" CHECK ("ended_at" IS NULL OR "ended_at" >= "started_at"),
  -- Ids are not assumed to be digits (HYPOTHESIS, design 3.11 A): only a length bound.
  CONSTRAINT "stream_sessions_broadcaster_id_check" CHECK (char_length("broadcaster_id") BETWEEN 1 AND 64),
  CONSTRAINT "stream_sessions_twitch_stream_id_check" CHECK (char_length("twitch_stream_id") BETWEEN 1 AND 64)
);

-- At most one open row per channel (3.11 B 5). The code closes any other open row BEFORE it inserts.
CREATE UNIQUE INDEX "stream_sessions_one_open_per_channel_idx" ON "stream_sessions" ("broadcaster_id") WHERE "ended_at" IS NULL;

-- The lookup of the latest rows of one channel (merge decision, cap window, `liveSession` of `GET /api/state`).
CREATE INDEX "stream_sessions_channel_started_idx" ON "stream_sessions" ("broadcaster_id", "started_at" DESC, "twitch_stream_id" DESC);
