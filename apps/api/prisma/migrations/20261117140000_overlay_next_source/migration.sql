-- OPS-31 P4 (FT-73, AC 8): one more OBS widget source, `next_waiting_viewer_display_name` (queue-scoped).
-- Only the two CHECK constraints of `overlay_widgets` change; no column, no data rewrite, no backfill.
-- Fail fast instead of queueing behind an open transaction (design 10, DB-11); the table is tiny (widgets of one streamer).
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

ALTER TABLE "overlay_widgets" DROP CONSTRAINT "overlay_widgets_source_type_check";
ALTER TABLE "overlay_widgets" ADD CONSTRAINT "overlay_widgets_source_type_check" CHECK ("source_type" IN (
    'account_label',
    'queue_name',
    'queue_state',
    'queue_waiting_count',
    'next_waiting_viewer_display_name',
    'called_viewer_display_name',
    'called_viewer_position',
    'in_service_viewer_display_name',
    'fixed_text'
));

ALTER TABLE "overlay_widgets" DROP CONSTRAINT "overlay_widgets_source_scope_check";
ALTER TABLE "overlay_widgets" ADD CONSTRAINT "overlay_widgets_source_scope_check" CHECK (
    ("source_type" = 'fixed_text' AND "fixed_text" IS NOT NULL AND "queue_id" IS NULL)
    OR
    ("source_type" <> 'fixed_text' AND "fixed_text" IS NULL AND
        (("source_type" IN ('queue_name', 'queue_state', 'queue_waiting_count', 'next_waiting_viewer_display_name') AND "queue_id" IS NOT NULL)
        OR ("source_type" IN ('account_label', 'called_viewer_display_name', 'called_viewer_position', 'in_service_viewer_display_name') AND "queue_id" IS NULL)))
);
