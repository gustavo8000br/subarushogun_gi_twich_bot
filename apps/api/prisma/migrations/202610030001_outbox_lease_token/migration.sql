ALTER TABLE "outbox"
ADD COLUMN "lease_token" UUID;

ALTER TABLE "oauth_credentials"
ADD COLUMN "auth_status" TEXT NOT NULL DEFAULT 'pending'
CHECK ("auth_status" IN ('pending', 'connected', 'reconnect_required'));
