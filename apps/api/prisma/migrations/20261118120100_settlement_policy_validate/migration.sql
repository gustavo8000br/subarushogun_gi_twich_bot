-- OPS-31 P5b (M3a, FT-74b; design v2.8 section 10, DB-18): validates the M3 constraint on `redemptions` and builds the
-- partial index the re-entry cap will read in P7. A separate file from M3: the ACCESS EXCLUSIVE of M3's ALTER lasts to the end
-- of its file, so a scan or an index build there would block reads. NOTE: Prisma runs each migration file as one implicit
-- transaction, so this file's VALIDATE (SHARE UPDATE EXCLUSIVE) and the index build (SHARE, writers wait for the scan)
-- share one transaction; "own transaction" refers to this file being separate from M3. The scan cannot fail (every
-- existing row has `refunded_at` NULL) and the index is empty today, so the cost is one scan of `redemptions`.
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

ALTER TABLE "redemptions" VALIDATE CONSTRAINT "redemptions_refund_origin_check";

-- Count of one person's refunds in a window (P7): (queue, person, time) for rows that carry a refund only.
CREATE INDEX "redemptions_refunded_idx" ON "redemptions" ("queue_id", "user_id", "refunded_at")
  WHERE "refunded_at" IS NOT NULL;
