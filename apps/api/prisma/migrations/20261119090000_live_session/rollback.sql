-- OPS-31 P6b (M4-down). Run only after stopping the application version that knows the live session.
-- Effect: the re-entry cap goes back to the fallback hours window (`reentry_window_hours`); no money state depends on this table.
-- Guard (DB-6 style): refuse while a session is OPEN (a live is being counted; dropping now would move the cap to the fallback in
-- the middle of a live, silently). With the application stopped, an open row left by a crash is closed first by the runbook:
--   UPDATE "stream_sessions" SET "ended_at" = GREATEST("started_at", now()) WHERE "ended_at" IS NULL;
-- The inert `settings` row `live_session_policy` (if any) stays on purpose. Order of rollback: M3b, then this file, then M3a (no-op),
-- M3, M2b (no-op), M2a, M1; delete the migration row from `_prisma_migrations` afterwards.
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

DO $$
BEGIN
  -- Nested IFs on purpose: PL/pgSQL plans a statement only when it runs, while one `AND` condition would reference a missing table.
  IF to_regclass(format('%I.%I', current_schema(), 'stream_sessions')) IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM "stream_sessions" WHERE "ended_at" IS NULL) THEN
      RAISE EXCEPTION 'M4-down refused: a live session is open' USING ERRCODE = '55000';
    END IF;
  END IF;
END $$;

DROP TABLE IF EXISTS "stream_sessions";
