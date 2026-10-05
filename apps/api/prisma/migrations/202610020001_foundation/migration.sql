CREATE SCHEMA IF NOT EXISTS "public";

CREATE TABLE "runtime_state" (
  "key" TEXT NOT NULL PRIMARY KEY,
  "value" JSONB NOT NULL,
  "updated_at" TIMESTAMPTZ(3) NOT NULL
);

CREATE TABLE "queues" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  "slug" TEXT NOT NULL UNIQUE,
  "title" TEXT NOT NULL,
  "reward_prompt" TEXT NOT NULL DEFAULT '',
  "cost" INTEGER NOT NULL CHECK ("cost" > 0),
  "call_message" TEXT NOT NULL DEFAULT '{user}, sua vez!',
  "call_timeout_min" INTEGER DEFAULT 10 CHECK ("call_timeout_min" IS NULL OR "call_timeout_min" BETWEEN 1 AND 120),
  "uid_mode" TEXT NOT NULL DEFAULT 'hidden' CHECK ("uid_mode" IN ('hidden', 'visible')),
  "show_uid_in_list" BOOLEAN NOT NULL DEFAULT FALSE,
  "show_uid_in_overlay" BOOLEAN NOT NULL DEFAULT FALSE,
  "show_uid_on_call" BOOLEAN NOT NULL DEFAULT FALSE,
  "auto_switch_account" BOOLEAN NOT NULL DEFAULT FALSE,
  "refund_if_removed_while_called" BOOLEAN NOT NULL DEFAULT TRUE,
  "refund_on_no_show" BOOLEAN NOT NULL DEFAULT FALSE,
  "refund_if_viewer_leaves_while_called" BOOLEAN NOT NULL DEFAULT FALSE,
  "is_open" BOOLEAN NOT NULL DEFAULT FALSE,
  "is_archived" BOOLEAN NOT NULL DEFAULT FALSE,
  "lifecycle_status" TEXT NOT NULL DEFAULT 'active' CHECK ("lifecycle_status" IN ('active', 'deleting', 'deleted')),
  "remote_sync_status" TEXT NOT NULL DEFAULT 'pending',
  "reward_id" TEXT UNIQUE,
  "version" INTEGER NOT NULL DEFAULT 1 CHECK ("version" > 0),
  "deleted_at" TIMESTAMPTZ(3),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "queue_keys" (
  "key" TEXT NOT NULL PRIMARY KEY,
  "queue_id" UUID NOT NULL REFERENCES "queues"("id") ON DELETE RESTRICT,
  "key_type" TEXT NOT NULL CHECK ("key_type" IN ('slug', 'alias')),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "queue_keys_queue_id_idx" ON "queue_keys"("queue_id");
CREATE UNIQUE INDEX "queue_keys_one_slug_per_queue" ON "queue_keys"("queue_id") WHERE "key_type" = 'slug';

CREATE TABLE "redemptions" (
  "redemption_id" TEXT NOT NULL PRIMARY KEY,
  "broadcaster_id" TEXT NOT NULL,
  "reward_id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "queue_id" UUID REFERENCES "queues"("id") ON DELETE RESTRICT,
  "redeemed_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "remote_status" TEXT NOT NULL DEFAULT 'UNFULFILLED' CHECK ("remote_status" IN ('UNFULFILLED', 'FULFILLED', 'CANCELED')),
  "expected_status" TEXT CHECK ("expected_status" IS NULL OR "expected_status" IN ('FULFILLED', 'CANCELED')),
  "sync_status" TEXT NOT NULL DEFAULT 'observed',
  "rejection_reason" TEXT,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "entries" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  "queue_id" UUID NOT NULL REFERENCES "queues"("id") ON DELETE RESTRICT,
  "twitch_user_id" TEXT NOT NULL,
  "user_login" TEXT NOT NULL,
  "display_name" TEXT NOT NULL,
  "uid" TEXT CHECK ("uid" IS NULL OR "uid" ~ '^[0-9]{9}$'),
  "source" TEXT NOT NULL CHECK ("source" IN ('manual', 'redemption')),
  "redemption_id" TEXT UNIQUE REFERENCES "redemptions"("redemption_id") ON DELETE RESTRICT,
  "status" TEXT NOT NULL DEFAULT 'waiting' CHECK ("status" IN ('waiting', 'called', 'in_progress', 'completed', 'removed', 'no_show')),
  "position" INTEGER CHECK ("position" IS NULL OR "position" > 0),
  "version" INTEGER NOT NULL DEFAULT 1 CHECK ("version" > 0),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "called_at" TIMESTAMPTZ(3),
  "call_notified_at" TIMESTAMPTZ(3),
  "call_deadline_at" TIMESTAMPTZ(3),
  "started_at" TIMESTAMPTZ(3),
  "finished_at" TIMESTAMPTZ(3),
  "terminal_reason" TEXT,
  CONSTRAINT "entries_source_redemption_check" CHECK (("source" = 'manual' AND "redemption_id" IS NULL) OR ("source" = 'redemption' AND "redemption_id" IS NOT NULL))
);
CREATE INDEX "entries_queue_id_status_position_idx" ON "entries"("queue_id", "status", "position");
CREATE INDEX "entries_twitch_user_id_idx" ON "entries"("twitch_user_id");
CREATE UNIQUE INDEX "entries_active_user_per_queue" ON "entries"("queue_id", "twitch_user_id") WHERE "status" IN ('waiting', 'called', 'in_progress');

CREATE TABLE "outbox" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  "operation_type" TEXT NOT NULL,
  "entity_type" TEXT NOT NULL,
  "entity_id" TEXT,
  "idempotency_key" TEXT NOT NULL UNIQUE,
  "payload" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "status" TEXT NOT NULL DEFAULT 'pending' CHECK ("status" IN ('pending', 'processing', 'retry', 'confirmed', 'conflict', 'unknown', 'failed', 'cancelled')),
  "attempts" INTEGER NOT NULL DEFAULT 0 CHECK ("attempts" >= 0),
  "next_attempt_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lease_until" TIMESTAMPTZ(3),
  "last_error" TEXT,
  "entry_id" UUID REFERENCES "entries"("id") ON DELETE RESTRICT,
  "redemption_id" TEXT REFERENCES "redemptions"("redemption_id") ON DELETE RESTRICT,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "outbox_status_next_attempt_at_idx" ON "outbox"("status", "next_attempt_at");

CREATE TABLE "audit_logs" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  "queue_id" UUID REFERENCES "queues"("id") ON DELETE RESTRICT,
  "entry_id" UUID REFERENCES "entries"("id") ON DELETE RESTRICT,
  "redemption_id" TEXT REFERENCES "redemptions"("redemption_id") ON DELETE RESTRICT,
  "event" TEXT NOT NULL,
  "actor_id" TEXT,
  "origin" TEXT NOT NULL,
  "previous_state" TEXT,
  "next_state" TEXT,
  "reason" TEXT,
  "safe_detail" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "audit_logs_created_at_idx" ON "audit_logs"("created_at");

CREATE TABLE "settings" (
  "key" TEXT NOT NULL PRIMARY KEY,
  "value" JSONB NOT NULL,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "oauth_credentials" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  "client_id" TEXT NOT NULL UNIQUE,
  "client_secret" TEXT NOT NULL,
  "access_token" TEXT,
  "refresh_token" TEXT,
  "scopes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "broadcaster_id" TEXT,
  "token_expires_at" TIMESTAMPTZ(3),
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "processed_operations" (
  "operation_key" TEXT NOT NULL PRIMARY KEY,
  "result" JSONB NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
